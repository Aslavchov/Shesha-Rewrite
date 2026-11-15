import type { ThemeDocument } from "@/generated"
import {
  THEME_COLOR_ROLES,
  THEME_FORMAT_VERSION,
  THEME_RADIUS_MAX,
  THEME_RADIUS_MIN,
  THEME_TEXT_SIZE_MAX,
  THEME_TEXT_SIZE_MIN,
} from "@/generated/theme"

import { contrast, isHex, mix, toHex, toOklch } from "./colour"

/**
 * From a theme document to the `--theme-*` custom properties that
 * `tokens.css` reads (ADR 0010). This is the only place a theme's values
 * become CSS. It is pure, and imports nothing that runs but `./colour`,
 * because the script that applies the published theme before first paint is
 * built from it.
 *
 * A theme is sparse: what it does not set keeps the built-in look, which
 * lives in `tokens.css`. So every function here answers "what does the theme
 * change", never "what does the app look like".
 */

export type Mode = "light" | "dark"
export const MODES: readonly Mode[] = ["light", "dark"]

/** The colours a theme sets, in the order the editor lists them. */
export const COLOR_ROLES = THEME_COLOR_ROLES
export type ColorRole = (typeof COLOR_ROLES)[number]

/**
 * The built-in look of each role as hex: the same colours as `tokens.css`,
 * which holds them in OKLCH. The editor shows them for a role the theme does
 * not set, and contrast is measured against them. A test reads `tokens.css`
 * and fails if the two ever differ.
 */
export const BUILT_IN: Readonly<Record<ColorRole, Readonly<Record<Mode, string>>>> = {
  primary: { light: "#003bb2", dark: "#70a1ff" },
  destructive: { light: "#e40017", dark: "#ff6568" },
  success: { light: "#05773b", dark: "#52d982" },
  warning: { light: "#9e5700", dark: "#fec84b" },
  info: { light: "#003bb2", dark: "#a0c1ff" },
  background: { light: "#ffffff", dark: "#080a0e" },
  sidebar: { light: "#f9fafb", dark: "#15181d" },
}

/** Built-in text colours that sit on themed colours, as hex (see `BUILT_IN`). */
export const BUILT_IN_TEXT = {
  /** `--ref-neutral-950` and `--ref-neutral-50`: the strongest text on a light and on a dark surface. */
  strong: { onLight: "#080a0e", onDark: "#f9fafb" },
  /** `--ref-neutral-700` and `--ref-neutral-300`: the sidebar's quieter text. */
  quiet: { onLight: "#3b4048", onDark: "#d1d4da" },
  /** `--ref-neutral-500` and `--ref-neutral-400`: muted text, light and dark mode. */
  muted: { light: "#686d77", dark: "#9ca1aa" },
} as const

export const BUILT_IN_RADIUS = 8
export const BUILT_IN_TEXT_SIZE = 14
export const DENSITIES = ["compact", "regular", "comfortable"] as const
export type DensityStep = (typeof DENSITIES)[number]
export const BUILT_IN_DENSITY: DensityStep = "regular"

/** The space unit of each density, in rem. Every gap, padding and control height is a multiple of it. */
const SPACE_UNIT: Readonly<Record<DensityStep, string>> = {
  compact: "0.21875rem",
  regular: "0.25rem",
  comfortable: "0.28125rem",
}

/** The text contrast WCAG AA asks for. */
export const MINIMUM_CONTRAST = 4.5

/** The lightness and the most chroma a derived dark accent has: ADR 0002's dark brand blue. */
const DARK_ACCENT = { l: 0.715, c: 0.148 }
/** The dark page background and sidebar: the lightness of the built-in ones. */
const DARK_SURFACE = { background: { l: 0.145, c: 0.02 }, sidebar: { l: 0.208, c: 0.025 } }

export type ColorSource =
  /** Set in the theme for this mode. */
  | "set"
  /** Dark only: worked out from the light value the theme sets. */
  | "derived"
  /** The theme says nothing: the built-in look. */
  | "built-in"

export type ResolvedColor = { readonly value: string; readonly source: ColorSource }

/**
 * The dark value that goes with a light one: the same hue, at a lightness
 * that reads on a dark page. An accent keeps its chroma up to the brand
 * blue's; a surface becomes nearly neutral.
 */
export function deriveDark(role: ColorRole, light: string): string {
  const { l, c, h } = toOklch(light)
  if (role === "background" || role === "sidebar") {
    const surface = DARK_SURFACE[role]
    return toHex({ l: surface.l, c: Math.min(c, surface.c), h })
  }
  return toHex({ l: Math.max(l, DARK_ACCENT.l), c: Math.min(c, DARK_ACCENT.c), h })
}

