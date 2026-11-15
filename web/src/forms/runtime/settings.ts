import type { Space } from "@/generated"

import { isIsoDate } from "./dates"
import { isRecord } from "./json"

/**
 * Setting descriptors (ADR 0004). A component declares each setting once:
 * its default, how it is presented, and how a stored JSON value is read. The
 * renderer uses the default and the parser now; the properties panel
 * (Phase 3) is generated from the rest.
 */

/** The section of the properties panel a setting belongs to. */
export type SettingGroup = "general" | "data" | "validation" | "layout"

/** Which editor the properties panel uses for a setting. */
export type SettingKind =
  | "text"
  | "number"
  | "boolean"
  | "choice"
  | "date"
  | "pattern"
  | "options"
  | "number-list"
  | "messages"
  | "tabs"

export type Choice<T extends string = string> = { readonly value: T; readonly label: string }

/** The bounds a number setting accepts. */
export type NumberLimits = {
  readonly min?: number
  readonly max?: number
  readonly whole?: boolean
}

/**
 * Settings resolved but not yet typed: what `choicesFrom` reads. Each value
 * is the stored value if valid, else the default.
 */
export type ResolvedSettings = Readonly<Record<string, unknown>>

export type Setting<T> = {
  readonly kind: SettingKind
  readonly label: string
  readonly help?: string
  readonly group: SettingGroup
  /** Used when an instance does not set this, or sets it wrongly. Never stored. */
  readonly default: T
  /** For `choice` settings: the values to choose from. */
  readonly choices?: readonly Choice[]
  /**
   * For `choice` settings whose values come from another setting (a default
   * that must be one of the options): the values to choose from, given the
   * instance's other settings. Added in Phase 3 (ADR 0009).
   */
  readonly choicesFrom?: (settings: ResolvedSettings) => readonly Choice[]
  /** For `number` settings: the bounds the parser accepts, so an editor can say them. */
  readonly limits?: NumberLimits
  /** For `text` settings: the text may run over several lines. */
  readonly multiline?: boolean
  /** Reads a stored JSON value; `undefined` means it is not valid here. */
  readonly parse: (stored: unknown) => T | undefined
}

export type SettingsSchema = Readonly<Record<string, Setting<unknown>>>

/** The resolved settings a renderer receives, typed from the descriptors. */
export type SettingsOf<S extends SettingsSchema> = {
  readonly [K in keyof S]: S[K] extends Setting<infer T> ? T : never
}

type Meta = { label: string; help?: string; group: SettingGroup }

/** A piece of text that always has a value. */
export function text(meta: Meta & { default: string; multiline?: boolean }): Setting<string> {
  return {
    kind: "text",
    ...meta,
    parse: (stored) => (typeof stored === "string" ? stored : undefined),
  }
}

/** Optional text. Empty text counts as not set. */
export function optionalText(meta: Meta & { multiline?: boolean }): Setting<string | null> {
  return {
    kind: "text",
    ...meta,
    default: null,
    parse: (stored) =>
      stored === null ? null : typeof stored === "string" ? stored || null : undefined,
  }
}

export function toggle(meta: Meta & { default: boolean }): Setting<boolean> {
  return {
    kind: "boolean",
    ...meta,
    parse: (stored) => (typeof stored === "boolean" ? stored : undefined),
  }
}

function readNumber(stored: unknown, { min, max, whole }: NumberLimits): number | undefined {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return undefined
  if (whole && !Number.isInteger(stored)) return undefined
  if (min !== undefined && stored < min) return undefined
  if (max !== undefined && stored > max) return undefined
  return stored
}

/** A number that always has a value, optionally whole and within limits. */
export function number(meta: Meta & NumberLimits & { default: number }): Setting<number> {
  const { min, max, whole, ...rest } = meta
  const limits = { min, max, whole }
  return { kind: "number", ...rest, limits, parse: (stored) => readNumber(stored, limits) }
}

export function optionalNumber(meta: Meta & NumberLimits): Setting<number | null> {
  const { min, max, whole, ...rest } = meta
  const limits = { min, max, whole }
  return {
    kind: "number",
    ...rest,
    limits,
    default: null,
    parse: (stored) => (stored === null ? null : readNumber(stored, limits)),
  }
}

/** One of a fixed list of values. */
export function choice<const T extends string>(
  meta: Meta & { choices: readonly Choice<T>[]; default: NoInfer<T> },
): Setting<T> {
  return {
    kind: "choice",
    ...meta,
    parse: (stored) => meta.choices.find((candidate) => candidate.value === stored)?.value,
  }
}

