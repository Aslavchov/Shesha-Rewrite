import type { ComponentInstance, FormDocument } from "@/generated"

import { createId, cryptoRandom, type RandomIndex } from "./ids"
import { type Taken, takeName } from "./names"
import { applyOperation, type Operation, type Refusal } from "./operations"
import { countInside, type Outline, type OutlineNode, regionAt, type Schema } from "./schema"
import { allInstances, type Position, ROOT_REGION, rootPosition, samePosition } from "./tree"

/**
 * The designer's editing model (ADR 0008): the document being edited, what is
 * selected, and the undo history. Pure: a command takes a state and returns
 * the next one, so the same code runs in the designer and in its tests.
 *
 * History is a list of whole documents. A change shares every instance it
 * did not touch with the document before it, so a step costs little, and
 * undo can never disagree with what was there: it puts the same object back.
 */

export type EditorState = {
  readonly document: FormDocument
  /** The id of the selected instance. */
  readonly selection: string | null
  /** The states before each change, oldest first. */
  readonly past: readonly HistoryEntry[]
  /** The states undo left behind, next to redo last. */
  readonly future: readonly HistoryEntry[]
}

export type HistoryEntry = {
  /** The change this entry undoes or redoes, such as "Delete textField1". */
  readonly label: string
  readonly document: FormDocument
  readonly selection: string | null
}

/** How many changes can be undone. Older ones are dropped. */
export const HISTORY_LIMIT = 100

export function createEditorState(document: FormDocument): EditorState {
  return { document, selection: null, past: [], future: [] }
}

export type Command =
  /** A new instance of a component type. Without `at`: after the selection, or at the end of the form. */
  | { readonly type: "add"; readonly component: string; readonly at?: Position }
  /** `to.index` counts the region without the instance (see `Operation`). */
  | { readonly type: "move"; readonly id: string; readonly to: Position }
  /** One place up or down in document order, into and out of containers. */
  | { readonly type: "step"; readonly id: string; readonly direction: "up" | "down" }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "duplicate"; readonly id: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "select"; readonly id: string | null }

export type CommandResult = {
  readonly state: EditorState
  /** Whether the document changed. */
  readonly changed: boolean
  /** What happened, or why nothing did, in words. Null when there is nothing to say. */
  readonly message: string | null
}

export type EditorEnvironment = {
  readonly schema: Schema
  /** The source of randomness for new ids. Tests pass their own. */
  readonly random?: RandomIndex
}

const REFUSALS: Record<Refusal, string> = {
  "not-found": "That component is no longer in the form.",
  "no-such-region": "Nothing can be placed there.",
  "inside-itself": "A component cannot be moved inside itself.",
  "no-change": "It is already there.",
  "too-deep": "That would nest components too deeply.",
  "too-large": "The form is too large to hold more.",
}

export function runCommand(
  state: EditorState,
  command: Command,
  environment: EditorEnvironment,
): CommandResult {
  const { schema } = environment
  const outline = schema.outline(state.document)
  const nothing = (message: string | null): CommandResult => ({ state, changed: false, message })

  /** Applies one operation and records it in the history. */
  function change(
    operation: Operation,
    label: string,
    selection: string | null,
    describe: (after: Outline) => string,
  ): CommandResult {
    const applied = applyOperation(state.document, operation, schema)
    if (!applied.ok) return nothing(REFUSALS[applied.refusal])
    const entry: HistoryEntry = { label, document: state.document, selection: state.selection }
    return {
      state: {
        document: applied.document,
        selection,
        past: [...state.past, entry].slice(-HISTORY_LIMIT),
        future: [],
      },
      changed: true,
      message: describe(schema.outline(applied.document)),
    }
  }

  switch (command.type) {
    case "select": {
      const selection = command.id !== null && outline.byId.has(command.id) ? command.id : null
      if (selection === state.selection) return nothing(null)
      return { state: { ...state, selection }, changed: false, message: null }
    }

    case "add": {
      const definition = schema.registry.get(command.component)
      if (!definition) return nothing(`There is no component type "${command.component}".`)

      const bound = definition.kind === "input"
      const name = takeName(command.component, bound, takenIn(state.document))
      const instance: ComponentInstance = {
        id: createId(idsIn(state.document), environment.random ?? cryptoRandom),
        type: command.component,
        name,
        // An input is bound to a data path equal to its name. No settings are
        // stored: a new instance uses its component's defaults.
        ...(bound ? { bind: name } : {}),
      }
      const at = command.at ?? afterSelection(outline, state.selection)
      return change(
        { type: "insert", instance, at },
        `Add ${name}`,
        instance.id,
        (after) => `Added ${definition.displayName} ${name} at ${place(after, instance.id)}.`,
      )
    }

    case "move": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const { name } = node.instance
      return change(
        { type: "move", id: command.id, to: command.to },
        `Move ${name}`,
        command.id,
        (after) => `Moved ${name} to ${place(after, command.id)}.`,
      )
    }

    case "step": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const { name } = node.instance
      // The nearest place first. One that would nest too deeply is passed over.
      for (const to of stepsFrom(outline, node, command.direction)) {
        const result = change(
          { type: "move", id: command.id, to },
          `Move ${name}`,
          command.id,
          (after) => `Moved ${name} to ${place(after, command.id)}.`,
        )
        if (result.changed) return result
      }
      return nothing(
        `${name} is already at the ${command.direction === "up" ? "top" : "bottom"} of the form.`,
      )
    }

    case "remove": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const { name } = node.instance
      const inside = countInside(node)
      return change(
        { type: "remove", id: command.id },
        `Delete ${name}`,
        neighbour(outline, node),
        () =>
          inside === 0
            ? `Deleted ${name}.`
            : `Deleted ${name} and the ${inside === 1 ? "component" : `${inside} components`} inside it.`,
      )
    }

    case "duplicate": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const copy = copyOf(node, state.document, environment)
      const at = { ...node.position, index: node.position.index + 1 }
      return change(
        { type: "insert", instance: copy, at },
        `Duplicate ${node.instance.name}`,
        copy.id,
        (after) => `Duplicated ${node.instance.name} as ${copy.name}, at ${place(after, copy.id)}.`,
      )
    }

    case "undo": {
      const entry = state.past.at(-1)
      if (!entry) return nothing("Nothing to undo.")
      const current = { label: entry.label, document: state.document, selection: state.selection }
      return {
        state: {
          document: entry.document,
          selection: entry.selection,
          past: state.past.slice(0, -1),
          future: [...state.future, current],
        },
        changed: true,
        message: `Undid: ${entry.label}.`,
      }
    }

    case "redo": {
      const entry = state.future.at(-1)
      if (!entry) return nothing("Nothing to redo.")
      const current = { label: entry.label, document: state.document, selection: state.selection }
      return {
        state: {
          document: entry.document,
          selection: entry.selection,
          past: [...state.past, current],
          future: state.future.slice(0, -1),
        },
        changed: true,
        message: `Redid: ${entry.label}.`,
      }
    }
  }
}

