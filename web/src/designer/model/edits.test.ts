import { describe, expect, it } from "vitest"

import type { ComponentInstance, FormDocument } from "@/generated"

import { columns, field, form, schema } from "../testing/documents"
import { type Command, createEditorState, type EditorState, runCommand } from "./editor"
import { problemsOf } from "./problems"
import { checkDocument } from "./rules"
import { findInstance } from "./tree"

/**
 * The Phase 3 commands (ADR 0009): names, data paths, settings, styles and
 * the form's own name, and how a run of edits becomes one undo step.
 */

const environment = { schema }

function run(start: EditorState | FormDocument, ...commands: Command[]) {
  let state = "document" in start ? start : createEditorState(start)
  let result = { state, changed: false, message: null as string | null }
  for (const command of commands) {
    result = runCommand(state, command, environment)
    state = result.state
  }
  return result
}

const instanceOf = (state: EditorState, id: string) => findInstance(state.document, id)?.instance

const withSettings = (instance: ComponentInstance, settings: Record<string, unknown>) => ({
  ...instance,
  settings,
})

describe("renaming", () => {
  it("gives an instance another name, keeping its id", () => {
    const { state, changed, message } = run(form([field("a")]), {
      type: "rename",
      id: "c_a",
      name: "firstName",
    })
    expect(changed).toBe(true)
    expect(instanceOf(state, "c_a")?.name).toBe("firstName")
    expect(message).toBe("Renamed a to firstName.")
    expect(state.past.at(-1)?.label).toBe("Rename a")
  })

  it("refuses a name that is not an identifier, is too long, or is taken, and changes nothing", () => {
    const document = form([field("a"), field("b")])
    for (const name of ["first name", "1st", "", "x".repeat(65), "b"]) {
      const { state, changed, message } = run(document, { type: "rename", id: "c_a", name })
      expect(changed, name).toBe(false)
      expect(state.document).toBe(document)
      expect(message).not.toBeNull()
    }
  })

  it("does not record a rename to the name it already has", () => {
    const { changed } = run(form([field("a")]), { type: "rename", id: "c_a", name: "a" })
    expect(changed).toBe(false)
  })
})

describe("data paths", () => {
  it("changes an input's data path", () => {
    const { state } = run(form([field("a")]), { type: "bind", id: "c_a", path: "person.firstName" })
    expect(instanceOf(state, "c_a")?.bind).toBe("person.firstName")
    expect(checkDocument(state.document)).toEqual([])
  })

  it("refuses a path that is not valid, or that clashes with another, as the server would", () => {
    const document = form([field("a"), { ...field("b"), bind: "person.name" }])
    for (const path of [
      "",
      "person..name",
      "person.1st",
      "person",
      "person.name",
      "person.name.first",
    ]) {
      const { changed } = run(document, { type: "bind", id: "c_a", path })
      expect(changed, path).toBe(false)
    }
    expect(run(document, { type: "bind", id: "c_a", path: "personal" }).changed).toBe(true)
  })

  it("gives no data path to a component that does not hold a value", () => {
    const { changed } = run(form([columns("row")]), { type: "bind", id: "c_row", path: "row" })
    expect(changed).toBe(false)
  })
})

