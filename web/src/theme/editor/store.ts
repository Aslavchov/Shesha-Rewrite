import type { ThemeDocument, ThemeRecord } from "@/generated"

import type { Mode } from "../variables"
import {
  createThemeEditorState,
  runThemeCommand,
  type ThemeCommand,
  type ThemeCommandResult,
  type ThemeEditorState,
} from "./model"

/**
 * The state of the open theme editor, outside React, like `DesignerStore`:
 * the editing model, plus what belongs to the session and not to the theme.
 */
export type ThemeEditorSnapshot = {
  readonly editor: ThemeEditorState
  /** The theme the whole app uses now. The draft is compared with it. */
  readonly published: ThemeRecord
  /** What a screen reader was last told. `count` makes a repeated message a new one. */
  readonly announcement: { readonly text: string; readonly count: number }
  /** Goes up when the document jumps (undo, redo, a run taken back, a reload): fields drop drafts. */
  readonly epoch: number
  /** The component type whose defaults are being edited, or null. */
  readonly component: string | null
  /** The slot the Appearance editor points at, to outline it in the preview. */
  readonly highlight: string | null
  /** Which scheme the preview shows. */
  readonly previewMode: Mode
}

export class ThemeEditorStore {
  #snapshot: ThemeEditorSnapshot
  readonly #listeners = new Set<() => void>()

  constructor(draft: ThemeDocument, published: ThemeRecord, previewMode: Mode) {
    this.#snapshot = {
      editor: createThemeEditorState(draft),
      published,
      announcement: { text: "", count: 0 },
      epoch: 0,
      component: null,
      highlight: null,
      previewMode,
    }
  }

  readonly getSnapshot = (): ThemeEditorSnapshot => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Runs a command, and announces what it did or why it did nothing. */
  run(command: ThemeCommand): ThemeCommandResult {
    const result = runThemeCommand(this.#snapshot.editor, command)
    const jumps =
      result.changed &&
      (command.type === "undo" ||
        command.type === "redo" ||
        command.type === "revert-run" ||
        command.type === "replace")
    this.#set({
      editor: result.state,
      ...(jumps ? { epoch: this.#snapshot.epoch + 1 } : {}),
      ...(result.message === null ? {} : { announcement: this.#next(result.message) }),
    })
    return result
  }

  /** Starts again from what the server has: nothing to undo. */
  reset(draft: ThemeDocument, published: ThemeRecord): void {
    this.#set({
      editor: createThemeEditorState(draft),
      published,
      epoch: this.#snapshot.epoch + 1,
    })
  }

  setPublished(published: ThemeRecord): void {
    this.#set({ published })
  }

  selectComponent(component: string | null): void {
    if (component !== this.#snapshot.component) this.#set({ component, highlight: null })
  }

  setHighlight(highlight: string | null): void {
    if (highlight !== this.#snapshot.highlight) this.#set({ highlight })
  }

  setPreviewMode(previewMode: Mode): void {
    if (previewMode !== this.#snapshot.previewMode) this.#set({ previewMode })
  }

  announce(text: string): void {
    this.#set({ announcement: this.#next(text) })
  }

  #next(text: string) {
    return { text, count: this.#snapshot.announcement.count + 1 }
  }

  #set(change: Partial<ThemeEditorSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...change }
    for (const listener of this.#listeners) listener()
  }
}