const SPACE_CHOICES: readonly Choice<Space>[] = [
  { value: "none", label: "None" },
  { value: "xs", label: "Extra small" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra large" },
]

/**
 * An optional choice among values another setting provides, such as the
 * default of a choice control, which must be one of its options. Any text is
 * read; a value that is not among the choices is the renderer's to ignore.
 */
export function optionalChoiceFrom(
  meta: Meta & { from: (settings: ResolvedSettings) => readonly Choice[] },
): Setting<string | null> {
  const { from, ...rest } = meta
  return {
    kind: "choice",
    ...rest,
    default: null,
    choicesFrom: from,
    parse: (stored) =>
      stored === null ? null : typeof stored === "string" ? stored || null : undefined,
  }
}

/** A step of the space scale, for gaps. */
export function space(meta: Meta & { default: Space }): Setting<Space> {
  return choice({ ...meta, choices: SPACE_CHOICES })
}

/** An optional calendar date, stored as "YYYY-MM-DD". */
export function optionalDate(meta: Meta): Setting<string | null> {
  return {
    kind: "date",
    ...meta,
    default: null,
    parse: (stored) => (stored === null ? null : isIsoDate(stored) ? stored : undefined),
  }
}

/** Whether `source` compiles as a regular expression the whole value must match. */
export function compilePattern(source: string): RegExp | null {
  try {
    return new RegExp(`^(?:${source})$`, "u")
  } catch {
    return null
  }
}

/** An optional regular expression, stored as its source text. */
export function optionalPattern(meta: Meta): Setting<string | null> {
  return {
    kind: "pattern",
    ...meta,
    default: null,
    parse: (stored) => {
      if (stored === null || stored === "") return null
      return typeof stored === "string" && compilePattern(stored) ? stored : undefined
    },
  }
}

export type Option = { readonly label: string; readonly value: string }

function isOption(value: unknown): value is Option {
  return (
    isRecord(value) &&
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    value.value !== ""
  )
}

/** The options of a choice control: label and value pairs with distinct values. */
export function options(meta: Meta): Setting<readonly Option[]> {
  return {
    kind: "options",
    ...meta,
    default: [],
    parse: (stored) => {
      if (!Array.isArray(stored) || !stored.every(isOption)) return undefined
      const values = new Set(stored.map((option) => option.value))
      return values.size === stored.length ? stored : undefined
    },
  }
}

/** The choices a list of options offers: each option's label, or its value when it has none. */
export function optionChoices(stored: unknown): readonly Choice[] {
  const parsed = Array.isArray(stored) && stored.every(isOption) ? stored : []
  return parsed.map((option) => ({ value: option.value, label: option.label || option.value }))
}

/** A tab of a component that shows one region at a time: the region's key and the tab's label. */
export type Tab = { readonly key: string; readonly label: string }

/** What a region name may be (ADR 0003): the server checks the same. */
const REGION_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/

function isTab(value: unknown): value is Tab {
  return isRecord(value) && typeof value.label === "string" && typeof value.key === "string"
}

/**
 * Tabs, each with a stable key and a label. The key names the tab's region,
 * so renaming a tab never moves its content (Phase 3, frozen by ADR 0009).
 * At least one tab; keys distinct and valid region names.
 */
export function tabs(meta: Meta & { default: readonly Tab[] }): Setting<readonly Tab[]> {
  return {
    kind: "tabs",
    ...meta,
    parse: (stored) => {
      if (!Array.isArray(stored) || stored.length === 0 || !stored.every(isTab)) return undefined
      if (!stored.every((tab) => REGION_KEY.test(tab.key))) return undefined
      const keys = new Set(stored.map((tab) => tab.key))
      return keys.size === stored.length ? stored : undefined
    },
  }
}

/** An optional list of whole numbers of at least 1, such as column proportions. */
export function optionalProportions(meta: Meta): Setting<readonly number[] | null> {
  return {
    kind: "number-list",
    ...meta,
    default: null,
    parse: (stored) => {
      if (stored === null) return null
      if (!Array.isArray(stored) || stored.length === 0) return undefined
      const isProportion = (item: unknown): item is number =>
        readNumber(item, { min: 1, whole: true }) !== undefined
      return stored.every(isProportion) ? stored : undefined
    },
  }
}

export type Messages = Readonly<Record<string, string>>

function isMessages(value: unknown): value is Messages {
  return isRecord(value) && Object.values(value).every((message) => typeof message === "string")
}

/**
 * Custom validation messages, keyed by rule id. `defineInput` adds this to
 * every input that has rules; components do not declare it themselves.
 */
export const messagesSetting: Setting<Messages> = {
  kind: "messages",
  label: "Messages",
  help: "Replace the default message of a rule.",
  group: "validation",
  default: {},
  parse: (stored) => (isMessages(stored) ? stored : undefined),
}

export type SettingProblem = {
  readonly setting: string
  readonly message: string
  /** For a broken constraint: every setting it reads, `setting` first. */
  readonly related?: readonly string[]
}

/**
 * A rule between settings that each read correctly on their own, such as a
 * minimum that must not be above its maximum (ADR 0009). It returns the
 * problem, about the first setting it names, or null.
 */
export type SettingsConstraint<T> = {
  /** The settings it reads. The problem is reported on the first. */
  readonly settings: readonly string[]
  readonly check: (settings: T) => string | null
}

/**
 * Stored settings merged over the defaults. A stored value its setting
 * rejects falls back to the default and is reported, as is a stored key the
 * component does not have.
 */
export function resolveSettings<S extends SettingsSchema>(
  schema: S,
  stored: Readonly<Record<string, unknown>> | undefined,
  constraints: readonly SettingsConstraint<SettingsOf<S>>[] = [],
): { settings: SettingsOf<S>; problems: SettingProblem[] } {
  const resolved: Record<string, unknown> = {}
  const problems: SettingProblem[] = []

  for (const [key, setting] of Object.entries(schema)) {
    resolved[key] = setting.default
    if (stored === undefined || !Object.hasOwn(stored, key)) continue
    const parsed = setting.parse(stored[key])
    if (parsed === undefined) {
      problems.push({
        setting: key,
        message: `${JSON.stringify(stored[key])} is not a valid ${setting.label.toLowerCase()}; the default is used.`,
      })
    } else {
      resolved[key] = parsed
    }
  }
  for (const key of Object.keys(stored ?? {})) {
    if (!Object.hasOwn(schema, key)) {
      problems.push({ setting: key, message: "This component has no such setting; it is ignored." })
    }
  }

  // The one place the inferred settings type is asserted: each key was just
  // filled from its own descriptor's default or parser.
  const settings = resolved as SettingsOf<S>
  for (const constraint of constraints) {
    const message = constraint.check(settings)
    const [setting] = constraint.settings
    if (message !== null && setting !== undefined) {
      problems.push({ setting, message, related: constraint.settings })
    }
  }
  return { settings, problems }
}