describe("settings", () => {
  it("stores a valid value, and says so", () => {
    const { state, message } = run(form([field("a")]), {
      type: "set-setting",
      id: "c_a",
      key: "placeholder",
      value: "e.g. Ada",
    })
    expect(instanceOf(state, "c_a")?.settings).toEqual({ placeholder: "e.g. Ada" })
    expect(message).toBe("Placeholder of a: “e.g. Ada”.")
  })

  it("names a choice by its label", () => {
    const { message } = run(form([columns("row")]), {
      type: "set-setting",
      id: "c_row",
      key: "gap",
      value: "lg",
    })
    expect(message).toBe("Gap of row: Large.")
  })

  it("never stores a value the setting rejects", () => {
    const document = form([field("a")])
    for (const [key, value] of [
      ["maxLength", -3],
      ["maxLength", 2.5],
      ["required", "yes"],
      ["pattern", "("],
      ["nonsense", 1],
    ] as const) {
      const { state, changed } = run(document, { type: "set-setting", id: "c_a", key, value })
      expect(changed, key).toBe(false)
      expect(state.document).toBe(document)
    }
  })

  it("never stores a minimum above its maximum, from either side", () => {
    const document = form([withSettings(field("a"), { maxLength: 5 })])
    const raised = run(document, { type: "set-setting", id: "c_a", key: "minLength", value: 6 })
    expect(raised.changed).toBe(false)
    expect(raised.message).toBe("The minimum length is more than the maximum length.")

    const other = form([withSettings(field("a"), { minLength: 6 })])
    expect(run(other, { type: "set-setting", id: "c_a", key: "maxLength", value: 5 }).changed).toBe(
      false,
    )
    expect(run(other, { type: "set-setting", id: "c_a", key: "maxLength", value: 6 }).changed).toBe(
      true,
    )
  })

  it("resets a setting by removing its key, and settings with it when it was the last", () => {
    const document = form([withSettings(field("a"), { placeholder: "x" })])
    const { state, message } = run(document, {
      type: "reset-setting",
      id: "c_a",
      key: "placeholder",
    })
    expect(instanceOf(state, "c_a")).toEqual(field("a"))
    expect(message).toBe("Placeholder of a is back to its default.")
  })

  it("edits the form's own settings when no instance is named", () => {
    const { state } = run(form(), { type: "set-setting", id: null, key: "gap", value: "xl" })
    expect(state.document.settings).toEqual({ gap: "xl" })
    const reset = run(state, { type: "reset-setting", id: null, key: "gap" })
    expect(reset.state.document).not.toHaveProperty("settings")
    expect(run(form(), { type: "set-setting", id: null, key: "gap", value: "huge" }).changed).toBe(
      false,
    )
  })

  it("says when fewer columns hide components, and when more show them again", () => {
    const document = form([columns("row", { col1: [field("a")], col3: [field("b")] }, 3)])
    const fewer = run(document, { type: "set-setting", id: "c_row", key: "columns", value: 2 })
    expect(fewer.message).toBe(
      "Columns of row: 2. 1 component now hidden; it comes back when the region is shown again.",
    )
    // Kept in the document.
    expect(findInstance(fewer.state.document, "c_b")).not.toBeNull()
    const more = run(fewer.state, { type: "set-setting", id: "c_row", key: "columns", value: 3 })
    expect(more.message).toBe("Columns of row: 3. 1 component shown again.")
  })
})

describe("styles", () => {
  it("sets one property of one slot, and removes it again", () => {
    const set = run(form([field("a")]), {
      type: "set-style",
      id: "c_a",
      slot: "control",
      property: "background",
      value: { token: "muted" },
    })
    expect(instanceOf(set.state, "c_a")?.styles).toEqual({
      control: { background: { token: "muted" } },
    })
    expect(set.message).toBe("Background of control of a: the muted colour.")

    const more = run(set.state, {
      type: "set-style",
      id: "c_a",
      slot: "control",
      property: "padding",
      value: "lg",
    })
    expect(instanceOf(more.state, "c_a")?.styles).toEqual({
      control: { background: { token: "muted" }, padding: "lg" },
    })

    const removed = run(more.state, {
      type: "set-style",
      id: "c_a",
      slot: "control",
      property: "background",
      value: undefined,
    })
    expect(instanceOf(removed.state, "c_a")?.styles).toEqual({ control: { padding: "lg" } })
  })

  it("resets a whole slot, and styles with it when it was the last", () => {
    const document = form([{ ...field("a"), styles: { control: { padding: "lg" } } }])
    const { state } = run(document, { type: "reset-slot", id: "c_a", slot: "control" })
    expect(instanceOf(state, "c_a")).toEqual(field("a"))
  })

  it("refuses a slot the component does not have, and a value that is not valid", () => {
    const document = form([field("a")])
    const bad: Command[] = [
      { type: "set-style", id: "c_a", slot: "popup", property: "color", value: "#000000" },
      { type: "set-style", id: "c_a", slot: "label", property: "color", value: "red" },
      { type: "set-style", id: "c_a", slot: "label", property: "color", value: { token: "brand" } },
      { type: "set-style", id: "c_a", slot: "label", property: "radius", value: "huge" as "lg" },
    ]
    for (const command of bad) expect(run(document, command).changed).toBe(false)
  })
})

describe("the form's name and description", () => {
  it("renames the form, and refuses a blank name", () => {
    const { state } = run(form(), { type: "rename-form", name: "Contact" })
    expect(state.document.name).toBe("Contact")
    expect(run(form(), { type: "rename-form", name: "  " }).changed).toBe(false)
    expect(run(form(), { type: "rename-form", name: "x".repeat(201) }).changed).toBe(false)
  })

  it("sets the description, and removes it when it is emptied", () => {
    const described = run(form(), { type: "describe-form", description: "Who you are." })
    expect(described.state.document.description).toBe("Who you are.")
    const emptied = run(described.state, { type: "describe-form", description: "" })
    expect(emptied.state.document).not.toHaveProperty("description")
  })
})

