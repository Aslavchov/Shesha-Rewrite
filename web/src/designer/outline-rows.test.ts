import { describe, expect, it } from "vitest"

import type { ComponentInstance } from "@/generated"

import { outlineDropAt, outlineRows, type RowPoint } from "./outline-rows"
import { columns, container, field, form, schema } from "./testing/documents"

function rowsOf(components: ComponentInstance[]) {
  const outline = schema.outline(form(components))
  const rows = outlineRows(outline)
  const labels = rows.map((row) =>
    row.kind === "instance"
      ? `${"  ".repeat(row.depth)}${row.node.instance.name}`
      : `${"  ".repeat(row.depth)}[${row.region.name}${row.region.shown ? "" : " hidden"}]`,
  )
  const drop = (label: string, fraction: number, depth = 99) => {
    const row = label === "below" ? null : labels.findIndex((text) => text.trim() === label)
    const point: RowPoint = { row, fraction, depth }
    const found = outlineDropAt(outline, rows, point)
    if (!found) return null
    const { parent, region, index } = found.position
    const where = parent === null ? "form" : `${outline.byId.get(parent)?.instance.name}.${region}`
    const line = `${found.line.edge} of ${labels[found.line.row]?.trim()} at ${found.line.depth}`
    return `${where}[${index}], line ${line}`
  }
  return { labels, drop }
}

describe("the outline's rows", () => {
  it("lists a single-region container's children directly under it", () => {
    const { labels } = rowsOf([field("a"), container("box", [field("b"), field("c")])])
    expect(labels).toEqual(["a", "box", "  b", "  c"])
  })

  it("gives every region of a multi-region container a row, even an empty one", () => {
    const { labels } = rowsOf([columns("row", { col2: [field("a")] })])
    expect(labels).toEqual(["row", "  [col1]", "  [col2]", "    a"])
  })

  it("marks a region the container does not show, and keeps what it holds", () => {
    // Two columns, with something stored in a third.
    const { labels } = rowsOf([
      columns("row", { col1: [field("a")], col3: [container("lost", [field("b")])] }, 2),
    ])
    expect(labels).toEqual([
      "row",
      "  [col1]",
      "    a",
      "  [col2]",
      "  [col3 hidden]",
      "    lost",
      "      b",
    ])
  })

  it("shows a region row for a single-region container that stores a stray region", () => {
    const stray = {
      ...container("box", [field("a")]),
      regions: { content: [field("a")], extra: [field("b")] },
    }
    const { labels } = rowsOf([stray])
    expect(labels).toEqual(["box", "  [content]", "    a", "  [extra hidden]", "    b"])
  })
})

describe("dropping on the outline", () => {
  it("drops before an instance on its upper half and after it on its lower half", () => {
    const { drop } = rowsOf([field("a"), field("b")])
    expect(drop("b", 0.2)).toBe("form[1], line top of b at 0")
    expect(drop("b", 0.8)).toBe("form[2], line bottom of b at 0")
    expect(drop("a", 0.8)).toBe("form[1], line bottom of a at 0")
  })

  it("drops into a container from the middle of its row, and beside it from the top edge", () => {
    const { drop } = rowsOf([container("box", [field("a")]), field("z")])
    expect(drop("box", 0.1)).toBe("form[0], line top of box at 0")
    expect(drop("box", 0.5)).toBe("box.content[0], line bottom of box at 1")
    // Under an open container's row is its first child's place.
    expect(drop("box", 0.9)).toBe("box.content[0], line bottom of box at 1")
  })

  it("drops into an empty container from the middle, and after it from the bottom edge", () => {
    const { drop } = rowsOf([container("box"), field("z")])
    expect(drop("box", 0.5)).toBe("box.content[0], line bottom of box at 1")
    expect(drop("box", 0.9)).toBe("form[1], line bottom of box at 0")
  })

  it("drops into a region from its row", () => {
    const { drop } = rowsOf([columns("row", { col1: [field("a")] })])
    expect(drop("[col2]", 0.5)).toBe("row.col2[0], line bottom of [col2] at 2")
    expect(drop("[col1]", 0.5)).toBe("row.col1[0], line bottom of [col1] at 2")
    // The Columns row itself: before it. Its regions are the way in.
    expect(drop("row", 0.9)).toBe("form[0], line top of row at 0")
  })

  it("lets the pointer's indent choose the level after the last row of a container", () => {
    const { drop } = rowsOf([container("outer", [container("inner", [field("a")])]), field("z")])
    expect(drop("a", 0.8, 2)).toBe("inner.content[1], line bottom of a at 2")
    expect(drop("a", 0.8, 1)).toBe("outer.content[1], line bottom of a at 1")
    expect(drop("a", 0.8, 0)).toBe("form[1], line bottom of a at 0")
  })

  it("only climbs out of a container from its very last row", () => {
    const { drop } = rowsOf([container("box", [field("a"), field("b")])])
    expect(drop("a", 0.8, 0)).toBe("box.content[1], line bottom of a at 1")

    // After the last instance of col1 comes col2's row, so it stays in col1.
    const cols = rowsOf([columns("row", { col1: [field("a")], col2: [field("b")] })])
    expect(cols.drop("a", 0.8, 0)).toBe("row.col1[1], line bottom of a at 2")
    expect(cols.drop("b", 0.8, 0)).toBe("form[1], line bottom of b at 0")
  })

  it("drops at the end of the form from the space below the rows", () => {
    const { drop } = rowsOf([field("a"), container("box", [field("b")])])
    expect(drop("below", 0)).toBe("form[2], line bottom of b at 0")
  })

  it("drops into an empty form", () => {
    const outline = schema.outline(form())
    expect(outlineDropAt(outline, [], { row: null, fraction: 0, depth: 0 })?.position).toEqual({
      parent: null,
      region: "components",
      index: 0,
    })
  })

  it("offers nothing among instances the form does not show", () => {
    const { drop } = rowsOf([columns("row", { col3: [container("lost", [field("b")])] }, 2)])
    expect(drop("[col3 hidden]", 0.5)).toBeNull()
    expect(drop("lost", 0.5)).toBeNull()
    expect(drop("b", 0.2)).toBeNull()
  })
})
