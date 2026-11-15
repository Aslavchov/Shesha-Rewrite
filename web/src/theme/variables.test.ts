import { describe, expect, it } from "vitest"

import { THEME_FORMAT_VERSION, type ThemeDocument } from "@/generated"
import raw from "@/styles/tokens.css?raw"

import { contrast, toHex, toOklch } from "./colour"
import {
  BUILT_IN,
  BUILT_IN_TEXT,
  COLOR_ROLES,
  contrastWarnings,
  deriveDark,
  MINIMUM_CONTRAST,
  onAccent,
  resolveColor,
  THEME_VARIABLES,
  themeVariables,
} from "./variables"

/** tokens.css with each declaration on one line, however it is wrapped. */
const tokens = raw.replace(/\(\s+/g, "(").replace(/,\s+/g, ", ").replace(/\s+\)/g, ")")

const theme = (rest: Omit<ThemeDocument, "formatVersion"> = {}): ThemeDocument => ({
  formatVersion: THEME_FORMAT_VERSION,
  ...rest,
})

/** A reference token of tokens.css as hex. */
function reference(name: string): string {
  const match = new RegExp(
    `--ref-${name}: (#[0-9a-f]{6}|oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\));`,
  ).exec(tokens)
  if (!match) throw new Error(`No --ref-${name} in tokens.css`)
  if (match[1].startsWith("#")) return match[1]
  return toHex({ l: Number(match[2]), c: Number(match[3]), h: Number(match[4]) })
}

/** The reference token a system token falls back to, in one scheme. */
function builtInOf(token: string, mode: "light" | "dark"): string {
  const prefix = mode === "dark" ? "dark-" : ""
  const match = new RegExp(
    `--sys-color-${token}: var\\(--theme-${prefix}${token}, var\\(--ref-([a-z0-9-]+)\\)\\);`,
    "g",
  )
  const [found] = [...tokens.matchAll(match)]
  if (!found) throw new Error(`No themed --sys-color-${token} for ${mode} mode in tokens.css`)
  return reference(found[1])
}

describe("the built-in look", () => {
  it("is the look of tokens.css, role by role and mode by mode", () => {
    for (const role of COLOR_ROLES) {
      for (const mode of ["light", "dark"] as const) {
        expect(BUILT_IN[role][mode], `${role} in ${mode} mode`).toBe(builtInOf(role, mode))
      }
    }
  })

  it("names the text colours tokens.css uses on themed colours", () => {
    expect(BUILT_IN_TEXT.strong.onLight).toBe(reference("neutral-950"))
    expect(BUILT_IN_TEXT.strong.onDark).toBe(reference("neutral-50"))
    expect(BUILT_IN_TEXT.quiet.onLight).toBe(reference("neutral-700"))
    expect(BUILT_IN_TEXT.quiet.onDark).toBe(reference("neutral-300"))
    expect(BUILT_IN_TEXT.muted.light).toBe(reference("neutral-500"))
    expect(BUILT_IN_TEXT.muted.dark).toBe(reference("neutral-400"))
  })

  it("lets tokens.css read every theme variable", () => {
    for (const name of THEME_VARIABLES) expect(tokens).toContain(`var(${name},`)
  })

  it("sets no variable and warns of nothing", () => {
    expect(Object.values(themeVariables(theme())).every((value) => value === null)).toBe(true)
    expect(contrastWarnings(theme())).toEqual([])
  })
})