describe("a run of edits is one undo step", () => {
  it("merges changes that carry the same run, and one undo restores the whole old value", () => {
    const start = form([withSettings(field("a"), { label: "Name" })])
    const typed = ["F", "Fi", "Fir", "First"].map((label): Command => ({
      type: "set-setting",
      id: "c_a",
      key: "label",
      value: label,
      merge: "r1",
    }))
    const { state, message } = run(start, ...typed)
    expect(instanceOf(state, "c_a")?.settings).toEqual({ label: "First" })
    expect(state.past).toHaveLength(1)
    // Only the first change of a run is said aloud.
    expect(message).toBeNull()

    const undone = run(state, { type: "undo" })
    expect(undone.state.document).toBe(start)
    expect(undone.state.past).toHaveLength(0)
  })

  it("starts a new step for a new run, and after any other change", () => {
    const start = form([field("a")])
    const step = (value: string, merge: string): Command => ({
      type: "set-setting",
      id: "c_a",
      key: "label",
      value,
      merge,
    })
    const two = run(start, step("A", "r1"), step("AB", "r1"), step("ABC", "r2"))
    expect(two.state.past).toHaveLength(2)

    const interrupted = run(
      start,
      step("A", "r1"),
      { type: "set-setting", id: "c_a", key: "required", value: true },
      step("AB", "r1"),
    )
    expect(interrupted.state.past).toHaveLength(3)
  })

  it("does not merge into a step that was undone and redone", () => {
    const start = form([field("a")])
    const step = (value: string): Command => ({
      type: "set-setting",
      id: "c_a",
      key: "label",
      value,
      merge: "r1",
    })
    const { state } = run(start, step("A"), { type: "undo" }, { type: "redo" }, step("AB"))
    expect(state.past).toHaveLength(2)
  })
})

describe("problems", () => {
  const outlineOf = (document: FormDocument) => schema.outline(document)

  it("explains an unknown type, with no fix", () => {
    const document = form([{ id: "c_x", type: "rating", name: "stars" }])
    const [problem, ...rest] = problemsOf(outlineOf(document).byId.get("c_x")!)
    expect(rest).toEqual([])
    expect(problem.message).toContain("no component of type “rating”")
    expect(problem.fix).toBeUndefined()
  })

  it("explains an invalid setting and offers a reset that works", () => {
    const document = form([withSettings(field("a"), { maxLength: -3, colour: "red" })])
    const problems = problemsOf(outlineOf(document).byId.get("c_a")!)
    expect(problems.map((problem) => problem.message)).toEqual([
      "Maximum length: -3 is not a valid maximum length; the default is used.",
      "“colour” is not a setting of Text field, so it is ignored.",
    ])
    expect(problems[0].fix?.label).toBe("Reset maximum length")
    const fixed = run(document, problems[0].fix!.command, problems[1].fix!.command)
    expect(instanceOf(fixed.state, "c_a")).toEqual(field("a"))
    expect(problemsOf(outlineOf(fixed.state.document).byId.get("c_a")!)).toEqual([])
  })

  it("explains an unknown slot and an unknown token, each with a fix", () => {
    const document = form([
      {
        ...field("a"),
        styles: { popup: { color: "#000000" }, label: { color: { token: "brand" } } },
      },
    ])
    const problems = problemsOf(outlineOf(document).byId.get("c_a")!)
    expect(problems).toHaveLength(2)
    let state = createEditorState(document)
    for (const problem of problems)
      state = runCommand(state, problem.fix!.command, environment).state
    expect(instanceOf(state, "c_a")).toEqual(field("a"))
  })

  it("explains children in a region the container no longer shows", () => {
    const document = form([columns("row", { col3: [field("a"), field("b")] })])
    const [problem] = problemsOf(outlineOf(document).byId.get("c_row")!)
    expect(problem.message).toBe(
      "2 components are in col3, a region row does not show now. They are kept, marked hidden in the outline, and come back when the region is shown again.",
    )
  })

  it("has nothing to say about an instance that is fine", () => {
    expect(problemsOf(outlineOf(form([field("a")])).byId.get("c_a")!)).toEqual([])
  })
})
