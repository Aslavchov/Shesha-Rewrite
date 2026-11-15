import { describe, expect, it } from "vitest"

import { columns, container, field, form, layout } from "../testing/documents"
import { createId } from "./ids"
import { nameBase, pathsClash, takeName } from "./names"
import {
  allInstances,
  contains,
  findInstance,
  insertInstance,
  jsonDepth,
  removeInstance,
  rootPosition,
} from "./tree"

const sample = () =>
  form([
    field("a"),
    columns("row", { col1: [field("b")], col2: [container("box", [field("c")])] }),
    field("d"),
  ])

describe("reading the tree", () => {
  it("finds an instance at any depth, with where it is and what it is inside", () => {
    const found = findInstance(sample(), "c_c")

    expect(found?.instance.name).toBe("c")
    expect(found?.position).toEqual({ parent: "c_box", region: "content", index: 0 })
    expect(found?.ancestors.map((ancestor) => ancestor.name)).toEqual(["row", "box"])
    expect(findInstance(sample(), "c_a")?.position).toEqual(rootPosition(0))
    expect(findInstance(sample(), "nope")).toBeNull()
  })

  it("lists every instance in document order", () => {
    expect([...allInstances(sample())].map((instance) => instance.name)).toEqual([
      "a",
      "row",
      "b",
      "box",
      "c",
      "d",
    ])
  })

  it("knows what an instance holds", () => {
    const row = sample().components[1]
    expect(contains(row, "c_row")).toBe(true)
    expect(contains(row, "c_c")).toBe(true)
    expect(contains(row, "c_d")).toBe(false)
  })

  it("measures how deep JSON nests", () => {
    expect(jsonDepth("text")).toBe(0)
    expect(jsonDepth(null)).toBe(0)
    expect(jsonDepth([])).toBe(1)
    expect(jsonDepth({ a: [1, { b: [] }] })).toBe(4)
    // The document, its components, an instance, its regions, a region, an instance, …
    expect(jsonDepth(sample())).toBe(9)
  })
})

describe("changing the tree", () => {
  it("inserts at the top level and inside a region, clamping the index", () => {
    const top = insertInstance(sample(), field("x"), rootPosition(1))
    expect(top && layout(top)).toEqual([
      "a",
      "x",
      { row: { col1: ["b"], col2: [{ box: { content: ["c"] } }] } },
      "d",
    ])

    const inside = insertInstance(sample(), field("x"), {
      parent: "c_box",
      region: "content",
      index: 99,
    })
    expect(inside && layout(inside)[1]).toEqual({
      row: { col1: ["b"], col2: [{ box: { content: ["c", "x"] } }] },
    })
  })

  it("creates a region that was not stored yet", () => {
    const document = form([columns("row")])
    const next = insertInstance(document, field("x"), { parent: "c_row", region: "col2", index: 0 })
    expect(next?.components[0].regions).toEqual({ col2: [field("x")] })
  })

  it("returns null when the parent is not in the document", () => {
    expect(
      insertInstance(sample(), field("x"), { parent: "nope", region: "content", index: 0 }),
    ).toBeNull()
    expect(removeInstance(sample(), "nope")).toBeNull()
  })

  it("removes an instance with everything inside it", () => {
    const result = removeInstance(sample(), "c_row")
    expect(result && layout(result.document)).toEqual(["a", "d"])
    expect(result?.removed.position).toEqual(rootPosition(1))
  })

  it("leaves out a region, and then `regions`, once they are empty", () => {
    const withoutB = removeInstance(sample(), "c_b")
    expect(Object.keys(withoutB?.document.components[1].regions ?? {})).toEqual(["col2"])

    const withoutC = removeInstance(sample(), "c_c")
    const box = findInstance(withoutC!.document, "c_box")
    expect(box?.instance).toEqual({ id: "c_box", type: "container", name: "box" })
  })

  it("shares everything it did not touch with the document before", () => {
    const before = sample()
    const after = insertInstance(before, field("x"), {
      parent: "c_box",
      region: "content",
      index: 0,
    })!

    expect(after).not.toBe(before)
    expect(after.components[0]).toBe(before.components[0])
    expect(after.components[2]).toBe(before.components[2])
    expect(after.components[1]).not.toBe(before.components[1])
    expect(after.components[1].regions?.col1).toBe(before.components[1].regions?.col1)
    // The document before is as it was.
    expect(layout(before)).toEqual(layout(sample()))
  })
})

describe("ids for new instances", () => {
  it("are c_ plus ten base-32 characters", () => {
    for (let count = 0; count < 200; count++) {
      expect(createId(new Set())).toMatch(/^c_[0-9a-hjkmnp-tv-z]{10}$/)
    }
  })

  it("are different every time", () => {
    const ids = new Set(Array.from({ length: 500 }, () => createId(new Set())))
    expect(ids.size).toBe(500)
  })

  it("never repeat an id that is taken", () => {
    // A source that gives the same id twice, then a different one.
    const sequence = [...Array<number>(20).fill(1), ...Array<number>(10).fill(2)]
    let calls = 0
    const id = createId(new Set(["c_1111111111"]), () => sequence[calls++])
    expect(id).toBe("c_2222222222")
  })
})

describe("names for new instances", () => {
  const taken = (names: string[] = [], paths: string[] = []) => ({
    names: new Set(names),
    paths: new Set(paths),
  })

  it("are the type in camelCase", () => {
    expect(nameBase("text-field")).toBe("textField")
    expect(nameBase("date-picker")).toBe("datePicker")
    expect(nameBase("columns")).toBe("columns")
    expect(nameBase("a-b2-c")).toBe("aB2C")
  })

  it("take the lowest number that is free", () => {
    expect(takeName("text-field", true, taken())).toBe("textField1")
    expect(takeName("text-field", true, taken(["textField1", "textField2"]))).toBe("textField3")
    expect(takeName("text-field", true, taken(["textField2"]))).toBe("textField1")
    expect(takeName("columns", false, taken(["textField1"]))).toBe("columns1")
  })

  it("record what they take, so the next one differs", () => {
    const used = taken()
    expect(takeName("text-field", true, used)).toBe("textField1")
    expect(takeName("text-field", true, used)).toBe("textField2")
    expect(used.paths).toEqual(new Set(["textField1", "textField2"]))
  })

  it("skip a number whose data path would clash, for an input", () => {
    // Another input already stores its value at, or under, that path.
    expect(takeName("text-field", true, taken([], ["textField1"]))).toBe("textField2")
    expect(takeName("text-field", true, taken([], ["textField1.street"]))).toBe("textField2")
    // A component with no value has no path to clash.
    expect(takeName("button", false, taken([], ["button1"]))).toBe("button1")
  })

  it("stay within the longest name the server accepts", () => {
    const name = takeName("x".repeat(64), true, taken())
    expect(name.length).toBeLessThanOrEqual(64)
    expect(name).toMatch(/^x+1$/)
  })

  it("know when two data paths clash", () => {
    expect(pathsClash("a", "a")).toBe(true)
    expect(pathsClash("a", "a.b")).toBe(true)
    expect(pathsClash("a.b", "a")).toBe(true)
    expect(pathsClash("a", "ab")).toBe(false)
    expect(pathsClash("a.b", "a.c")).toBe(false)
  })
})
