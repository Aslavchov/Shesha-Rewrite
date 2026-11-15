import type { Outline, OutlineNode, OutlineRegion } from "./model/schema"
import { type Position, rootPosition } from "./model/tree"

/**
 * The outline panel as a flat list of rows, and where a drop on a row lands.
 * Pure: the panel renders the rows and measures the pointer; the decisions
 * are made here.
 */

export type OutlineRow =
  | {
      readonly kind: "instance"
      readonly node: OutlineNode
      /** How far the row is indented: 0 for a top-level instance. */
      readonly depth: number
      /** Whether its regions have rows of their own below it. */
      readonly hasRegionRows: boolean
    }
  | {
      readonly kind: "region"
      readonly parent: OutlineNode
      readonly region: OutlineRegion
      readonly depth: number
    }

/**
 * A container's regions get rows of their own when there is more than one of
 * them, or when one holds instances the form does not show. A container with
 * a single region lists its children directly under itself.
 */
function showsRegionRows(node: OutlineNode): boolean {
  return node.regions.length > 1 || node.regions.some((region) => node.shown && !region.shown)
}

export function outlineRows(outline: Outline): OutlineRow[] {
  const rows: OutlineRow[] = []

  function list(nodes: readonly OutlineNode[], depth: number) {
    for (const node of nodes) {
      const hasRegionRows = showsRegionRows(node)
      rows.push({ kind: "instance", node, depth, hasRegionRows })
      for (const region of node.regions) {
        if (hasRegionRows) {
          rows.push({ kind: "region", parent: node, region, depth: depth + 1 })
          list(region.children, depth + 2)
        } else {
          list(region.children, depth + 1)
        }
      }
    }
  }

  list(outline.roots, 0)
  return rows
}

/** Where on a row the pointer is. */
export type RowPoint = {
  /** The row's index, or null for the empty space below the last row. */
  readonly row: number | null
  /** From 0 at the row's top edge to 1 at its bottom edge. */
  readonly fraction: number
  /** How many indents from the left the pointer is. */
  readonly depth: number
}

export type OutlineDrop = {
  /** Where the instance would go, counting every instance, the dragged one included. */
  readonly position: Position
  /** Where the indicator line goes: on which edge of which row, and how far indented. */
  readonly line: { readonly row: number; readonly edge: "top" | "bottom"; readonly depth: number }
}

/** The share of a container's row, from each edge, that means "next to it" rather than "into it". */
const BESIDE_SHARE = 0.3

export function outlineDropAt(
  outline: Outline,
  rows: readonly OutlineRow[],
  point: RowPoint,
): OutlineDrop | null {
  if (rows.length === 0)
    return { position: rootPosition(0), line: { row: 0, edge: "top", depth: 0 } }
  if (point.row === null) {
    return {
      position: rootPosition(outline.roots.length),
      line: { row: rows.length - 1, edge: "bottom", depth: 0 },
    }
  }
  const row = rows[point.row]
  if (!row) return null

  if (row.kind === "region") {
    if (!row.region.shown) return null
    return {
      position: { parent: row.parent.instance.id, region: row.region.name, index: 0 },
      line: { row: point.row, edge: "bottom", depth: row.depth + 1 },
    }
  }

  const { node } = row
  // Nothing can be placed among instances the form does not show.
  if (!node.shown) return null
  const before: OutlineDrop = {
    position: node.position,
    line: { row: point.row, edge: "top", depth: row.depth },
  }
  // Its regions follow as rows of their own; those are where to drop into it.
  if (row.hasRegionRows) return before

  const [region] = node.regions
  if (region) {
    if (point.fraction < BESIDE_SHARE) return before
    // Under an open container's row is its first child's place.
    if (region.children.length > 0 || point.fraction < 1 - BESIDE_SHARE) {
      return {
        position: { parent: node.instance.id, region: region.name, index: 0 },
        line: { row: point.row, edge: "bottom", depth: row.depth + 1 },
      }
    }
  } else if (point.fraction < 0.5) {
    return before
  }

  // After this row. When it is the last row of its container, that can also
  // mean after the container, or after the container's container: how far
  // left the pointer is decides.
  const depths = new Map(
    rows.flatMap((candidate) =>
      candidate.kind === "instance" ? [[candidate.node, candidate.depth] as const] : [],
    ),
  )
  let chosen = node
  for (let current = node; ;) {
    chosen = current
    const depth = depths.get(current) ?? 0
    const parent = current.parent
    if (point.depth >= depth || !parent || !endsItsContainer(current, parent)) break
    current = parent
  }
  return {
    position: { ...chosen.position, index: chosen.position.index + 1 },
    line: { row: point.row, edge: "bottom", depth: depths.get(chosen) ?? 0 },
  }
}

/** Whether `node` is the last row inside `parent`: the last instance of its last region. */
function endsItsContainer(node: OutlineNode, parent: OutlineNode): boolean {
  const lastRegion = parent.regions.at(-1)
  return lastRegion?.name === node.position.region && lastRegion.children.at(-1) === node
}