function idsIn(document: FormDocument): Set<string> {
  const ids = new Set<string>()
  for (const instance of allInstances(document)) ids.add(instance.id)
  return ids
}

function takenIn(document: FormDocument): Taken {
  const taken: Taken = { names: new Set(), paths: new Set() }
  for (const instance of allInstances(document)) {
    taken.names.add(instance.name)
    if (typeof instance.bind === "string") taken.paths.add(instance.bind)
  }
  return taken
}

/** Where a new instance goes when no place is given (spec 3.4). */
function afterSelection(outline: Outline, selection: string | null): Position {
  const selected = selection === null ? undefined : outline.byId.get(selection)
  // After something the form does not show, the new instance would not show either.
  if (!selected?.shown) return rootPosition(outline.roots.length)
  return { ...selected.position, index: selected.position.index + 1 }
}

/** What to select once `node` is gone: the next sibling, else the previous, else its container. */
function neighbour(outline: Outline, node: OutlineNode): string | null {
  const siblings = regionAt(outline, node.position)?.children ?? []
  const next = siblings[node.position.index + 1] ?? siblings[node.position.index - 1]
  return (next ?? node.parent)?.instance.id ?? null
}

/**
 * A copy of an instance and everything inside it. Every copied instance gets
 * a new id and a new name, and its data path, if it has or needs one, becomes
 * its new name. Settings and styles are kept.
 */
function copyOf(
  node: OutlineNode,
  document: FormDocument,
  environment: EditorEnvironment,
): ComponentInstance {
  const ids = idsIn(document)
  const taken = takenIn(document)

  function copy(original: OutlineNode): ComponentInstance {
    const { regions: _, bind, ...rest } = original.instance
    const bound = bind !== undefined || original.definition?.kind === "input"
    const id = createId(ids, environment.random ?? cryptoRandom)
    ids.add(id)
    const name = takeName(original.instance.type, bound, taken)
    const regions = Object.fromEntries(
      original.regions
        .filter((region) => region.children.length > 0)
        .map((region) => [region.name, region.children.map(copy)]),
    )
    return {
      ...rest,
      id,
      name,
      ...(bound ? { bind: name } : {}),
      ...(Object.keys(regions).length > 0 ? { regions } : {}),
    }
  }
  return copy(node)
}

/**
 * Every place `moving` could be put, in document order, with it taken out:
 * before and after each other instance, and inside every region. Stepping up
 * or down walks this list, which is how the keyboard reaches every position.
 */
function placesFor(
  outline: Outline,
  moving: OutlineNode,
): { position: Position; shown: boolean }[] {
  const places: { position: Position; shown: boolean }[] = []

  function region(
    parent: string | null,
    name: string,
    children: readonly OutlineNode[],
    shown: boolean,
  ) {
    const others = children.filter((child) => child !== moving)
    for (const [index, child] of others.entries()) {
      places.push({ position: { parent, region: name, index }, shown })
      for (const inner of child.regions) {
        region(child.instance.id, inner.name, inner.children, inner.shown)
      }
    }
    places.push({ position: { parent, region: name, index: others.length }, shown })
  }

  region(null, ROOT_REGION, outline.roots, true)
  return places
}

/** The places one step, two steps, … up or down from where `node` is, nearest first. */
function stepsFrom(outline: Outline, node: OutlineNode, direction: "up" | "down"): Position[] {
  const places = placesFor(outline, node)
  const current = places.findIndex((candidate) => samePosition(candidate.position, node.position))
  const onward = direction === "up" ? places.slice(0, current).reverse() : places.slice(current + 1)
  return onward.filter((candidate) => candidate.shown).map((candidate) => candidate.position)
}

/** Where an instance is, in words: "position 2 of 3 in col1 of columns1". */
export function place(outline: Outline, id: string): string {
  const node = outline.byId.get(id)
  if (!node) return "the form"
  const siblings = regionAt(outline, node.position)?.children.length ?? 1
  const where = node.parent ? regionLabel(node.parent, node.position.region) : "the form"
  return `position ${node.position.index + 1} of ${siblings} in ${where}`
}

/** A region in words. A container with one region is named by itself. */
export function regionLabel(parent: OutlineNode, region: string): string {
  return parent.regions.length > 1 ? `${region} of ${parent.instance.name}` : parent.instance.name
}
