import { describe, expect, it } from "vitest"

import type { FormDocument } from "@/generated"

import {
  columns,
  container,
  field,
  form,
  layout,
  personDetails,
  schema,
  seededRandom,
} from "../testing/documents"
import {
  type Command,
  createEditorState,
  type EditorState,
  HISTORY_LIMIT,
  runCommand,
} from "./editor"
import { checkDocument } from "./rules"
import { findInstance, type Position, rootPosition } from "./tree"

const environment = { schema, random: seededRandom(7) }

/** Runs commands one after another and returns the last result. */
function run(start: EditorState | FormDocument, ...commands: Command[]) {
  let state = "document" in start ? start : createEditorState(start)
  let result = { state, changed: false, message: null as string | null }
  for (const command of commands) {
    result = runCommand(state, command, environment)
    state = result.state
  }
  return result
}

const inside = (parent: string, region: string, index: number): Position => ({
  parent: `c_${parent}`,
  region,
  index,
})

const nameOf = (state: EditorState, id: string | null) =>
  id === null ? null : findInstance(state.document, id)?.instance.name

const selected = (state: EditorState) => nameOf(state, state.selection)

describe("adding", () => {
  it("puts a new instance at the end of the form when nothing is selected", () => {
    const { state, message } = run(form([field("a")]), { type: "add", component: "text-field" })

    expect(layout(state.document)).toEqual(["a", "textField1"])
    expect(selected(state)).toBe("textField1")
    expect(message).toBe("Added Text field textField1 at position 2 of 2 in the form.")
  })

  it("puts it after the selected instance, in the same region", () => {
    const document = form([columns("row", { col1: [field("a"), field("b")] }), field("c")])
    const { state, message } = run(
      document,
      { type: "select", id: "c_a" },
      { type: "add", component: "switch" },
    )

    expect(layout(state.document)).toEqual([{ row: { col1: ["a", "switch1", "b"] } }, "c"])
    expect(message).toBe("Added Switch switch1 at position 2 of 3 in col1 of row.")
  })

  it("puts it where it is told to", () => {
    const { state } = run(form([columns("row")]), {
      type: "add",
      component: "button",
      at: inside("row", "col2", 0),
    })
    expect(layout(state.document)).toEqual([{ row: { col2: ["button1"] } }])
  })

  it("gives the instance a generated id, a name from its type, and nothing else", () => {
    const { state } = run(form(), { type: "add", component: "columns" })
    const [added] = state.document.components

    expect(added.id).toMatch(/^c_[0-9a-hjkmnp-tv-z]{10}$/)
    expect(added).toEqual({ id: added.id, type: "columns", name: "columns1" })
  })

  it("binds an input to a data path equal to its name, and stores no settings", () => {
    const { state } = run(form(), { type: "add", component: "date-picker" })
    const [added] = state.document.components

    expect(added).toEqual({
      id: added.id,
      type: "date-picker",
      name: "datePicker1",
      bind: "datePicker1",
    })
  })

  it("numbers names so they are unique in the whole form", () => {
    const document = form([container("box", [field("textField1")]), field("textField3")])
    const { state } = run(
      document,
      { type: "add", component: "text-field" },
      { type: "add", component: "text-field" },
    )
    expect(state.document.components.slice(2).map((instance) => instance.name)).toEqual([
      "textField2",
      "textField4",
    ])
  })

  it("adds at the end of the form when the selection is not shown", () => {
    // col3 is stored, but this Columns has two columns.
    const document = form([columns("row", { col3: [field("lost")] }), field("z")])
    const { state } = run(
      document,
      { type: "select", id: "c_lost" },
      { type: "add", component: "checkbox" },
    )
    expect(layout(state.document)).toEqual([{ row: { col3: ["lost"] } }, "z", "checkbox1"])
  })

  it("refuses a component type it does not have", () => {
    const { changed, message } = run(form(), { type: "add", component: "hologram" })
    expect(changed).toBe(false)
    expect(message).toBe('There is no component type "hologram".')
  })
})

