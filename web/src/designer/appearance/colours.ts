import type { ColorValue } from "@/generated"

/**
 * The theme colours the Appearance editor offers first, with names a person
 * would use. Each is a system token (`--sys-color-<token>`), so a style that
 * uses one follows light and dark mode, and later the theme. The rest of the
 * tokens stay valid in a document; they are offered under "More".
 */
export const THEME_COLOURS: readonly { token: string; label: string }[] = [
  { token: "foreground", label: "Text" },
  { token: "muted-foreground", label: "Muted text" },
  { token: "primary", label: "Primary" },
  { token: "primary-foreground", label: "On primary" },
  { token: "destructive", label: "Destructive" },
  { token: "success", label: "Success" },
  { token: "warning", label: "Warning" },
  { token: "info", label: "Information" },
  { token: "background", label: "Background" },
  { token: "surface", label: "Surface" },
  { token: "surface-raised", label: "Raised surface" },
  { token: "muted", label: "Muted" },
  { token: "subtle", label: "Subtle" },
  { token: "border", label: "Border" },
  { token: "border-control", label: "Control border" },
]

export const HEX_COLOUR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i

/** A colour with no transparency: what a theme's own colours are (ADR 0010). */
export const OPAQUE_HEX_COLOUR = /^#[0-9a-f]{6}$/i

/** A colour in words: a theme colour's name, or the hex value. */
export function colourName(value: ColorValue | undefined): string | null {
  if (value === undefined) return null
  if (typeof value === "string") return value.toUpperCase()
  return THEME_COLOURS.find((colour) => colour.token === value.token)?.label ?? value.token
}

/** The CSS a swatch is painted with: the token, or the literal colour. */
export function swatchColour(value: ColorValue): string {
  return typeof value === "string" ? value : `var(--sys-color-${value.token})`
}

/** A slot's name in words. `root` is the whole component. */
export function slotLabel(slot: string): string {
  if (slot === "root") return "Whole component"
  const words = slot.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  return words[0].toUpperCase() + words.slice(1)
}

/** A colour offered as a swatch, with the name a person would use for it. */
export type ColourChoice = { readonly value: ColorValue; readonly label: string }

/**
 * What a picker offers above the custom colour, and how it words it. The
 * Appearance editor offers the theme colours; the theme editor, which sets
 * those colours, offers a palette of plain ones (ADR 0010).
 */
export type ColourChoices = {
  readonly title: string
  /** What choosing one of these means, after the title. */
  readonly note?: string
  readonly choices: readonly ColourChoice[]
  /** Said after "Custom colour". */
  readonly customNote?: string
  /** Whether a custom colour may carry transparency (`#RRGGBBAA`). */
  readonly alpha?: boolean
  /** The test id of one choice. */
  readonly testId: (choice: ColourChoice) => string
}

export const tokenOf = (value: ColorValue) => (typeof value === "string" ? value : value.token)

export const sameColour = (one: ColorValue | undefined, other: ColorValue) =>
  one !== undefined &&
  typeof one === typeof other &&
  tokenOf(one).toLowerCase() === tokenOf(other).toLowerCase()

/** The theme colours, as the Appearance editor offers them. */
export function themeColourChoices(testIdPrefix: string): ColourChoices {
  return {
    title: "Theme colours",
    note: "follow light and dark mode",
    choices: THEME_COLOURS.map((colour) => ({
      value: { token: colour.token },
      label: colour.label,
    })),
    customNote: "stays the same in dark mode",
    alpha: true,
    testId: (choice) => `${testIdPrefix}-token-${tokenOf(choice.value)}`,
  }
}
