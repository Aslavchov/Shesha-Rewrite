import { colourName, slotLabel } from "@/designer/appearance/colours"
import { STYLE_PROPERTY_LABELS, type StyleProperty } from "@/designer/model/editor"
import { type SlotStyle, THEME_FORMAT_VERSION, type ThemeDocument } from "@/generated"

import {
  BUILT_IN_DENSITY,
  BUILT_IN_RADIUS,
  BUILT_IN_TEXT_SIZE,
  type ColorRole,
  type DensityStep,
  type Mode,
  roleName,
} from "../variables"

/**
 * The theme editor's editing model (ADR 0010). It follows the designer's
 * (ADR 0008 and 0009): pure, a command takes a state and returns the next
 * one; the undo history is a list of whole documents; a run of edits with
 * one `merge` key is one undo step, ended by `end-run` or taken back by
 * `revert-run`.
 *
 * Every document it produces is sparse: a key is there only when the theme
 * changes something, and empty objects are left out. So "the draft equals
 * the published theme" and "nothing is set" are plain comparisons.
 */

export type ThemeEditorState = {
  readonly document: ThemeDocument
  readonly past: readonly HistoryEntry[]
  readonly future: readonly HistoryEntry[]
}

export type HistoryEntry = {
  /** The change this entry undoes or redoes, such as "Change primary". */
  readonly label: string
  readonly document: ThemeDocument
  readonly merge?: string
  /** What the run's latest change would say aloud, when it ends. */
  readonly said?: string
}

export const HISTORY_LIMIT = 100

/** The theme with nothing set: the built-in look. */
export const EMPTY_THEME: ThemeDocument = { formatVersion: THEME_FORMAT_VERSION }

export function createThemeEditorState(document: ThemeDocument): ThemeEditorState {
  return { document, past: [], future: [] }
}

type Merged<T> = T & { readonly merge?: string }

export type ThemeCommand =
  /** One role's colour in one mode. `undefined` removes it: the built-in or derived value applies again. */
  | Merged<{
      readonly type: "set-color"
      readonly role: ColorRole
      readonly mode: Mode
      readonly value: string | undefined
    }>
  /** The base radius, in pixels. */
  | Merged<{ readonly type: "set-radius"; readonly value: number }>
  /** The base UI text size, in pixels. */
  | Merged<{ readonly type: "set-text-size"; readonly value: number }>
  | { readonly type: "set-density"; readonly value: DensityStep }
  /** One style property of one slot of a component type's defaults. `undefined` removes it. */
  | Merged<{
      readonly type: "set-style"
      readonly component: string
      readonly slot: string
      readonly property: StyleProperty
      readonly value: SlotStyle[StyleProperty] | undefined
    }>
  /** Every default of one slot of a component type. */
  | { readonly type: "reset-slot"; readonly component: string; readonly slot: string }
  /** Every default of one component type: also how an unknown type leaves the theme. */
  | { readonly type: "reset-component"; readonly component: string; readonly name: string }
  /** Another document as one step: discarding the draft, or resetting it to the built-in look. */
  | { readonly type: "replace"; readonly document: ThemeDocument; readonly label: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "end-run"; readonly merge: string }
  | { readonly type: "revert-run"; readonly merge: string }

export type ThemeCommandResult = {
  readonly state: ThemeEditorState
  /** Whether the document changed. */
  readonly changed: boolean
  /** What happened, or why nothing did, in words. Null when there is nothing to say. */
  readonly message: string | null
}

const isEmpty = (value: object | undefined) =>
  value === undefined || Object.keys(value).length === 0

/** The object without the key, or with it set; `undefined` when nothing is left. */
function withKey<T extends object, K extends keyof T>(
  object: T | undefined,
  key: K,
  value: T[K] | undefined,
): T | undefined {
  const { [key]: _removed, ...rest } = object ?? ({} as T)
  const next = value === undefined ? rest : { ...rest, [key]: value }
  return isEmpty(next) ? undefined : (next as T)
}

/** The same values, whatever the order of keys. */
export function sameTheme(one: unknown, other: unknown): boolean {
  if (one === other) return true
  if (typeof one !== "object" || typeof other !== "object" || one === null || other === null) {
    return false
  }
  const a = one as Record<string, unknown>
  const b = other as Record<string, unknown>
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && sameTheme(a[key], b[key]))
  )
}

/** Whether a theme sets nothing: the built-in look. */
export const isBuiltIn = (theme: ThemeDocument) => sameTheme(theme, EMPTY_THEME)

const MODE_SUFFIX: Record<Mode, string> = { light: "", dark: " in dark mode" }

type Change = { document: ThemeDocument; label: string; say: string }

