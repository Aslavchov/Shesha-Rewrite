/**
 * The designer's keyboard shortcuts: what each is, how it is shown, and which
 * key event means it. Kept in one place so that the handler and the list
 * people read can never disagree.
 */

export type ShortcutId =
  "undo" | "redo" | "duplicate" | "delete" | "move-up" | "move-down" | "clear-selection"

/** Whether this is an Apple platform, where shortcuts use Command instead of Ctrl. */
export function isApplePlatform(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
}

type KeyPress = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">

/** The shortcut a key event stands for, if any. */
export function matchShortcut(event: KeyPress, apple = isApplePlatform()): ShortcutId | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  // The platform's own command key, and only that one.
  const command = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey

  if (command && !event.altKey) {
    if (key === "z") return event.shiftKey ? "redo" : "undo"
    if (key === "y" && !apple && !event.shiftKey) return "redo"
    if (key === "d" && !event.shiftKey) return "duplicate"
    return null
  }
  if (event.ctrlKey || event.metaKey) return null

  if (event.altKey && !event.shiftKey) {
    if (key === "ArrowUp") return "move-up"
    if (key === "ArrowDown") return "move-down"
    return null
  }
  if (event.altKey || event.shiftKey) return null

  if (key === "Delete" || key === "Backspace") return "delete"
  if (key === "Escape") return "clear-selection"
  return null
}

export type ShortcutHelp = {
  readonly label: string
  /** Alternatives, each a list of keys pressed together. */
  readonly keys: readonly (readonly string[])[]
}

/** Every shortcut, as people read it, for this platform. */
export function shortcutHelp(apple = isApplePlatform()): readonly ShortcutHelp[] {
  const command = apple ? "⌘" : "Ctrl"
  const option = apple ? "⌥" : "Alt"
  return [
    { label: "Add the focused toolbox component", keys: [["Enter"]] },
    { label: "Select the previous or next component", keys: [["↑"], ["↓"]] },
    { label: "Move up, into and out of containers", keys: [[option, "↑"]] },
    { label: "Move down, into and out of containers", keys: [[option, "↓"]] },
    { label: "Duplicate", keys: [[command, "D"]] },
    { label: "Delete", keys: apple ? [["⌫"], ["Delete"]] : [["Delete"], ["Backspace"]] },
    { label: "Undo", keys: [[command, "Z"]] },
    {
      label: "Redo",
      keys: apple
        ? [["⇧", command, "Z"]]
        : [
            [command, "Y"],
            [command, "Shift", "Z"],
          ],
    },
    { label: "Clear the selection, or cancel a drag", keys: [["Esc"]] },
  ]
}

/** One alternative of a shortcut as a single string, for a tooltip: "Ctrl+Z" or "⌘Z". */
export function shortcutText(keys: readonly string[], apple = isApplePlatform()): string {
  return keys.join(apple ? "" : "+")
}
