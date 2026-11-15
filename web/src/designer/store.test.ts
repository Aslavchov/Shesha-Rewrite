import { describe, expect, it, vi } from "vitest"

import { DesignerStore } from "./store"
import { field, form, schema } from "./testing/documents"

const setup = () => new DesignerStore(form([field("a"), field("b")]), schema)

describe("the designer's store", () => {
  it("starts in design mode with nothing selected and nothing to undo", () => {
    const { editor, mode, announcement } = setup().getSnapshot()
    expect(mode).toBe("design")
    expect(editor.selection).toBeNull()
    expect(editor.past).toEqual([])
    expect(announcement.text).toBe("")
  })

  it("runs a command, tells its subscribers and announces what happened", () => {
    const store = setup()
    const listener = vi.fn()
    store.subscribe(listener)

    const result = store.run({ type: "remove", id: "c_a" })

    expect(result.changed).toBe(true)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.getSnapshot().editor.document.components).toEqual([field("b")])
    expect(store.getSnapshot().announcement).toEqual({ text: "Deleted a.", count: 1 })
  })

  it("announces a refusal too, and the same words twice count as two announcements", () => {
    const store = setup()
    store.run({ type: "undo" })
    store.run({ type: "undo" })
    expect(store.getSnapshot().announcement).toEqual({ text: "Nothing to undo.", count: 2 })
  })

  it("selecting says nothing", () => {
    const store = setup()
    store.select("c_b")
    expect(store.getSnapshot().editor.selection).toBe("c_b")
    expect(store.getSnapshot().announcement.count).toBe(0)
  })

  it("a dry run changes nothing", () => {
    const store = setup()
    const before = store.getSnapshot()
    const listener = vi.fn()
    store.subscribe(listener)

    expect(store.dryRun({ type: "remove", id: "c_a" }).changed).toBe(true)

    expect(store.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it("keeps the same snapshot until something changes, so subscribers can compare", () => {
    const store = setup()
    const before = store.getSnapshot()
    store.setMode("design")
    store.select(null)
    expect(store.getSnapshot().editor).toBe(before.editor)
    expect(store.getSnapshot().mode).toBe("design")
  })

  it("asks for focus in the view that last had it, or the one named", () => {
    const store = setup()
    store.focusSelection()
    expect(store.getSnapshot().focus).toEqual({ surface: "canvas", count: 1 })

    store.noteSurface("outline")
    store.focusSelection()
    expect(store.getSnapshot().focus).toEqual({ surface: "outline", count: 2 })

    store.focusSelection("canvas")
    expect(store.getSnapshot().focus).toEqual({ surface: "canvas", count: 3 })
  })

  it("switching to preview and back keeps the document, the selection and the history", () => {
    const store = setup()
    store.run({ type: "remove", id: "c_a" })
    store.select("c_b")
    const { editor } = store.getSnapshot()

    store.setMode("preview")
    store.setMode("design")

    expect(store.getSnapshot().editor).toBe(editor)
  })

  it("starts again from another document: nothing selected, no history", () => {
    const store = setup()
    store.run({ type: "remove", id: "c_a" })
    const reloaded = form([field("z")])

    store.reset(reloaded)

    const { editor } = store.getSnapshot()
    expect(editor.document).toBe(reloaded)
    expect(editor.selection).toBeNull()
    expect(editor.past).toEqual([])
    expect(editor.future).toEqual([])
  })

  it("stops telling a subscriber that has unsubscribed", () => {
    const store = setup()
    const listener = vi.fn()
    store.subscribe(listener)()
    store.run({ type: "remove", id: "c_a" })
    expect(listener).not.toHaveBeenCalled()
  })

  it("shows a tab on the canvas when asked, and the tab of whatever is selected", () => {
    const tabsInstance = {
      id: "c_t",
      type: "tabs",
      name: "t",
      regions: { tab2: [field("inner")] },
    }
    const store = new DesignerStore(form([tabsInstance]), schema)
    store.showRegion("c_t", "tab1")
    expect(store.getSnapshot().shownRegions.get("c_t")).toBe("tab1")

    // Selecting what is inside another tab shows that tab.
    store.select("c_inner")
    expect(store.getSnapshot().shownRegions.get("c_t")).toBe("tab2")

    // Asking for what is shown already changes nothing.
    const before = store.getSnapshot()
    store.showRegion("c_t", "tab2")
    expect(store.getSnapshot()).toBe(before)
  })

  it("points at one slot of one instance, and at nothing", () => {
    const store = setup()
    store.setHighlight({ id: "c_a", slot: "label" })
    expect(store.getSnapshot().highlight).toEqual({ id: "c_a", slot: "label" })
    const before = store.getSnapshot()
    store.setHighlight({ id: "c_a", slot: "label" })
    expect(store.getSnapshot()).toBe(before)
    store.setHighlight(null)
    expect(store.getSnapshot().highlight).toBeNull()
  })
})
