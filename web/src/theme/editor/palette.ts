import type { ColourChoice, ColourChoices } from "@/designer/appearance/colours"

/**
 * The plain colours the theme editor offers for a role, before a custom
 * one. They are data a person picks from, like the documents themselves, not
 * design values of the app: nothing is styled with them until one is chosen.
 * Each accent reaches 4.5:1 on white, so a light-mode choice from here never
 * needs a contrast warning.
 */
const ACCENTS: readonly ColourChoice[] = [
  { value: "#003BB2", label: "Shesha blue" },
  { value: "#4338CA", label: "Indigo" },
  { value: "#6D28D9", label: "Violet" },
  { value: "#A21CAF", label: "Magenta" },
  { value: "#BE123C", label: "Rose" },
  { value: "#B91C1C", label: "Red" },
  { value: "#C2410C", label: "Orange" },
  { value: "#A16207", label: "Amber" },
  { value: "#15803D", label: "Green" },
  { value: "#0F766E", label: "Teal" },
  { value: "#0E7490", label: "Cyan" },
  { value: "#334155", label: "Slate" },
]

const SURFACES: readonly ColourChoice[] = [
  { value: "#FFFFFF", label: "White" },
  { value: "#F9FAFB", label: "Snow" },
  { value: "#FAFAF9", label: "Stone" },
  { value: "#F1F5F9", label: "Mist" },
  { value: "#EEF2FF", label: "Lavender" },
  { value: "#F0FDFA", label: "Mint" },
  { value: "#1E293B", label: "Slate" },
  { value: "#0B1F4B", label: "Navy" },
  { value: "#18181B", label: "Charcoal" },
  { value: "#080A0E", label: "Ink" },
]

const testId = (choice: ColourChoice) =>
  `theme-swatch-${typeof choice.value === "string" ? choice.value.slice(1).toLowerCase() : choice.value.token}`

export const ACCENT_CHOICES: ColourChoices = {
  title: "Palette",
  choices: ACCENTS,
  customNote: "six hex digits",
  alpha: false,
  testId,
}

export const SURFACE_CHOICES: ColourChoices = { ...ACCENT_CHOICES, choices: SURFACES }
