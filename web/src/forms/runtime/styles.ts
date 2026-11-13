import type * as React from "react"

import type { SlotStyle } from "@/generated"

import { isRecord } from "./json"

/**
 * Slot style overrides (ADR 0006): the one place a document's typed style
 * values become CSS. Components never build styles themselves; they spread
 * the `SlotProps` they are given onto the element each slot names.
 */

/** The system colour tokens a document may refer to: `--sys-color-<name>`. */
export const COLOR_TOKENS = [
  "background",
  "foreground",
  "surface",
  "surface-foreground",
  "surface-raised",
  "surface-raised-foreground",
  "muted",
  "muted-foreground",
  "subtle",
  "subtle-hover",
  "subtle-foreground",
  "primary",
  "primary-hover",
  "primary-foreground",
  "destructive",
  "border",
  "border-control",
  "focus-ring",
  "overlay",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
] as const

export const RADIUS_STEPS = ["none", "sm", "md", "lg", "xl", "2xl", "full"] as const
export const FONT_WEIGHTS = ["normal", "medium", "semibold"] as const
export const SPACE_STEPS = ["none", "xs", "sm", "md", "lg", "xl"] as const

/** What a renderer spreads onto the element a slot names. */
export type SlotProps = { readonly style?: React.CSSProperties }

/** The root slot also carries the instance's test id. */
export type RootSlotProps = SlotProps & { readonly "data-testid": string }

export type StyleProblem = { readonly slot: string; readonly message: string }

const HEX_COLOUR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i

const includes = (list: readonly string[], value: unknown): value is string =>
  typeof value === "string" && list.includes(value)

/** A colour value as CSS, or null if it is neither a literal nor a known token. */
function colour(value: unknown): string | null {
  if (typeof value === "string") return HEX_COLOUR.test(value) ? value : null
  if (!isRecord(value)) return null
  return includes(COLOR_TOKENS, value.token) ? `var(--sys-color-${value.token})` : null
}

/** The scale step as a token reference, or null if it is not on the scale. */
function step(scale: readonly string[], prefix: string, value: unknown): string | null {
  return includes(scale, value) ? `var(--sys-${prefix}-${value})` : null
}

type Property = {
  /** The CSS property the value is written to. */
  css: "color" | "backgroundColor" | "borderColor" | "borderRadius" | "fontWeight" | "padding"
  read: (value: unknown) => string | null
}

const PROPERTIES: Record<keyof SlotStyle, Property> = {
  color: { css: "color", read: colour },
  background: { css: "backgroundColor", read: colour },
  borderColor: { css: "borderColor", read: colour },
  radius: { css: "borderRadius", read: (value) => step(RADIUS_STEPS, "radius", value) },
  fontWeight: { css: "fontWeight", read: (value) => step(FONT_WEIGHTS, "font-weight", value) },
  padding: { css: "padding", read: (value) => step(SPACE_STEPS, "space", value) },
}

const isProperty = (key: string): key is keyof SlotStyle => Object.hasOwn(PROPERTIES, key)

/**
 * One slot's overrides as a `style` object holding only what was overridden.
 * Each value is a token reference or the document's literal colour. Anything
 * unknown or malformed is left out and reported.
 */
export function slotStyle(
  slot: string,
  overrides: Readonly<Record<string, unknown>>,
): { style: React.CSSProperties | undefined; problems: StyleProblem[] } {
  const style: React.CSSProperties = {}
  const problems: StyleProblem[] = []

  for (const [key, value] of Object.entries(overrides)) {
    if (!isProperty(key)) {
      problems.push({ slot, message: `"${key}" is not a style property; it is ignored.` })
      continue
    }
    const css = PROPERTIES[key].read(value)
    if (css === null) {
      problems.push({
        slot,
        message: `${JSON.stringify(value)} is not a valid ${key}; it is ignored.`,
      })
    } else {
      style[PROPERTIES[key].css] = css
    }
  }
  return { style: Object.keys(style).length > 0 ? style : undefined, problems }
}

export type Slots<Slot extends string> = { readonly root: RootSlotProps } & {
  readonly [K in Exclude<Slot, "root">]: SlotProps
}

/**
 * The props for each of a component's slots. Overrides for a slot the
 * component does not have are reported and ignored.
 */
export function resolveSlots<Slot extends string>(
  slots: readonly Slot[],
  name: string,
  stored: Readonly<Record<string, SlotStyle>> | undefined,
): { slots: Slots<Slot>; problems: StyleProblem[] } {
  const problems: StyleProblem[] = []
  const resolved: Record<string, SlotProps> = {}

  for (const slot of slots) {
    const overrides = stored?.[slot]
    if (overrides === undefined) {
      resolved[slot] = {}
      continue
    }
    const result = slotStyle(slot, overrides)
    problems.push(...result.problems)
    resolved[slot] = result.style ? { style: result.style } : {}
  }
  for (const slot of Object.keys(stored ?? {})) {
    if (!slots.some((known) => known === slot)) {
      problems.push({ slot, message: "This component has no such slot; its styles are ignored." })
    }
  }

  const root: RootSlotProps = { ...resolved.root, "data-testid": `field-${name}` }
  // The one place the slot map's type is asserted: every declared slot was
  // just filled above.
  return { slots: { ...resolved, root } as Slots<Slot>, problems }
}
