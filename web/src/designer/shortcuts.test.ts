import { describe, expect, it } from "vitest"

import { matchShortcut, shortcutHelp, shortcutText } from "./shortcuts"

const press = (
  key: string,
  modifiers: Partial<Record<"ctrl" | "meta" | "alt" | "shift", true>> = {},
) => ({
  key,
  ctrlKey: modifiers.ctrl ?? false,
  metaKey: modifiers.meta ?? false,
  altKey: modifiers.alt ?? false,
  shiftKey: modifiers.shift ?? false,
})

describe("the designer's shortcuts", () => {
  it("uses Ctrl on Windows and Linux", () => {
    expect(matchShortcut(press("z", { ctrl: true }), false)).toBe("undo")
    expect(matchShortcut(press("y", { ctrl: true }), false)).toBe("redo")
    expect(matchShortcut(press("Z", { ctrl: true, shift: true }), false)).toBe("redo")
    expect(matchShortcut(press("d", { ctrl: true }), false)).toBe("duplicate")
    // Command is not the platform's key here.
    expect(matchShortcut(press("z", { meta: true }), false)).toBeNull()
  })

  it("uses Command on Apple platforms", () => {
    expect(matchShortcut(press("z", { meta: true }), true)).toBe("undo")
    expect(matchShortcut(press("z", { meta: true, shift: true }), true)).toBe("redo")
    expect(matchShortcut(press("d", { meta: true }), true)).toBe("duplicate")
    expect(matchShortcut(press("z", { ctrl: true }), true)).toBeNull()
    // Command+Y is not redo on a Mac.
    expect(matchShortcut(press("y", { meta: true }), true)).toBeNull()
  })

  it("moves with Alt and the arrow keys, deletes with Delete or Backspace, clears with Escape", () => {
    expect(matchShortcut(press("ArrowUp", { alt: true }), false)).toBe("move-up")
    expect(matchShortcut(press("ArrowDown", { alt: true }), true)).toBe("move-down")
    expect(matchShortcut(press("Delete"), false)).toBe("delete")
    expect(matchShortcut(press("Backspace"), true)).toBe("delete")
    expect(matchShortcut(press("Escape"), false)).toBe("clear-selection")
  })

  it("leaves every other key alone", () => {
    for (const event of [
      press("ArrowUp"),
      press("ArrowLeft", { alt: true }),
      press("ArrowUp", { alt: true, shift: true }),
      press("Delete", { shift: true }),
      press("Delete", { ctrl: true }),
      press("z"),
      press("z", { ctrl: true, alt: true }),
      press("s", { ctrl: true }),
      press("Enter"),
    ]) {
      expect(matchShortcut(event, false), JSON.stringify(event)).toBeNull()
    }
  })

  it("lists every shortcut it understands, in the platform's own words", () => {
    const labels = shortcutHelp(false).map((help) => help.label)
    for (const label of ["Undo", "Redo", "Duplicate", "Delete"]) expect(labels).toContain(label)

    const text = (apple: boolean, label: string) =>
      shortcutHelp(apple)
        .find((help) => help.label === label)
        ?.keys.map((keys) => shortcutText(keys, apple))
    expect(text(false, "Undo")).toEqual(["Ctrl+Z"])
    expect(text(true, "Undo")).toEqual(["⌘Z"])
    expect(text(false, "Redo")).toEqual(["Ctrl+Y", "Ctrl+Shift+Z"])
    expect(text(true, "Redo")).toEqual(["⇧⌘Z"])
    expect(text(false, "Move up, into and out of containers")).toEqual(["Alt+↑"])
  })
})
