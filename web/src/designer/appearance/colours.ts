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
