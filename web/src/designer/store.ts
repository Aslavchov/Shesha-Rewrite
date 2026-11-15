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
  /**
   * For containers that show one region at a time (Tabs): the region the
   * author chose to see, by container id. Choosing a tab on the canvas or in
   * the properties panel sets it; selecting something inside a tab shows
   * that tab.
   */
  readonly shownRegions: ReadonlyMap<string, string>
  /** The part of an instance the properties panel points at, to outline it on the canvas. */
  readonly highlight: { readonly id: string; readonly slot: string } | null
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
      shownRegions: new Map(),
      highlight: null,
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
      shownRegions: this.#revealing(result.state.document, result.state.selection),
      ...(result.message === null ? {} : { announcement: this.#next(result.message) }),
    })
    return result
  }

  /** Shows a region of a container that shows one at a time, on the canvas. */
  showRegion(id: string, region: string): void {
    if (this.#snapshot.shownRegions.get(id) === region) return
    this.#set({ shownRegions: new Map(this.#snapshot.shownRegions).set(id, region) })
  }

  /** Points at one slot of an instance on the canvas, or at nothing. */
  setHighlight(highlight: { id: string; slot: string } | null): void {
    const current = this.#snapshot.highlight
    if (current?.id === highlight?.id && current?.slot === highlight?.slot) return
    this.#set({ highlight })
  }

  /**
   * The shown regions, with every container around the selection showing
   * the region the selection is in, so that what is selected is on the
   * canvas. The same map when nothing needs to change.
   */
  #revealing(document: FormDocument, selection: string | null): ReadonlyMap<string, string> {
    const current = this.#snapshot.shownRegions
    if (selection === null) return current
    let next: Map<string, string> | null = null
    const outline = this.schema.outline(document)
    for (let node = outline.byId.get(selection); node?.parent; node = node.parent) {
      const { parent, position } = node
      if ((next ?? current).get(parent.instance.id) === position.region) continue
      next ??= new Map(current)
      next.set(parent.instance.id, position.region)
    }
    return next ?? current
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
