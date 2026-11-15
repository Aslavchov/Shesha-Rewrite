import type { Outline, OutlineNode } from "./model/schema"
import { type Position, ROOT_REGION } from "./model/tree"

/**
 * Where things are on the canvas, and which place a point is over.
 *
 * The canvas shows the real form, untouched. What the designer needs to know
 * about it is geometry: the box of every instance and of every region. Those
 * are measured from the DOM (`canvas-measure.ts`) into a `CanvasLayout`, and
 * everything else here is arithmetic on that snapshot, with no DOM in sight.
 */

export type Box = {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** Which way a region lays its instances out. */
export type Axis = "vertical" | "horizontal"

export type RegionLayout = {
  readonly box: Box
  readonly axis: Axis
  /** The drop target the region shows while it holds nothing. */
  readonly empty: Box | null
}

/** The boxes of one rendered form, all in the same coordinates. */
export type CanvasLayout = {
  /** Instance id to the box the instance draws. */
  readonly items: ReadonlyMap<string, Box>
  /** `regionKey` to the region's layout. */
  readonly regions: ReadonlyMap<string, RegionLayout>
}

export const EMPTY_LAYOUT: CanvasLayout = { items: new Map(), regions: new Map() }

export const regionKey = (parent: string | null, name: string) => `${parent ?? ""}/${name}`

/** A place the pointer is over. */
export type CanvasPlace = {
  /** Where an instance would go, counting every instance on screen. */
  readonly position: Position
  /** A line between two instances, or a box around the drop target of an empty region. */
  readonly indicator: { readonly shape: "line" | "box"; readonly box: Box }
  /** The box of the region the position is in. Null for the form's own list. */
  readonly region: Box | null
}

/** How close to a container's edge the pointer means "next to it", not "inside it". */
export const EDGE_ZONE = 6
/** How far from an instance the indicator is drawn where it has no neighbour on that side. */
const LINE_OFFSET = 4
const LINE_THICKNESS = 2

const right = (box: Box) => box.left + box.width
const bottom = (box: Box) => box.top + box.height
const contains = (box: Box, x: number, y: number) =>
  x >= box.left && x <= right(box) && y >= box.top && y <= bottom(box)
const centre = (box: Box, axis: Axis) =>
  axis === "vertical" ? box.top + box.height / 2 : box.left + box.width / 2
const along = (axis: Axis, x: number, y: number) => (axis === "vertical" ? y : x)

function distance(box: Box, x: number, y: number): number {
  const dx = Math.max(box.left - x, 0, x - right(box))
  const dy = Math.max(box.top - y, 0, y - bottom(box))
  return Math.hypot(dx, dy)
}

/** One region with everything needed to place something in it. */
type Region = {
  readonly parent: OutlineNode | null
  readonly name: string
  readonly children: readonly OutlineNode[]
  readonly layout: RegionLayout
}

export function locateOnCanvas(
  layout: CanvasLayout,
  outline: Outline,
  x: number,
  y: number,
): CanvasPlace | null {
  function region(parent: OutlineNode | null, name: string): Region | null {
    const found = layout.regions.get(regionKey(parent?.instance.id ?? null, name))
    if (!found) return null
    const children = parent
      ? parent.regions.find((candidate) => candidate.name === name && candidate.shown)?.children
      : outline.roots
    return children ? { parent, name, children, layout: found } : null
  }

  const regionAround = (node: OutlineNode) => region(node.parent, node.position.region)
  const regionsInside = (node: OutlineNode) =>
    node.regions
      .filter((inner) => inner.shown)
      .map((inner) => region(node, inner.name))
      .filter((inner) => inner !== null)

  /** The innermost instance the point is on. Later instances are drawn over earlier ones. */
  function hit(nodes: readonly OutlineNode[]): OutlineNode | null {
    for (const node of nodes.toReversed()) {
      const box = layout.items.get(node.instance.id)
      if (!box || !contains(box, x, y)) continue
      for (const inner of regionsInside(node)) {
        const deeper = hit(inner.children)
        if (deeper) return deeper
      }
      return node
    }
    return null
  }

  /** The index the point is at in a region: before or after the instance nearest to it. */
  function indexIn(target: Region): number {
    let nearest: { index: number; box: Box; away: number } | null = null
    for (const [index, child] of target.children.entries()) {
      const box = layout.items.get(child.instance.id)
      if (!box) continue
      const away = distance(box, x, y)
      if (!nearest || away < nearest.away) nearest = { index, box, away }
    }
    if (!nearest) return 0
    const { axis } = target.layout
    return along(axis, x, y) < centre(nearest.box, axis) ? nearest.index : nearest.index + 1
  }

  type Place = { readonly region: Region; readonly index: number }

  function innermostPlace(): Place | null {
    const node = hit(outline.roots)
    if (!node) {
      // Beside the form, or between its top-level instances.
      const root = region(null, ROOT_REGION)
      return root && { region: root, index: indexIn(root) }
    }

    const inside = regionsInside(node)
    if (inside.length > 0) {
      // On a container, but on none of its instances: its nearest region.
      const nearest = inside.reduce((best, candidate) =>
        distance(candidate.layout.box, x, y) < distance(best.layout.box, x, y) ? candidate : best,
      )
      return { region: nearest, index: indexIn(nearest) }
    }

    // On an instance that holds nothing: before it or after it.
    const around = regionAround(node)
    const box = layout.items.get(node.instance.id)
    if (!around || !box) return null
    const { axis } = around.layout
    const after = along(axis, x, y) >= centre(box, axis)
    return { region: around, index: node.position.index + (after ? 1 : 0) }
  }

  /**
   * Right at the edge of a container, a drop goes next to the container
   * rather than into it. Without this, a container whose content reaches its
   * edge would leave no way to drop just above or below it.
   *
   * When several containers share that edge, the zone is split between them:
   * the outermost is nearest the edge.
   */
  function atContainerEdge(place: Place): Place {
    const owner = place.region.parent
    const ownerBox = owner && layout.items.get(owner.instance.id)
    const around = owner && regionAround(owner)
    if (!owner || !ownerBox || !around) return place

    const { axis } = around.layout
    const start = (box: Box) => (axis === "vertical" ? box.top : box.left)
    const end = (box: Box) => (axis === "vertical" ? bottom(box) : right(box))
    const point = along(axis, x, y)
    const fromStart = point - start(ownerBox)
    const fromEnd = end(ownerBox) - point
    const inset = Math.min(fromStart, fromEnd)
    if (inset >= EDGE_ZONE) return place
    const side = fromStart <= fromEnd ? "before" : "after"
    const edge = side === "before" ? start : end

    // The containers around the owner whose edge is this same edge.
    const sharing = [{ node: owner, region: around }]
    for (let node = owner.parent; node; node = node.parent) {
      const box = layout.items.get(node.instance.id)
      const outer = regionAround(node)
      if (!box || !outer) break
      if (outer.layout.axis !== axis || Math.abs(edge(box) - edge(ownerBox)) > 1) break
      sharing.push({ node, region: outer })
    }

    const band = EDGE_ZONE / sharing.length
    const levelsIn = Math.min(sharing.length - 1, Math.max(0, Math.floor(inset / band)))
    const target = sharing[sharing.length - 1 - levelsIn]
    return {
      region: target.region,
      index: target.node.position.index + (side === "after" ? 1 : 0),
    }
  }

  function indicator(place: Place): CanvasPlace["indicator"] | null {
    const { children, layout: regionLayout } = place.region
    if (children.length === 0) {
      return regionLayout.empty ? { shape: "box", box: regionLayout.empty } : null
    }
    const boxAt = (index: number) => {
      const child = children[index]
      return (child && layout.items.get(child.instance.id)) ?? null
    }
    const before = boxAt(place.index - 1)
    const after = boxAt(place.index)
    const outer = regionLayout.box

    if (regionLayout.axis === "vertical") {
      const lineY =
        before && after
          ? (bottom(before) + after.top) / 2
          : after
            ? after.top - LINE_OFFSET
            : before
              ? bottom(before) + LINE_OFFSET
              : null
      if (lineY === null) return null
      return {
        shape: "line",
        box: {
          left: outer.left,
          top: lineY - LINE_THICKNESS / 2,
          width: outer.width,
          height: LINE_THICKNESS,
        },
      }
    }

    // A row may wrap, so the neighbour on the other side can be on another line.
    const sameLine = before && after && after.left >= right(before)
    const beside = sameLine || !before ? after : before
    if (!beside) return null
    const lineX = sameLine
      ? (right(before) + after.left) / 2
      : beside === after
        ? after.left - LINE_OFFSET
        : right(beside) + LINE_OFFSET
    return {
      shape: "line",
      box: {
        left: lineX - LINE_THICKNESS / 2,
        top: beside.top,
        width: LINE_THICKNESS,
        height: beside.height,
      },
    }
  }

  const innermost = innermostPlace()
  if (!innermost) return null
  const place = atContainerEdge(innermost)
  const shape = indicator(place)
  if (!shape) return null

  return {
    position: {
      parent: place.region.parent?.instance.id ?? null,
      region: place.region.name,
      index: place.index,
    },
    indicator: shape,
    region: place.region.parent ? place.region.layout.box : null,
  }
}

/** Moves a box by an offset: from one coordinate system to another. */
export const shift = (box: Box, dx: number, dy: number): Box => ({
  ...box,
  left: box.left + dx,
  top: box.top + dy,
})

export const sameBox = (a: Box, b: Box) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
