import { describe, expect, it } from "vitest"

import { THEME_FORMAT_VERSION, type ThemeDocument } from "@/generated"

import {
  createThemeEditorState,
  EMPTY_THEME,
  isBuiltIn,
  runThemeCommand,
  sameTheme,
  type ThemeCommand,
  type ThemeEditorState,
} from "./model"

const start = (document: ThemeDocument = EMPTY_THEME) => createThemeEditorState(document)

function run(state: ThemeEditorState, ...commands: ThemeCommand[]) {
  let current = state
  for (const command of commands) current = runThemeCommand(current, command).state
  return current
}

const teal: ThemeCommand = { type: "set-color", role: "primary", mode: "light", value: "#0F766E" }

describe("the theme editing model (ADR 0010)", () => {
  it("stores only what differs from the built-in look", () => {
    const state = run(start(), teal)
    expect(state.document).toEqual({
      formatVersion: THEME_FORMAT_VERSION,
      colors: { primary: { light: "#0f766e" } },
    })
    const back = run(state, { type: "set-color", role: "primary", mode: "light", value: undefined })
    // No empty objects are left behind.
    expect(back.document).toEqual(EMPTY_THEME)
    expect(isBuiltIn(back.document)).toBe(true)
  })

  it("leaves a built-in scale value out", () => {
    const state = run(start(), { type: "set-radius", value: 12 }, { type: "set-radius", value: 8 })
    expect(state.document).toEqual(EMPTY_THEME)
    expect(run(start(), { type: "set-density", value: "compact" }).document.density).toBe("compact")
    expect(run(start(), { type: "set-text-size", value: 16 }).document.textSize).toBe(16)
  })

  it("refuses a change that changes nothing, at no cost to the history", () => {
    const result = runThemeCommand(run(start(), teal), teal)
    expect(result.changed).toBe(false)
    expect(result.state.past).toHaveLength(1)
  })

  it("sets component defaults by type, slot and property", () => {
    const state = run(start(), {
      type: "set-style",
      component: "button",
      name: "Button",
      slot: "root",
      property: "background",
      value: { token: "success" },
    })
    expect(state.document.components).toEqual({
      button: { root: { background: { token: "success" } } },
    })
    expect(
      run(state, { type: "reset-slot", component: "button", name: "Button", slot: "root" })
        .document,
    ).toEqual(EMPTY_THEME)
  })

  it("names the component in what it says about a default (Phase 5, section 8)", () => {
    const background = {
      type: "set-style",
      component: "card",
      name: "Card",
      slot: "root",
      property: "background",
    } as const
    const set = runThemeCommand(start(), { ...background, value: { token: "muted" } })
    expect(set.message).toBe("Background of Card's whole component: Muted.")
    expect(set.state.past.at(-1)?.label).toBe("Change background of Card's whole component")
    expect(runThemeCommand(set.state, { ...background, value: undefined }).message).toBe(
      "Background of Card's whole component is back to the component's own.",
    )
    // A name that ends in s takes the apostrophe alone.
    const tabs = runThemeCommand(start(), {
      type: "set-style",
      component: "tabs",
      name: "Tabs",
      slot: "tab",
      property: "fontWeight",
      value: "bold",
    })
    expect(tabs.message).toBe("Font weight of Tabs' tab: bold.")
    const reset = runThemeCommand(tabs.state, {
      type: "reset-slot",
      component: "tabs",
      name: "Tabs",
      slot: "tab",
    })
    expect(reset.message).toBe("Every style of Tabs' tab is back to the component's own.")
    expect(reset.state.past.at(-1)?.label).toBe("Reset Tabs' tab")
  })

  it("keeps a type it does not know until it is removed", () => {
    const unknown = { ...EMPTY_THEME, components: { gauge: { root: { radius: "full" as const } } } }
    const state = run(start(unknown), teal)
    expect(state.document.components).toEqual(unknown.components)
    const removed = run(state, { type: "reset-component", component: "gauge", name: "gauge" })
    expect(removed.document.components).toBeUndefined()
  })

  it("undoes and redoes whole documents", () => {
    const first = run(start(), teal)
    const second = run(first, { type: "set-radius", value: 12 })
    const undone = run(second, { type: "undo" })
    expect(undone.document).toBe(first.document)
    expect(run(undone, { type: "redo" }).document).toBe(second.document)
  })

  it("makes a run of edits one undo step, said once when it ends (ADR 0009)", () => {
    const typed = run(
      start(),
      { type: "set-radius", value: 9, merge: "r" },
      { type: "set-radius", value: 10, merge: "r" },
      { type: "set-radius", value: 11, merge: "r" },
    )
    expect(typed.past).toHaveLength(1)
    const ended = runThemeCommand(typed, { type: "end-run", merge: "r" })
    expect(ended.message).toBe("Roundness: 11 pixels.")
    expect(run(typed, { type: "undo" }).document).toEqual(EMPTY_THEME)
  })

  it("takes a run back when its field is left with a value that cannot be stored", () => {
    const typed = run(start(), { ...teal, merge: "hex" })
    const reverted = runThemeCommand(typed, { type: "revert-run", merge: "hex" })
    expect(reverted.changed).toBe(true)
    expect(reverted.state.document).toEqual(EMPTY_THEME)
    expect(reverted.state.past).toHaveLength(0)
  })

  it("replaces the whole document as one undoable step", () => {
    const state = run(start(), teal, { type: "set-radius", value: 4 })
    const reset = run(state, { type: "replace", document: EMPTY_THEME, label: "Reset" })
    expect(reset.document).toEqual(EMPTY_THEME)
    expect(run(reset, { type: "undo" }).document).toBe(state.document)
  })

  it("compares documents by value, whatever the order of keys", () => {
    expect(sameTheme({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true)
    expect(sameTheme({ a: 1 }, { a: 1, b: undefined })).toBe(false)
  })
})
