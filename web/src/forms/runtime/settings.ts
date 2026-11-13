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

export type Choice<T extends string = string> = { readonly value: T; readonly label: string }

export type Setting<T> = {
  readonly kind: SettingKind
  readonly label: string
  readonly help?: string
  readonly group: SettingGroup
  /** Used when an instance does not set this, or sets it wrongly. Never stored. */
  readonly default: T
  /** For `choice` settings: the values to choose from. */
  readonly choices?: readonly Choice[]
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
export function text(meta: Meta & { default: string }): Setting<string> {
  return {
    kind: "text",
    ...meta,
    parse: (stored) => (typeof stored === "string" ? stored : undefined),
  }
}

/** Optional text. Empty text counts as not set. */
export function optionalText(meta: Meta): Setting<string | null> {
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

type NumberLimits = { min?: number; max?: number; whole?: boolean }

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
  return { kind: "number", ...rest, parse: (stored) => readNumber(stored, { min, max, whole }) }
}

export function optionalNumber(meta: Meta & NumberLimits): Setting<number | null> {
  const { min, max, whole, ...rest } = meta
  return {
    kind: "number",
    ...rest,
    default: null,
    parse: (stored) => (stored === null ? null : readNumber(stored, { min, max, whole })),
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

export type SettingProblem = { readonly setting: string; readonly message: string }

/**
 * Stored settings merged over the defaults. A stored value its setting
 * rejects falls back to the default and is reported, as is a stored key the
 * component does not have.
 */
export function resolveSettings<S extends SettingsSchema>(
  schema: S,
  stored: Readonly<Record<string, unknown>> | undefined,
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
  return { settings: resolved as SettingsOf<S>, problems }
}
