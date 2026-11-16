import { slotStyle } from "@/forms/runtime"
import type { ComponentInstance, FormDocument, PropertyDefinition, SlotStyle } from "@/generated"

import { createId, cryptoRandom, type RandomIndex } from "./ids"
import { pathsClash, type Taken, takeName } from "./names"
import { applyOperation, type Operation, type Refusal } from "./operations"
import { countInside, type Outline, type OutlineNode, regionAt, type Schema } from "./schema"
import { FORM_OWNER, ownerOf, type SettingsOwner, settingProblem } from "./settings"
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
  /**
   * The run of edits this entry stands for (ADR 0009). A change that carries
   * the same `merge` as the last entry replaces the document after it
   * instead of adding a step, so a run of keystrokes is undone at once.
   */
  readonly merge?: string
  /**
   * What the run's latest change would say aloud. A run is announced once,
   * with its final value, when it ends (`end-run`), not keystroke by keystroke.
   */
  readonly said?: string
}

/** The style properties of a slot (ADR 0006). */
export type StyleProperty = keyof SlotStyle

/** How many changes can be undone. Older ones are dropped. */
export const HISTORY_LIMIT = 100

export function createEditorState(document: FormDocument): EditorState {
  return { document, selection: null, past: [], future: [] }
}

export type Command =
  /** A new instance of a component type. Without `at`: after the selection, or at the end of the form. */
  | {
      readonly type: "add"
      readonly component: string
      readonly at?: Position
      /**
       * The entity property the instance is for (Phase 5, ADR 0011). It is
       * then bound to the property, named after it when that name is free,
       * and starts with the settings its component takes from the property.
       */
      readonly property?: PropertyDefinition
    }
  /** `to.index` counts the region without the instance (see `Operation`). */
  | { readonly type: "move"; readonly id: string; readonly to: Position }
  /** One place up or down in document order, into and out of containers. */
  | { readonly type: "step"; readonly id: string; readonly direction: "up" | "down" }
  | { readonly type: "remove"; readonly id: string }
  | { readonly type: "duplicate"; readonly id: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "select"; readonly id: string | null }
  // Phase 3 (ADR 0009). Each can carry `merge`: changes in a row with the
  // same `merge` are one step in the history. The properties panel gives
  // every field a new one each time it is focused.
  | Merged<{ readonly type: "rename"; readonly id: string; readonly name: string }>
  | Merged<{ readonly type: "bind"; readonly id: string; readonly path: string }>
  /** One setting of an instance, or of the form when `id` is null. */
  | Merged<{
      readonly type: "set-setting"
      readonly id: string | null
      readonly key: string
      readonly value: unknown
    }>
  | Merged<{ readonly type: "reset-setting"; readonly id: string | null; readonly key: string }>
  /** One style property of one slot. `undefined` removes the override. */
  | Merged<{
      readonly type: "set-style"
      readonly id: string
      readonly slot: string
      readonly property: StyleProperty
      readonly value: SlotStyle[StyleProperty] | undefined
    }>
  /** Every override of one slot. */
  | { readonly type: "reset-slot"; readonly id: string; readonly slot: string }
  | Merged<{ readonly type: "rename-form"; readonly name: string }>
  | Merged<{ readonly type: "describe-form"; readonly description: string }>

  /**
   * The run of edits `merge` is over and its result is kept: says once what
   * it did, with the final value. Nothing changes.
   */
  | { readonly type: "end-run"; readonly merge: string }
  /**
   * The run of edits `merge` is over and its result is not kept, because the
   * field was left with a value that cannot be stored: the document goes
   * back to what it was before the run, and the run leaves no undo step.
   */
  | { readonly type: "revert-run"; readonly merge: string }

type Merged<T> = T & { readonly merge?: string }

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
  "invalid-name": "That is not a valid name.",
  "name-taken": "Another component already has that name.",
  "invalid-path": "That is not a valid data path.",
  "path-clash": "Another component already stores its value there.",
  "invalid-form-name": "That is not a valid name for a form.",
  "invalid-description": "That description is too long.",
  "not-bound": "This component has no data path.",
}

/** The style properties, in the order they are shown. */
export const STYLE_PROPERTIES: readonly StyleProperty[] = [
  "color",
  "background",
  "borderColor",
  "radius",
  "fontWeight",
  "padding",
]

/** What a style property is called in words. */
export const STYLE_PROPERTY_LABELS: Record<StyleProperty, string> = {
  color: "Text colour",
  background: "Background",
  borderColor: "Border colour",
  radius: "Corner radius",
  fontWeight: "Font weight",
  padding: "Padding",
}

/** How many instances sit in regions their container does not show, anywhere in the form. */
function hiddenCount(outline: Outline): number {
  let count = 0
  for (const node of outline.order) {
    if (node.parent?.shown && !regionAt(outline, node.position)?.shown)
      count += 1 + countInside(node)
  }
  return count
}

