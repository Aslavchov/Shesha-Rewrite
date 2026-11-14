import { describe, expect, it } from "vitest"

import type { ComponentInstance } from "@/generated"

import {
  type Axis,
  type Box,
  type CanvasLayout,
  locateOnCanvas,
  regionKey,
  type RegionLayout,
} from "./canvas-geometry"
import { columns, container, field, form, schema } from "./testing/documents"

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  width,
  height,
})

type RegionSpec = [parent: string | null, name: string, box: Box, axis?: Axis, empty?: Box]

/** A layout from boxes written by hand: instances by name, then regions. */
function canvas(
  components: ComponentInstance[],
  items: Record<string, Box>,
  regions: RegionSpec[],
) {
  const outline = schema.outline(form(components))
  const layout: CanvasLayout = {
    items: new Map(Object.entries(items).map(([name, itemBox]) => [`c_${name}`, itemBox])),
    regions: new Map(
      regions.map(([parent, name, regionBox, axis = "vertical", empty]): [string, RegionLayout] => [
        regionKey(parent === null ? null : `c_${parent}`, name),
        { box: regionBox, axis, empty: empty ?? null },
      ]),
    ),
  }
  /** The place under a point, as "parent.region[index]". */
  const at = (x: number, y: number) => {
    const place = locateOnCanvas(layout, outline, x, y)
    if (!place) return null
    const { parent, region, index } = place.position
    const where = parent === null ? "form" : `${outline.byId.get(parent)?.instance.name}.${region}`
    return `${where}[${index}]`
  }
  return { at, place: (x: number, y: number) => locateOnCanvas(layout, outline, x, y) }
}

/**
 * A form 400 wide:
 *
 *   a                                   0 –  40
 *   row: col1 [ b, c ]   col2 [ empty ] 56 – 156
 *   box: [ d ]  (d fills it exactly)    172 – 212
 *   z                                   228 – 268
 */
const sample = () =>
  canvas(
    [
      field("a"),
      columns("row", { col1: [field("b"), field("c")] }),
      container("box", [field("d")]),
      field("z"),
    ],
    {
      a: box(0, 0, 400, 40),
      row: box(0, 56, 400, 100),
      b: box(0, 56, 192, 40),
      c: box(0, 112, 192, 40),
      box: box(0, 172, 400, 40),
      d: box(0, 172, 400, 40),
      z: box(0, 228, 400, 40),
    },
    [
      [null, "components", box(0, 0, 400, 268)],
      ["row", "col1", box(0, 56, 192, 100)],
      ["row", "col2", box(208, 56, 192, 100), "vertical", box(208, 56, 192, 44)],
      ["box", "content", box(0, 172, 400, 40)],
    ],
  )

