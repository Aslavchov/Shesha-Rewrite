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
  /**
   * Inside the region's padding: where its edge is drawn from, so that the
   * edge stays inside a container that pads its content (a Card, Phase 4).
   * The same as `box` when the region has no padding, or in tests.
   */
  readonly inner?: Box
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

export type Size = { readonly width: number; readonly height: number }

/** How far from its part a name tag is drawn: right outside the part's outline. */
export const TAG_GAP = 4

/** What is around a part that is pointed at, in the part's coordinates. */
export type TagSurroundings = {
  /**
   * What the tag must not cover: the other parts of the same instance (the
   * control, when the label is pointed at) and the instance's name badge.
   */
  readonly keepClear: readonly Box[]
  /** What it should rather not cover, when it has the choice: the instances around. */
  readonly ratherClear?: readonly Box[]
  /** Where there is room to draw at all: the paper, or the preview's page. */
  readonly within: Box
}

/** The area two boxes share. */
function overlap(a: Box, b: Box): number {
  const width = Math.min(right(a), right(b)) - Math.max(a.left, b.left)
  const height = Math.min(bottom(a), bottom(b)) - Math.max(a.top, b.top)
  return width > 0 && height > 0 ? width * height : 0
}

/**
 * Where the name tag of a part that is pointed at goes (Phase 5, section 8).
 *
 * Always outside the part, so it never covers what it names. Around it, the
 * first of these places that covers nothing it must keep clear and nothing
 * it would rather keep clear: above the part at its end (where a label never
 * is), below it at its end, above and below at its start, then beside it,
 * after and before. When no place is free: one that is on the paper, that
 * covers least of what must stay clear, then least of the rest.
 */
export function placeTag(part: Box, tag: Size, around: TagSurroundings): Box {
  const above = part.top - TAG_GAP - tag.height
  const below = bottom(part) + TAG_GAP
  const atEnd = right(part) - tag.width
  const places: Box[] = [
    { left: atEnd, top: above, ...tag },
    { left: atEnd, top: below, ...tag },
    { left: part.left, top: above, ...tag },
    { left: part.left, top: below, ...tag },
    { left: right(part) + TAG_GAP, top: part.top, ...tag },
    { left: part.left - TAG_GAP - tag.width, top: part.top, ...tag },
  ]
  const area = tag.width * tag.height
  const sum = (boxes: readonly Box[], place: Box) =>
    boxes.reduce((total, box) => total + overlap(place, box), 0)
  let best = places[0]
  let bestCost: readonly number[] = [Infinity]
  for (const place of places) {
    const cost = [
      // Off the paper it may not be seen at all: that is worst.
      area - overlap(place, around.within),
      sum(around.keepClear, place),
      sum(around.ratherClear ?? [], place),
    ]
    const differs = cost.findIndex((value, index) => value !== bestCost[index])
    if (differs !== -1 && cost[differs] < (bestCost[differs] ?? Infinity)) {
      best = place
      bestCost = cost
    }
  }
  return best
}

/** How far outside a part its outline reaches: its offset and its width, and a little. */
const OUTLINE_REACH = 6
/** How far from the name badge the outline stops. */
const BADGE_CLEARANCE = 2

/**
 * The clip path that keeps a part's outline from running through its
 * instance's name badge (Phase 5, section 8): everything the part draws,
 * less the badge and a little around it. In the part's own coordinates, as
 * CSS. Null when the outline does not come near the badge.
 */
export function outlineAround(part: Box, badge: Box | null): string | null {
  if (badge === null) return null
  const drawn = {
    left: part.left - OUTLINE_REACH,
    top: part.top - OUTLINE_REACH,
    width: part.width + 2 * OUTLINE_REACH,
    height: part.height + 2 * OUTLINE_REACH,
  }
  const hole = {
    left: badge.left - BADGE_CLEARANCE,
    top: badge.top - BADGE_CLEARANCE,
    width: badge.width + 2 * BADGE_CLEARANCE,
    height: badge.height + 2 * BADGE_CLEARANCE,
  }
  if (overlap(drawn, hole) === 0) return null
  const corners = (box: Box) => {
    const x0 = box.left - part.left
    const y0 = box.top - part.top
    const x1 = x0 + box.width
    const y1 = y0 + box.height
    return [`${x0}px ${y0}px`, `${x1}px ${y0}px`, `${x1}px ${y1}px`, `${x0}px ${y1}px`]
  }
  const [first, ...rest] = corners(drawn)
  const [holeFirst, ...holeRest] = corners(hole)
  // Two rings in one polygon: what is inside both is left out (even-odd).
  return `polygon(evenodd, ${[first, ...rest, first, holeFirst, ...holeRest, holeFirst, first].join(", ")})`
}

export const sameSize = (a: Size | null, b: Size | null) =>
  a === b || (a !== null && b !== null && a.width === b.width && a.height === b.height)