const components = (count: number) => (count === 1 ? "1 component" : `${count} components`)

export function runCommand(
  state: EditorState,
  command: Command,
  environment: EditorEnvironment,
): CommandResult {
  const { schema } = environment
  const outline = schema.outline(state.document)
  const nothing = (message: string | null): CommandResult => ({ state, changed: false, message })

  /** The history entry of the run `merge`, if the last change belongs to it and nothing was undone since. */
  function runEntry(merge: string | undefined): HistoryEntry | null {
    const last = state.past.at(-1)
    return merge !== undefined && last?.merge === merge && state.future.length === 0 ? last : null
  }

  /**
   * Applies one operation and records it in the history. With `merge`, a
   * change that continues the run of the last entry replaces that entry's
   * "after" instead of adding a step. A change in a run says nothing aloud
   * yet: what it would say is kept for when the run ends.
   */
  function change(
    operation: Operation,
    label: string,
    selection: string | null,
    describe: (after: Outline) => string,
    merge?: string,
  ): CommandResult {
    const applied = applyOperation(state.document, operation, schema)
    if (!applied.ok) return nothing(REFUSALS[applied.refusal])
    const said = describe(schema.outline(applied.document))
    const running = runEntry(merge)
    if (running) {
      return {
        state: {
          ...state,
          document: applied.document,
          selection,
          past: [...state.past.slice(0, -1), { ...running, said }],
        },
        changed: true,
        message: null,
      }
    }
    const entry: HistoryEntry = {
      label,
      document: state.document,
      selection: state.selection,
      ...(merge === undefined ? {} : { merge, said }),
    }
    return {
      state: {
        document: applied.document,
        selection,
        past: [...state.past, entry].slice(-HISTORY_LIMIT),
        future: [],
      },
      changed: true,
      message: merge === undefined ? said : null,
    }
  }

  /** Whose settings a command means, and how it is named in messages. */
  function owner(id: string | null): { owner: SettingsOwner; name: string } | string {
    if (id === null) return { owner: FORM_OWNER, name: "the form" }
    const node = outline.byId.get(id)
    if (!node) return REFUSALS["not-found"]
    if (!node.definition) return "A component of an unknown type cannot be configured."
    return { owner: ownerOf(node.definition), name: node.instance.name }
  }

  /** A setting change, said with what it does to hidden components. */
  function settingChange(
    operation: Operation,
    label: string,
    said: string,
    merge?: string,
  ): CommandResult {
    // Measured from the start of the run, so the run says what it did as a whole.
    const before = runEntry(merge)?.document
    const hiddenBefore = hiddenCount(before ? schema.outline(before) : outline)
    return change(
      operation,
      label,
      state.selection,
      (after) => {
        const hiddenAfter = hiddenCount(after)
        if (hiddenAfter > hiddenBefore) {
          return `${said} ${components(hiddenAfter - hiddenBefore)} now hidden; ${hiddenAfter - hiddenBefore === 1 ? "it comes" : "they come"} back when the region is shown again.`
        }
        if (hiddenAfter < hiddenBefore) {
          return `${said} ${components(hiddenBefore - hiddenAfter)} shown again.`
        }
        return said
      },
      merge,
    )
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
      const taken = takenIn(state.document)
      const property = bound ? command.property : undefined
      if (property && [...taken.paths].some((path) => pathsClash(property.name, path))) {
        return nothing(`${property.displayName} is already on the form.`)
      }
      // For a property: its own name when that is free. Otherwise the rule of
      // ADR 0008: the type and the lowest free number.
      const name =
        property && !taken.names.has(property.name)
          ? property.name
          : takeName(command.component, bound && !property, taken)
      const settings = property ? (definition.forProperty?.(property) ?? {}) : {}
      const instance: ComponentInstance = {
        id: createId(idsIn(state.document), environment.random ?? cryptoRandom),
        type: command.component,
        name,
        // An input is bound to a data path equal to its name, or to its
        // property. Without a property no settings are stored: a new
        // instance uses its component's defaults.
        ...(bound ? { bind: property?.name ?? name } : {}),
        ...(Object.keys(settings).length > 0 ? { settings } : {}),
      }
      const at = command.at ?? afterSelection(outline, state.selection)
      return change(
        { type: "insert", instance, at },
        `Add ${name}`,
        instance.id,
        (after) =>
          `Added ${definition.displayName} ${name}${property ? ` for ${property.displayName}` : ""} at ${place(after, instance.id)}.`,
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

    case "rename": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const before = node.instance.name
      return change(
        { type: "rename", id: command.id, name: command.name },
        `Rename ${before}`,
        state.selection,
        () => `Renamed ${before} to ${command.name}.`,
        command.merge,
      )
    }

    case "bind": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const { name } = node.instance
      return change(
        { type: "bind", id: command.id, path: command.path },
        `Change the data path of ${name}`,
        state.selection,
        () => `${name} now stores its value under ${command.path}.`,
        command.merge,
      )
    }

    case "set-setting": {
      const found = owner(command.id)
      if (typeof found === "string") return nothing(found)
      const stored =
        command.id === null
          ? state.document.settings
          : outline.byId.get(command.id)?.instance.settings
      const problem = settingProblem(found.owner, stored, command.key, command.value)
      if (problem !== null) return nothing(problem)
      const setting = found.owner.settings[command.key]
      const label = setting?.label ?? command.key
      return settingChange(
        { type: "set-setting", id: command.id, key: command.key, value: command.value },
        `Change ${label.toLowerCase()} of ${found.name}`,
        `${label} of ${found.name}: ${describeValue(setting?.parse(command.value), setting?.choices)}.`,
        command.merge,
      )
    }

    case "reset-setting": {
      const found = owner(command.id)
      if (typeof found === "string") return nothing(found)
      const label = found.owner.settings[command.key]?.label ?? `“${command.key}”`
      return settingChange(
        { type: "reset-setting", id: command.id, key: command.key },
        `Reset ${label.toLowerCase()} of ${found.name}`,
        `${label} of ${found.name} is back to its default.`,
        command.merge,
      )
    }

    case "set-style": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const current = node.instance.styles?.[command.slot] ?? {}
      const { [command.property]: _, ...rest } = current
      const style: SlotStyle =
        command.value === undefined ? rest : { ...rest, [command.property]: command.value }
      if (command.value !== undefined) {
        if (!node.definition?.slots.includes(command.slot)) {
          return nothing(`${node.instance.name} has no part called ${command.slot}.`)
        }
        const checked = slotStyle(command.slot, { [command.property]: command.value })
        if (checked.problems.length > 0) return nothing("That is not a valid style value.")
      }
      const label = STYLE_PROPERTY_LABELS[command.property]
      const { name } = node.instance
      return change(
        { type: "set-style", id: command.id, slot: command.slot, style },
        `Change ${label.toLowerCase()} of ${command.slot} of ${name}`,
        state.selection,
        () =>
          command.value === undefined
            ? `${label} of ${command.slot} of ${name} is back to its default.`
            : `${label} of ${command.slot} of ${name}: ${describeStyle(command.value)}.`,
        command.merge,
      )
    }

    case "reset-slot": {
      const node = outline.byId.get(command.id)
      if (!node) return nothing(REFUSALS["not-found"])
      const { name } = node.instance
      return change(
        { type: "set-style", id: command.id, slot: command.slot, style: {} },
        `Reset the styles of ${command.slot} of ${name}`,
        state.selection,
        () => `The styles of ${command.slot} of ${name} are back to their defaults.`,
      )
    }

    case "rename-form":
      return change(
        { type: "rename-form", name: command.name },
        "Rename the form",
        state.selection,
        () => `Renamed the form to ${command.name}.`,
        command.merge,
      )

    case "describe-form":
      return change(
        { type: "describe-form", description: command.description },
        "Change the form's description",
        state.selection,
        () =>
          command.description === ""
            ? "Removed the form's description."
            : "Changed the form's description.",
        command.merge,
      )

    case "end-run":
      return nothing(runEntry(command.merge)?.said ?? null)

    case "revert-run": {
      const entry = runEntry(command.merge)
      if (!entry) return nothing(null)
      // The selection is not part of the run: it stays, if it still can.
      const keeps =
        state.selection !== null && schema.outline(entry.document).byId.has(state.selection)
      return {
        state: {
          document: entry.document,
          selection: keeps ? state.selection : entry.selection,
          past: state.past.slice(0, -1),
          future: state.future,
        },
        changed: true,
        message: `Taken back: ${entry.label}. What was typed is not valid.`,
      }
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

/** A setting's value in words, for an announcement. */
function describeValue(
  value: unknown,
  choices: readonly { value: string; label: string }[] | undefined,
): string {
  if (value === null || value === undefined) return "none"
  if (typeof value === "boolean") return value ? "on" : "off"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") {
    const choice = choices?.find((candidate) => candidate.value === value)
    if (choice) return choice.label
    return value.length > 60 ? `“${value.slice(0, 57)}…”` : `“${value}”`
  }
  if (Array.isArray(value)) return value.length === 1 ? "1 item" : `${value.length} items`
  return "changed"
}

/** A style value in words: a token's name, a colour, or a step of a scale. */
function describeStyle(value: SlotStyle[StyleProperty]): string {
  if (typeof value === "object" && value !== null) return `the ${value.token} colour`
  return String(value)
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
  const label = parent.regions.find((candidate) => candidate.name === region)?.label ?? region
  return parent.regions.length > 1 ? `${label} of ${parent.instance.name}` : parent.instance.name
}