describe("moving", () => {
  const start = () =>
    form([field("a"), columns("row", { col1: [field("b"), field("c")] }), field("d")])

  it("reorders within a region; the index counts the region without the instance", () => {
    const down = run(start(), { type: "move", id: "c_a", to: rootPosition(2) })
    expect(layout(down.state.document)).toEqual([{ row: { col1: ["b", "c"] } }, "d", "a"])
    expect(down.message).toBe("Moved a to position 3 of 3 in the form.")

    const up = run(start(), { type: "move", id: "c_d", to: rootPosition(0) })
    expect(layout(up.state.document)).toEqual(["d", "a", { row: { col1: ["b", "c"] } }])
  })

  it("moves into another region, and out to the top level", () => {
    const into = run(start(), { type: "move", id: "c_a", to: inside("row", "col2", 0) })
    expect(layout(into.state.document)).toEqual([{ row: { col1: ["b", "c"], col2: ["a"] } }, "d"])
    expect(into.message).toBe("Moved a to position 1 of 1 in col2 of row.")

    const out = run(start(), { type: "move", id: "c_c", to: rootPosition(0) })
    expect(layout(out.state.document)).toEqual(["c", "a", { row: { col1: ["b"] } }, "d"])
  })

  it("keeps the instance itself: same id, name, settings and children", () => {
    const document = start()
    const row = document.components[1]
    const { state } = run(document, { type: "move", id: "c_row", to: rootPosition(0) })
    expect(state.document.components[0]).toBe(row)
  })

  it("selects what it moved", () => {
    const { state } = run(start(), { type: "move", id: "c_d", to: rootPosition(0) })
    expect(selected(state)).toBe("d")
  })

  it("refuses to put a container inside itself or anything it holds", () => {
    const document = form([columns("row", { col1: [container("box", [field("a")])] })])
    for (const to of [inside("row", "col2", 0), inside("box", "content", 0)]) {
      const result = run(document, { type: "move", id: "c_row", to })
      expect(result.changed).toBe(false)
      expect(result.state.document).toBe(document)
      expect(result.message).toBe("A component cannot be moved inside itself.")
    }
  })

  it("refuses a region the container does not have, or does not show", () => {
    const document = form([columns("row", { col3: [container("hidden")] }), field("a")])
    const targets = [
      inside("row", "col3", 0),
      inside("row", "sidebar", 0),
      inside("hidden", "content", 0),
      inside("a", "content", 0),
      { parent: "nope", region: "content", index: 0 },
    ]
    for (const to of targets) {
      const result = run(document, { type: "move", id: "c_a", to })
      expect(result.changed, JSON.stringify(to)).toBe(false)
      expect(result.state.document).toBe(document)
    }
  })

  it("does nothing, and records nothing, when the instance is already there", () => {
    for (const index of [1, 99]) {
      const result = run(form([field("a"), field("b")]), {
        type: "move",
        id: "c_b",
        to: rootPosition(index),
      })
      expect(result.changed).toBe(false)
      expect(result.state.past).toEqual([])
    }
  })

  it("refuses a move that would nest deeper than the server reads", () => {
    let chain = container("box0")
    for (let level = 1; level < 41; level++) chain = container(`box${level}`, [chain])
    const document = form([chain, container("extra", [field("a")])])

    const tooDeep = run(document, { type: "move", id: "c_extra", to: inside("box0", "content", 0) })
    expect(tooDeep.changed).toBe(false)
    expect(tooDeep.message).toBe("That would nest components too deeply.")

    // One level up, the same move fits.
    const fits = run(document, { type: "move", id: "c_a", to: inside("box0", "content", 0) })
    expect(fits.changed).toBe(true)
    expect(checkDocument(fits.state.document)).toEqual([])
  })
})