function stored(theme: ThemeDocument, role: ColorRole, mode: Mode): string | undefined {
  // The document may be anything the server stored, or a newer build's.
  const colors: unknown = theme.colors
  if (typeof colors !== "object" || colors === null) return undefined
  const entry: unknown = (colors as Record<string, unknown>)[role]
  if (typeof entry !== "object" || entry === null) return undefined
  const value = (entry as Record<string, unknown>)[mode]
  return isHex(value) ? value.toLowerCase() : undefined
}

/** One role's colour in one mode, and where it comes from. */
export function resolveColor(theme: ThemeDocument, role: ColorRole, mode: Mode): ResolvedColor {
  const own = stored(theme, role, mode)
  if (own !== undefined) return { value: own, source: "set" }
  if (mode === "dark") {
    const light = stored(theme, role, "light")
    if (light !== undefined) return { value: deriveDark(role, light), source: "derived" }
  }
  return { value: BUILT_IN[role][mode], source: "built-in" }
}

/**
 * The text colour for a filled accent: white where white reaches 4.5:1,
 * otherwise whichever of white and a dark tint of the same hue reads best.
 */
export function onAccent(accent: string): string {
  const white = "#ffffff"
  if (contrast(white, accent) >= MINIMUM_CONTRAST) return white
  const { c, h } = toOklch(accent)
  const dark = toHex({ l: 0.21, c: Math.min(c, 0.08), h })
  return contrast(dark, accent) >= contrast(white, accent) ? dark : white
}

/** The strongest built-in text colour for a surface. */
function strongOn(surface: string): string {
  const { onLight, onDark } = BUILT_IN_TEXT.strong
  return contrast(onLight, surface) >= contrast(onDark, surface) ? onLight : onDark
}

/** The quieter text colour for a surface, or the strong one where the quiet one would not read. */
function quietOn(surface: string): string {
  const strong = strongOn(surface)
  const quiet =
    strong === BUILT_IN_TEXT.strong.onLight
      ? BUILT_IN_TEXT.quiet.onLight
      : BUILT_IN_TEXT.quiet.onDark
  return contrast(quiet, surface) >= MINIMUM_CONTRAST ? quiet : strong
}

/** The fill of a hovered accent: a step darker in light mode and lighter in dark mode, where that shows. */
function hoverOf(accent: string, mode: Mode): string {
  const { l, c, h } = toOklch(accent)
  if (l > 0.8) return toHex({ l: l - 0.06, c, h })
  if (mode === "dark" || l < 0.2) return toHex({ l: l + 0.09, c, h })
  return toHex({ l: l - 0.05, c, h })
}

/** The system colour tokens a theme can change. `--theme-<token>` in light mode, `--theme-dark-<token>` in dark. */
const THEMED_TOKENS = [
  "background",
  "foreground",
  "primary",
  "primary-hover",
  "primary-foreground",
  "destructive",
  "success",
  "warning",
  "info",
  "sidebar",
  "sidebar-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
] as const
type ThemedToken = (typeof THEMED_TOKENS)[number]

const SCALE_VARIABLES = ["--theme-radius-base", "--theme-text-scale", "--theme-space-unit"] as const

/** Every custom property a theme can set. */
export const THEME_VARIABLES: readonly string[] = [
  ...THEMED_TOKENS.map((token) => `--theme-${token}`),
  ...THEMED_TOKENS.map((token) => `--theme-dark-${token}`),
  ...SCALE_VARIABLES,
]

/** What one role changes in one mode: the role's own token, and the tokens that follow it. */
function roleTokens(
  role: ColorRole,
  value: string,
  mode: Mode,
): Partial<Record<ThemedToken, string>> {
  switch (role) {
    case "primary":
      return {
        primary: value,
        "primary-hover": hoverOf(value, mode),
        "primary-foreground": onAccent(value),
      }
    case "background":
      return { background: value, foreground: strongOn(value) }
    case "sidebar": {
      const strong = strongOn(value)
      return {
        sidebar: value,
        "sidebar-foreground": quietOn(value),
        "sidebar-accent": mix(value, strong, 0.08),
        "sidebar-accent-foreground": strong,
        "sidebar-border": mix(value, strong, 0.1),
      }
    }
    default:
      return { [role]: value }
  }
}

const isWholeNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max

/** The limits of the two sizes, as the server checks them (`crates/contracts`). */
export const RADIUS_RANGE = { min: THEME_RADIUS_MIN, max: THEME_RADIUS_MAX } as const
export const TEXT_SIZE_RANGE = { min: THEME_TEXT_SIZE_MIN, max: THEME_TEXT_SIZE_MAX } as const

/**
 * Every theme property, with the value the theme gives it, or null where
 * the theme says nothing and the built-in look applies. All of them are
 * listed, so that a theme applied to part of a page can switch off what the
 * page around it sets.
 */