describe("finding the place under the pointer", () => {
  it("is before an instance on its upper half and after it on its lower half", () => {
    const { at } = sample()
    expect(at(200, 10)).toBe("form[0]")
    expect(at(200, 30)).toBe("form[1]")
    expect(at(200, 240)).toBe("form[3]")
    expect(at(200, 260)).toBe("form[4]")
  })

  it("is between two instances in the gap between them", () => {
    const { at } = sample()
    expect(at(200, 48)).toBe("form[1]")
    expect(at(200, 220)).toBe("form[3]")
  })

  it("is inside a column when over an instance in it", () => {
    const { at } = sample()
    expect(at(100, 70)).toBe("row.col1[0]")
    expect(at(100, 90)).toBe("row.col1[1]")
    expect(at(100, 120)).toBe("row.col1[1]")
    expect(at(100, 140)).toBe("row.col1[2]")
  })

  it("is inside a column when over the gap between its instances", () => {
    expect(sample().at(100, 104)).toBe("row.col1[1]")
  })

  it("is in an empty column anywhere over that column", () => {
    const { at } = sample()
    expect(at(300, 80)).toBe("row.col2[0]")
    // Below its drop target, still in the column.
    expect(at(300, 130)).toBe("row.col2[0]")
  })

  it("is next to a container right at the container's edge", () => {
    const { at } = sample()
    // The top few pixels of the Columns: before it, not into its first column.
    expect(at(100, 58)).toBe("form[1]")
    expect(at(300, 58)).toBe("form[1]")
    expect(at(100, 154)).toBe("form[2]")
  })

  it("can reach above, inside and below a container that its content fills", () => {
    const { at } = sample()
    expect(at(200, 174)).toBe("form[2]")
    expect(at(200, 185)).toBe("box.content[0]")
    expect(at(200, 200)).toBe("box.content[1]")
    expect(at(200, 210)).toBe("form[3]")
  })

  it("is at the end of the form when below or beside everything", () => {
    const { at } = sample()
    expect(at(200, 400)).toBe("form[4]")
    expect(at(600, 262)).toBe("form[4]")
    expect(at(200, -30)).toBe("form[0]")
  })

  it("splits the edge between containers that share it, outermost first", () => {
    const { at } = canvas(
      [container("outer", [container("inner", [field("leaf")])])],
      { outer: box(0, 0, 400, 60), inner: box(0, 0, 400, 60), leaf: box(0, 0, 400, 60) },
      [
        [null, "components", box(0, 0, 400, 60)],
        ["outer", "content", box(0, 0, 400, 60)],
        ["inner", "content", box(0, 0, 400, 60)],
      ],
    )
    expect(at(200, 1)).toBe("form[0]")
    expect(at(200, 4)).toBe("outer.content[0]")
    expect(at(200, 12)).toBe("inner.content[0]")
    expect(at(200, 48)).toBe("inner.content[1]")
    expect(at(200, 56)).toBe("outer.content[1]")
    expect(at(200, 59)).toBe("form[1]")
  })

  it("works along a row, where before and after are left and right", () => {
    const { at, place } = canvas(
      [container("actions", [field("e"), field("f")])],
      { actions: box(0, 0, 400, 32), e: box(0, 0, 80, 32), f: box(96, 0, 80, 32) },
      [
        [null, "components", box(0, 0, 400, 32)],
        ["actions", "content", box(0, 0, 400, 32), "horizontal"],
      ],
    )
    expect(at(20, 16)).toBe("actions.content[0]")
    expect(at(60, 16)).toBe("actions.content[1]")
    expect(at(100, 16)).toBe("actions.content[1]")
    expect(at(300, 16)).toBe("actions.content[2]")
    // The line stands between the two, as tall as they are.
    expect(place(100, 16)?.indicator).toEqual({ shape: "line", box: box(87, 0, 2, 32) })
  })

  it("is the first place of an empty form", () => {
    const { at, place } = canvas([], {}, [
      [null, "components", box(0, 0, 400, 160), "vertical", box(0, 0, 400, 160)],
    ])
    expect(at(200, 80)).toBe("form[0]")
    expect(place(200, 80)?.indicator).toEqual({ shape: "box", box: box(0, 0, 400, 160) })
  })

  it("finds nothing when the form has not been measured", () => {
    expect(canvas([field("a")], {}, []).at(10, 10)).toBeNull()
  })
})

describe("where the drop indicator is drawn", () => {
  it("is a line across the region, half way between the two instances", () => {
    const { place } = sample()
    expect(place(200, 48)?.indicator).toEqual({ shape: "line", box: box(0, 47, 400, 2) })
    // In a column the line is as wide as the column.
    expect(place(100, 104)?.indicator).toEqual({ shape: "line", box: box(0, 103, 192, 2) })
  })

  it("sits just outside the first and the last instance", () => {
    const { place } = sample()
    expect(place(200, 10)?.indicator.box.top).toBe(-5)
    expect(place(200, 260)?.indicator.box.top).toBe(271)
  })

  it("is a box around the drop target of an empty region", () => {
    expect(sample().place(300, 80)?.indicator).toEqual({
      shape: "box",
      box: box(208, 56, 192, 44),
    })
  })

  it("comes with the box of the region it is in, except for the form itself", () => {
    const { place } = sample()
    expect(place(100, 90)?.region).toEqual(box(0, 56, 192, 100))
    expect(place(200, 48)?.region).toBeNull()
  })
})