describe("stepping with the keyboard", () => {
  const start = () => form([field("a"), columns("row", { col1: [field("b")] }), field("c")])
  const down = (id: string): Command => ({ type: "step", id: `c_${id}`, direction: "down" })
  const up = (id: string): Command => ({ type: "step", id: `c_${id}`, direction: "up" })

  it("walks down through every place in document order, into and out of containers", () => {
    let state = createEditorState(start())
    const seen: unknown[] = []
    for (;;) {
      const result = runCommand(state, down("a"), environment)
      if (!result.changed) {
        expect(result.message).toBe("a is already at the bottom of the form.")
        break
      }
      state = result.state
      seen.push(layout(state.document))
    }

    expect(seen).toEqual([
      [{ row: { col1: ["a", "b"] } }, "c"],
      [{ row: { col1: ["b", "a"] } }, "c"],
      [{ row: { col1: ["b"], col2: ["a"] } }, "c"],
      [{ row: { col1: ["b"] } }, "a", "c"],
      [{ row: { col1: ["b"] } }, "c", "a"],
    ])
  })

  it("walks back up the same way", () => {
    let state = run(start(), down("a"), down("a"), down("a"), down("a"), down("a")).state
    const seen: unknown[] = []
    for (;;) {
      const result = runCommand(state, up("a"), environment)
      if (!result.changed) {
        expect(result.message).toBe("a is already at the top of the form.")
        break
      }
      state = result.state
      seen.push(layout(state.document))
    }

    expect(seen.at(-1)).toEqual(layout(start()))
    expect(seen).toHaveLength(5)
  })

  it("says where the instance went", () => {
    const { message } = run(start(), down("a"))
    expect(message).toBe("Moved a to position 1 of 2 in col1 of row.")
  })

  it("never steps a container into itself", () => {
    const result = run(form([columns("row", { col1: [field("b")] })]), down("row"))
    expect(result.changed).toBe(false)
  })

  it("passes over regions the form does not show", () => {
    const document = form([field("a"), columns("row", { col3: [field("lost")] })])
    const { state } = run(document, down("a"), down("a"), down("a"))
    // col1, col2, then after the Columns: never col3.
    expect(layout(state.document)).toEqual([{ row: { col3: ["lost"] } }, "a"])
  })

  it("brings an instance that is not shown back into the form", () => {
    const document = form([columns("row", { col1: [field("b")], col3: [field("lost")] })])
    const { state, message } = run(document, up("lost"))
    expect(layout(state.document)).toEqual([{ row: { col1: ["b"], col2: ["lost"] } }])
    expect(message).toBe("Moved lost to position 1 of 1 in col2 of row.")
  })
})

describe("deleting", () => {
  const start = () => form([field("a"), container("box", [field("b"), field("c")]), field("d")])

  it("removes the instance and everything inside it", () => {
    const { state, message } = run(start(), { type: "remove", id: "c_box" })
    expect(layout(state.document)).toEqual(["a", "d"])
    expect(message).toBe("Deleted box and the 2 components inside it.")
  })

  it("selects the next sibling, else the previous one, else the container", () => {
    const next = run(start(), { type: "remove", id: "c_b" })
    expect(selected(next.state)).toBe("c")

    const previous = run(next.state, { type: "remove", id: "c_c" })
    expect(selected(previous.state)).toBe("box")

    const last = run(start(), { type: "remove", id: "c_d" })
    expect(selected(last.state)).toBe("box")
  })

  it("selects nothing once the form is empty", () => {
    const { state } = run(form([field("a")]), { type: "remove", id: "c_a" })
    expect(state.selection).toBeNull()
    expect(state.document.components).toEqual([])
  })
})

describe("duplicating", () => {
  it("puts a copy right after the original and selects it", () => {
    const { state, message } = run(form([field("a"), field("z")]), {
      type: "duplicate",
      id: "c_a",
    })
    expect(layout(state.document)).toEqual(["a", "textField1", "z"])
    expect(selected(state)).toBe("textField1")
    expect(message).toBe("Duplicated a as textField1, at position 2 of 3 in the form.")
  })

  it("gives every copied instance a new id, name and data path", () => {
    const original = columns("columns1", {
      col1: [{ ...field("textField1"), bind: "person.first" }],
      col2: [container("box", [{ id: "c_ok", type: "button", name: "ok" }])],
    })
    const { state } = run(form([original]), { type: "duplicate", id: "c_columns1" })
    const [, copy] = state.document.components

    expect(layout(state.document)[1]).toEqual({
      columns2: { col1: ["textField2"], col2: [{ container1: { content: ["button1"] } }] },
    })
    const copied = copy.regions!.col1[0]
    expect(copied.bind).toBe("textField2")
    expect(copy.regions!.col2[0].regions!.content[0]).not.toHaveProperty("bind")

    const ids = new Set(
      [state.document.components[0], copy].flatMap((instance) => [
        instance.id,
        ...Object.values(instance.regions ?? {})
          .flat()
          .map((child) => child.id),
      ]),
    )
    expect(ids.size).toBe(6)
    expect(checkDocument(state.document)).toEqual([])
  })

  it("keeps the settings and styles of what it copies", () => {
    const document = personDetails()
    const email = document.components[1]
    const { state } = run(document, { type: "duplicate", id: email.id })
    const copy = state.document.components[2]

    expect(copy.settings).toBe(email.settings)
    expect(copy.styles).toEqual({ label: { color: "#003BB2" } })
    expect(copy.name).toBe("textField1")
    expect(checkDocument(state.document)).toEqual([])
  })

  it("keeps the column count, and the regions the form does not show", () => {
    const original = columns("row", { col1: [field("a")], col3: [field("lost")] }, 2)
    const { state } = run(form([original]), { type: "duplicate", id: "c_row" })
    expect(layout(state.document)[1]).toEqual({
      columns1: { col1: ["textField1"], col3: ["textField2"] },
    })
    expect(state.document.components[1].settings).toEqual({ columns: 2 })
  })

  it("refuses a copy that would make the form too large to save", () => {
    const big = { ...field("a"), settings: { label: "x".repeat(1_200_000) } }
    const { changed, message } = run(form([big]), { type: "duplicate", id: "c_a" })
    expect(changed).toBe(false)
    expect(message).toBe("The form is too large to hold more.")
  })
})