/** What a command makes of the document, or null when it would leave it as it is. */
function apply(document: ThemeDocument, command: ThemeCommand): Change | null {
  switch (command.type) {
    case "set-color": {
      const { role, mode } = command
      const value = command.value?.toLowerCase()
      if (document.colors?.[role]?.[mode] === value) return null
      const colour = withKey(document.colors?.[role], mode, value)
      const name = `${roleName(role)}${MODE_SUFFIX[mode]}`
      return {
        document: withTop(document, "colors", withKey(document.colors, role, colour)),
        label: `Change ${name.toLowerCase()}`,
        say: value === undefined ? `${name} is no longer set.` : `${name}: ${value.toUpperCase()}.`,
      }
    }
    case "set-radius":
      return scale(document, "radius", command.value, BUILT_IN_RADIUS, {
        label: "Change roundness",
        say: `Roundness: ${command.value} pixels.`,
      })
    case "set-text-size":
      return scale(document, "textSize", command.value, BUILT_IN_TEXT_SIZE, {
        label: "Change text size",
        say: `Text size: ${command.value} pixels.`,
      })
    case "set-density":
      return scale(document, "density", command.value, BUILT_IN_DENSITY, {
        label: "Change density",
        say: `Density: ${command.value}.`,
      })
    case "set-style": {
      const { component, slot, property, value } = command
      const current = document.components?.[component]?.[slot]
      if (sameTheme(current?.[property], value)) return null
      const style = withKey(current, property, value)
      const label = STYLE_PROPERTY_LABELS[property]
      const part = slotLabel(slot).toLowerCase()
      return {
        document: withSlot(document, component, slot, style),
        label: `Change ${label.toLowerCase()} of ${part}`,
        say:
          value === undefined
            ? `${label} of ${part} is back to the component's own.`
            : `${label} of ${part}: ${typeof value === "object" ? colourName(value) : typeof value === "string" && value.startsWith("#") ? value.toUpperCase() : value}.`,
      }
    }
    case "reset-slot": {
      if (document.components?.[command.component]?.[command.slot] === undefined) return null
      const part = slotLabel(command.slot).toLowerCase()
      return {
        document: withSlot(document, command.component, command.slot, undefined),
        label: `Reset ${part}`,
        say: `Every style of ${part} is back to the component's own.`,
      }
    }
    case "reset-component": {
      if (document.components?.[command.component] === undefined) return null
      return {
        document: withTop(
          document,
          "components",
          withKey(document.components, command.component, undefined),
        ),
        label: `Remove the defaults of ${command.name}`,
        say: `${command.name} has no theme defaults now.`,
      }
    }
    case "replace":
      if (sameTheme(document, command.document)) return null
      return { document: command.document, label: command.label, say: `${command.label}.` }
    default:
      return null
  }
}

function withTop<K extends keyof ThemeDocument>(
  document: ThemeDocument,
  key: K,
  value: ThemeDocument[K] | undefined,
): ThemeDocument {
  const { [key]: _removed, ...rest } = document
  return (value === undefined ? rest : { ...rest, [key]: value }) as ThemeDocument
}

function withSlot(
  document: ThemeDocument,
  component: string,
  slot: string,
  style: SlotStyle | undefined,
): ThemeDocument {
  const slots = withKey(document.components?.[component], slot, style)
  return withTop(document, "components", withKey(document.components, component, slots))
}

/** A scale value: stored only when it is not the built-in one. */
function scale<K extends "radius" | "textSize" | "density">(
  document: ThemeDocument,
  key: K,
  value: NonNullable<ThemeDocument[K]>,
  builtIn: NonNullable<ThemeDocument[K]>,
  words: { label: string; say: string },
): Change | null {
  if ((document[key] ?? builtIn) === value) return null
  return { document: withTop(document, key, value === builtIn ? undefined : value), ...words }
}

const NOTHING_TO_UNDO = "Nothing to undo."
const NOTHING_TO_REDO = "Nothing to redo."
const NO_CHANGE = "Nothing changed: it is already so."

export function runThemeCommand(
  state: ThemeEditorState,
  command: ThemeCommand,
): ThemeCommandResult {
  switch (command.type) {
    case "undo": {
      const entry = state.past.at(-1)
      if (!entry) return { state, changed: false, message: NOTHING_TO_UNDO }
      return {
        state: {
          document: entry.document,
          past: state.past.slice(0, -1),
          // The run is over once it is undone: nothing merges into it again.
          future: [...state.future, { label: entry.label, document: state.document }],
        },
        changed: true,
        message: `Undid: ${entry.label}.`,
      }
    }
    case "redo": {
      const entry = state.future.at(-1)
      if (!entry) return { state, changed: false, message: NOTHING_TO_REDO }
      return {
        state: {
          document: entry.document,
          past: [...state.past, { label: entry.label, document: state.document }],
          future: state.future.slice(0, -1),
        },
        changed: true,
        message: `Redid: ${entry.label}.`,
      }
    }
    case "end-run": {
      const last = openRun(state, command.merge)
      return { state, changed: false, message: last?.said ?? null }
    }
    case "revert-run": {
      const last = openRun(state, command.merge)
      if (!last) return { state, changed: false, message: null }
      return {
        state: { document: last.document, past: state.past.slice(0, -1), future: [] },
        changed: true,
        message: null,
      }
    }
    default: {
      const merge = "merge" in command ? command.merge : undefined
      const change = apply(state.document, command)
      if (change === null) {
        return { state, changed: false, message: merge === undefined ? NO_CHANGE : null }
      }
      const last = merge === undefined ? undefined : openRun(state, merge)
      if (last) {
        // The run goes on: its step now leads to this document.
        const entry = { ...last, said: change.say }
        return {
          state: { ...state, document: change.document, past: [...state.past.slice(0, -1), entry] },
          changed: true,
          message: null,
        }
      }
      const entry: HistoryEntry = {
        label: change.label,
        document: state.document,
        ...(merge === undefined ? {} : { merge, said: change.say }),
      }
      return {
        state: {
          document: change.document,
          past: [...state.past, entry].slice(-HISTORY_LIMIT),
          future: [],
        },
        changed: true,
        // A run is said once, when it ends.
        message: merge === undefined ? change.say : null,
      }
    }
  }
}

/** The history entry of a run that can still be merged into: the last one, with nothing undone since. */
function openRun(state: ThemeEditorState, merge: string): HistoryEntry | undefined {
  const last = state.past.at(-1)
  return last?.merge === merge && state.future.length === 0 ? last : undefined
}
