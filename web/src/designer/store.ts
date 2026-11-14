import type { FormDocument } from "@/generated"

import {
  type Command,
  type CommandResult,
  createEditorState,
  type EditorState,
  runCommand,
} from "./model/editor"
import type { Schema } from "./model/schema"

/**
 * The state of one open designer, outside React (like `FormStore`): the
 * editing model, plus the few things about the session that are not part of
 * the document. Components subscribe to the part they show, so selecting an
 * instance re-renders two outlines, not the whole canvas.
 */

export type DesignerMode = "design" | "preview"

/** The two views that show the tree and can hold keyboard focus on an instance. */
export type Surface = "canvas" | "outline"

export type DesignerSnapshot = {
  readonly editor: EditorState
  readonly mode: DesignerMode
  /** What a screen reader was last told. `count` makes a repeated message a new one. */
  readonly announcement: { readonly text: string; readonly count: number }
  /** A request to put keyboard focus on the selection in one view. `count` goes up each time. */
  readonly focus: { readonly surface: Surface; readonly count: number }
}

export class DesignerStore {
  readonly schema: Schema
  #snapshot: DesignerSnapshot
  readonly #listeners = new Set<() => void>()
  /** The view that last held keyboard focus: where focus returns after a command. */
  #lastSurface: Surface = "canvas"

  constructor(document: FormDocument, schema: Schema) {
    this.schema = schema
    this.#snapshot = {
      editor: createEditorState(document),
      mode: "design",
      announcement: { text: "", count: 0 },
      focus: { surface: "canvas", count: 0 },
    }
  }

  readonly getSnapshot = (): DesignerSnapshot => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Runs a command, and announces what it did or why it did nothing. */
  run(command: Command): CommandResult {
    const result = runCommand(this.#snapshot.editor, command, { schema: this.schema })
    this.#set({
      editor: result.state,
      ...(result.message === null ? {} : { announcement: this.#next(result.message) }),
    })
    return result
  }

  /** What a command would do, without doing it. */
  dryRun(command: Command): CommandResult {
    return runCommand(this.#snapshot.editor, command, { schema: this.schema })
  }

  select(id: string | null): void {
    this.run({ type: "select", id })
  }

  setMode(mode: DesignerMode): void {
    if (mode !== this.#snapshot.mode) this.#set({ mode })
  }

  announce(text: string): void {
    this.#set({ announcement: this.#next(text) })
  }

  /** Records which view holds keyboard focus. */
  noteSurface(surface: Surface): void {
    this.#lastSurface = surface
  }

  /** Asks a view to take keyboard focus on the selection: the one given, or the last one used. */
  focusSelection(surface: Surface = this.#lastSurface): void {
    this.#set({ focus: { surface, count: this.#snapshot.focus.count + 1 } })
  }

  /** Starts again from another document: nothing selected, no history. */
  reset(document: FormDocument): void {
    this.#set({ editor: createEditorState(document) })
  }

  #next(text: string) {
    return { text, count: this.#snapshot.announcement.count + 1 }
  }

  #set(change: Partial<DesignerSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...change }
    for (const listener of this.#listeners) listener()
  }
}