describe("selecting", () => {
  it("selects an instance, or nothing; never something that is not there", () => {
    const document = form([field("a")])
    expect(run(document, { type: "select", id: "c_a" }).state.selection).toBe("c_a")
    expect(run(document, { type: "select", id: "nope" }).state.selection).toBeNull()
    expect(
      run(document, { type: "select", id: "c_a" }, { type: "select", id: null }).state.selection,
    ).toBeNull()
  })

  it("is not a change: it leaves the document and the history alone", () => {
    const start = run(form([field("a")]), { type: "add", component: "button" }).state
    const { state, changed } = run(start, { type: "select", id: "c_a" })
    expect(changed).toBe(false)
    expect(state.document).toBe(start.document)
    expect(state.past).toBe(start.past)
  })
})

describe("undo and redo", () => {
  it("undo puts back the very document that was there, and the selection", () => {
    const document = form([field("a"), field("b")])
    const before = run(document, { type: "select", id: "c_a" }).state
    const after = run(before, { type: "remove", id: "c_a" }).state
    expect(selected(after)).toBe("b")

    const undone = run(after, { type: "undo" })
    expect(undone.state.document).toBe(document)
    expect(undone.state.selection).toBe("c_a")
    expect(undone.message).toBe("Undid: Delete a.")
  })

  it("redo applies the change again, exactly", () => {
    const start = createEditorState(form([field("a"), field("b")]))
    const after = run(start, { type: "remove", id: "c_a" }).state
    const redone = run(after, { type: "undo" }, { type: "redo" })

    expect(redone.state.document).toBe(after.document)
    expect(redone.state.selection).toBe(after.selection)
    expect(redone.message).toBe("Redid: Delete a.")
  })

  it("covers every kind of change, in order", () => {
    const start = form([field("a"), columns("row")])
    const state = run(
      start,
      { type: "add", component: "text-field" },
      { type: "move", id: "c_a", to: inside("row", "col1", 0) },
      { type: "duplicate", id: "c_row" },
      { type: "step", id: "c_a", direction: "down" },
      { type: "remove", id: "c_row" },
    ).state
    expect(state.past.map((entry) => entry.label)).toEqual([
      "Add textField1",
      "Move a",
      "Duplicate row",
      "Move a",
      "Delete row",
    ])

    const layouts: unknown[] = []
    let current = state
    while (current.past.length > 0) {
      current = run(current, { type: "undo" }).state
      layouts.push(layout(current.document))
    }
    expect(layouts.at(-1)).toEqual(["a", "row"])
    expect(current.document).toBe(start)

    while (current.future.length > 0) current = run(current, { type: "redo" }).state
    expect(current.document).toBe(state.document)
  })

  it("a new change after an undo drops what could have been redone", () => {
    const state = run(
      form([field("a")]),
      { type: "add", component: "button" },
      { type: "undo" },
      { type: "add", component: "switch" },
    ).state
    expect(state.future).toEqual([])
    expect(run(state, { type: "redo" }).message).toBe("Nothing to redo.")
  })

  it("says so when there is nothing to undo", () => {
    const result = run(form(), { type: "undo" })
    expect(result.changed).toBe(false)
    expect(result.message).toBe("Nothing to undo.")
  })

  it("a refused command leaves no trace in the history", () => {
    const state = run(form([columns("row")]), {
      type: "move",
      id: "c_row",
      to: inside("row", "col1", 0),
    }).state
    expect(state.past).toEqual([])
  })

  it("keeps the last hundred changes", () => {
    let state = createEditorState(form())
    for (let count = 0; count < HISTORY_LIMIT + 20; count++) {
      state = run(state, { type: "add", component: "button" }).state
    }
    expect(state.past).toHaveLength(HISTORY_LIMIT)
    expect(state.past[0].label).toBe("Add button21")
  })
})