describe("colours", () => {
  it("sets the role and what follows it", () => {
    const variables = themeVariables(theme({ colors: { primary: { light: "#0F766E" } } }))
    expect(variables["--theme-primary"]).toBe("#0f766e")
    expect(variables["--theme-primary-foreground"]).toBe("#ffffff")
    expect(variables["--theme-primary-hover"]).toMatch(/^#[0-9a-f]{6}$/)
    expect(variables["--theme-destructive"]).toBeNull()
  })

  it("derives a dark value that keeps the hue and reads on the dark page (spec 3.2)", () => {
    const teal = theme({ colors: { primary: { light: "#0F766E" } } })
    const dark = resolveColor(teal, "primary", "dark")
    expect(dark.source).toBe("derived")
    expect(toOklch(dark.value).h).toBeCloseTo(toOklch("#0F766E").h, -1)
    expect(toOklch(dark.value).l).toBeGreaterThan(toOklch("#0F766E").l)
    expect(contrast(dark.value, BUILT_IN.background.dark)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
    expect(themeVariables(teal)["--theme-dark-primary"]).toBe(dark.value)
  })

  it("keeps a dark value set by hand", () => {
    const set = theme({ colors: { primary: { light: "#0F766E", dark: "#99F6E4" } } })
    expect(resolveColor(set, "primary", "dark")).toEqual({ value: "#99f6e4", source: "set" })
  })

  it("derives a dark surface that stays dark", () => {
    const surface = deriveDark("background", "#F0FDFA")
    expect(toOklch(surface).l).toBeLessThan(0.2)
  })

  it("chooses text on a filled colour that reaches 4.5:1 (spec 3.2)", () => {
    expect(onAccent("#003BB2")).toBe("#ffffff")
    const onYellow = onAccent("#FFE600")
    expect(onYellow).not.toBe("#ffffff")
    expect(contrast(onYellow, "#FFE600")).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
  })

  it("gives the sidebar readable text and a visible current item", () => {
    const variables = themeVariables(theme({ colors: { sidebar: { light: "#0B1F4B" } } }))
    const sidebar = variables["--theme-sidebar"] ?? ""
    const text = variables["--theme-sidebar-foreground"] ?? ""
    expect(contrast(text, sidebar)).toBeGreaterThanOrEqual(MINIMUM_CONTRAST)
    expect(variables["--theme-sidebar-accent"]).not.toBe(sidebar)
  })

  it("ignores what is not a colour", () => {
    const broken = { formatVersion: 1, colors: { primary: { light: "teal" } } } as ThemeDocument
    expect(resolveColor(broken, "primary", "light").source).toBe("built-in")
  })
})

describe("contrast warnings (spec 3.2, C4-4)", () => {
  it("say plainly where a very light primary cannot be read as text", () => {
    const warnings = contrastWarnings(theme({ colors: { primary: { light: "#FFE600" } } }))
    expect(warnings.some((warning) => warning.role === "primary" && warning.mode === "light")).toBe(
      true,
    )
    expect(warnings[0].message).toMatch(/Primary on the page background is 1\.\d:1 in light mode/)
  })

  it("are not given for a colour that reads", () => {
    expect(contrastWarnings(theme({ colors: { primary: { light: "#0F766E" } } }))).toEqual([])
  })

  it("follow a themed background", () => {
    const warnings = contrastWarnings(theme({ colors: { background: { light: "#334155" } } }))
    expect(warnings.map((warning) => warning.role)).toContain("background")
  })
})

describe("scales", () => {
  it("writes the radius, text size and density", () => {
    const variables = themeVariables(theme({ radius: 12, textSize: 16, density: "compact" }))
    expect(variables["--theme-radius-base"]).toBe("0.75rem")
    expect(variables["--theme-text-scale"]).toBe(String(16 / 14))
    expect(variables["--theme-space-unit"]).toBe("0.21875rem")
  })

  it("reads nothing of a theme in another format version", () => {
    const newer = { formatVersion: 2, radius: 12, colors: { primary: { light: "#0F766E" } } }
    const variables = themeVariables(newer as unknown as ThemeDocument)
    expect(Object.values(variables).every((value) => value === null)).toBe(true)
  })

  it("ignores values outside the ranges", () => {
    const variables = themeVariables(
      theme({ radius: 99, textSize: 40, density: "huge" as ThemeDocument["density"] }),
    )
    expect(variables["--theme-radius-base"]).toBeNull()
    expect(variables["--theme-text-scale"]).toBeNull()
    expect(variables["--theme-space-unit"]).toBeNull()
  })
})