export function themeVariables(theme: ThemeDocument): Record<string, string | null> {
  const variables: Record<string, string | null> = {}
  for (const name of THEME_VARIABLES) variables[name] = null
  // A theme in another format need not have this format's shape: nothing
  // else about it is read, and the built-in look applies (as ADR 0003 does
  // for forms).
  if (!isReadable(theme)) return variables

  for (const mode of MODES) {
    const prefix = mode === "dark" ? "--theme-dark-" : "--theme-"
    for (const role of COLOR_ROLES) {
      const colour = resolveColor(theme, role, mode)
      if (colour.source === "built-in") continue
      for (const [token, value] of Object.entries(roleTokens(role, colour.value, mode))) {
        variables[prefix + token] = value
      }
    }
  }

  if (isWholeNumber(theme.radius, RADIUS_RANGE.min, RADIUS_RANGE.max)) {
    variables["--theme-radius-base"] = `${theme.radius / 16}rem`
  }
  if (isWholeNumber(theme.textSize, TEXT_SIZE_RANGE.min, TEXT_SIZE_RANGE.max)) {
    variables["--theme-text-scale"] = String(theme.textSize / BUILT_IN_TEXT_SIZE)
  }
  const density: unknown = theme.density
  if (typeof density === "string" && Object.hasOwn(SPACE_UNIT, density)) {
    variables["--theme-space-unit"] = SPACE_UNIT[density as DensityStep]
  }
  return variables
}

/** Whether this build reads the theme's format. */
export const isReadable = (theme: ThemeDocument) => theme.formatVersion === THEME_FORMAT_VERSION

/** The theme's component defaults, when this build can read them. */
export const componentDefaults = (theme: ThemeDocument | undefined) =>
  theme && isReadable(theme) ? (theme.components ?? NO_DEFAULTS) : NO_DEFAULTS

const NO_DEFAULTS = {}

export type ContrastWarning = {
  /** The role whose colour is hard to read, or to read on. */
  readonly role: ColorRole
  readonly mode: Mode
  /** The measured ratio, such as 1.3. */
  readonly ratio: number
  readonly message: string
}

const ROLE_NAMES: Readonly<Record<ColorRole, string>> = {
  primary: "Primary",
  destructive: "Destructive",
  success: "Success",
  warning: "Warning",
  info: "Information",
  background: "Page background",
  sidebar: "Sidebar",
}

export const roleName = (role: ColorRole): string => ROLE_NAMES[role]

const USED_AS: Partial<Record<ColorRole, string>> = {
  primary: "Links, outlined buttons and focus rings use it",
  destructive: "Error messages use it",
  success: "Success messages use it",
  warning: "Warnings use it",
  info: "Notes use it",
}

const shown = (ratio: number) => `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`

/**
 * Where the theme's colours cannot reach 4.5:1 (spec 3.2). Text on a filled
 * colour is chosen automatically and always reads. What cannot be chosen is
 * a themed colour used as text on the page: a very light primary in light
 * mode. Only pairs the theme changed are reported; the built-in look is
 * checked once, in its own test.
 */
export function contrastWarnings(theme: ThemeDocument): ContrastWarning[] {
  const warnings: ContrastWarning[] = []
  for (const mode of MODES) {
    const background = resolveColor(theme, "background", mode)
    const where = `in ${mode} mode`

    for (const role of COLOR_ROLES) {
      if (role === "background" || role === "sidebar") continue
      const colour = resolveColor(theme, role, mode)
      if (colour.source === "built-in" && background.source === "built-in") continue
      const ratio = contrast(colour.value, background.value)
      if (ratio < MINIMUM_CONTRAST) {
        warnings.push({
          role,
          mode,
          ratio,
          message: `${ROLE_NAMES[role]} on the page background is ${shown(ratio)} ${where}. ${USED_AS[role]} as text, which needs ${MINIMUM_CONTRAST}:1.`,
        })
      }
    }

    const primary = resolveColor(theme, "primary", mode)
    if (primary.source !== "built-in") {
      const ratio = contrast(onAccent(primary.value), primary.value)
      if (ratio < MINIMUM_CONTRAST) {
        warnings.push({
          role: "primary",
          mode,
          ratio,
          message: `Text on primary reaches only ${shown(ratio)} ${where}, in black or in white. A lighter or a darker primary reads better.`,
        })
      }
    }

    if (background.source !== "built-in") {
      const ratio = contrast(BUILT_IN_TEXT.muted[mode], background.value)
      if (ratio < MINIMUM_CONTRAST) {
        warnings.push({
          role: "background",
          mode,
          ratio,
          message: `Muted text on the page background is ${shown(ratio)} ${where}. A ${mode === "light" ? "lighter" : "darker"} background keeps help text readable.`,
        })
      }
    }

    const sidebar = resolveColor(theme, "sidebar", mode)
    if (sidebar.source !== "built-in") {
      const ratio = contrast(quietOn(sidebar.value), sidebar.value)
      if (ratio < MINIMUM_CONTRAST) {
        warnings.push({
          role: "sidebar",
          mode,
          ratio,
          message: `Text on the sidebar reaches only ${shown(ratio)} ${where}. A lighter or a darker sidebar reads better.`,
        })
      }
    }
  }
  return warnings
}
