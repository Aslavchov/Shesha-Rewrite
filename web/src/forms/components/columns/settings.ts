import { choice, number, optionalProportions, space } from "../../runtime/settings"

export const MIN_COLUMNS = 2
export const MAX_COLUMNS = 4

export const settings = {
  columns: number({
    label: "Columns",
    help: `From ${MIN_COLUMNS} to ${MAX_COLUMNS}.`,
    group: "layout",
    default: MIN_COLUMNS,
    min: MIN_COLUMNS,
    max: MAX_COLUMNS,
    whole: true,
  }),
  widths: optionalProportions({
    label: "Column widths",
    help: "One whole number per column: 1, 2 makes the second column twice as wide as the first. Leave empty for equal columns.",
    group: "layout",
  }),
  gap: space({
    label: "Gap",
    help: "The space between the columns, and between the components in a column.",
    group: "layout",
    default: "md",
  }),
  stackBelow: choice({
    label: "Stack below",
    help: "When the Columns component itself is narrower than this, its columns stack into one. The width of the screen does not matter.",
    group: "layout",
    choices: [
      { value: "sm", label: "Small (384px)" },
      { value: "md", label: "Medium (448px)" },
      { value: "lg", label: "Large (512px)" },
      { value: "xl", label: "Extra large (576px)" },
      { value: "2xl", label: "Double extra large (672px)" },
      { value: "never", label: "Never stack" },
    ],
    default: "md",
  }),
}

/** The regions of an instance with `count` columns: `col1`, `col2`, … */
export function columnRegions(count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `col${index + 1}`)
}

export const slots = ["root"] as const

export type Slot = (typeof slots)[number]
