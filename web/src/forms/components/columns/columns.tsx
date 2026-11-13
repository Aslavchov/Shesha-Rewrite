import type * as React from "react"
import { cn } from "cn"

import { type ContainerProps, GAP_CLASS } from "../../runtime"
import { columnRegions, type settings, type Slot } from "./settings"

type Settings = ContainerProps<typeof settings, Slot>["settings"]

/** A `style` object that sets the grid's column template and nothing else. */
type ColumnsTemplateStyle = React.CSSProperties & { "--columns-template": string }

/**
 * How the columns respond to the width chosen in `stackBelow`. The widths are
 * Tailwind's container-query breakpoints, measured on this component, not on
 * the screen. Every class is written out in full: Tailwind only generates the
 * classes it can read in the source.
 *
 * - `grid`: one column, and from that width up the column template.
 * - `column`: below that width a column with nothing rendered inside takes no
 *   row, so it adds no gap to the stack. Side by side it keeps its place.
 */
const STACK_CLASS: Record<Settings["stackBelow"], { grid: string; column: string }> = {
  sm: {
    grid: "grid-cols-1 @sm:grid-cols-(--columns-template)",
    column: "@max-sm:empty:hidden",
  },
  md: {
    grid: "grid-cols-1 @md:grid-cols-(--columns-template)",
    column: "@max-md:empty:hidden",
  },
  lg: {
    grid: "grid-cols-1 @lg:grid-cols-(--columns-template)",
    column: "@max-lg:empty:hidden",
  },
  xl: {
    grid: "grid-cols-1 @xl:grid-cols-(--columns-template)",
    column: "@max-xl:empty:hidden",
  },
  "2xl": {
    grid: "grid-cols-1 @2xl:grid-cols-(--columns-template)",
    column: "@max-2xl:empty:hidden",
  },
  never: { grid: "grid-cols-(--columns-template)", column: "" },
}

/**
 * When no column has anything rendered inside (each holds only buttons, in
 * read-only mode), the whole component takes no room in whatever holds it.
 */
const HIDDEN_WHEN_EMPTY = "not-has-[[data-slot=columns-column]:not(:empty)]:hidden"

/**
 * The column template as the one CSS custom property the grid reads. This is
 * layout data from settings, not styling: the only use of `style` a component
 * may make besides spreading its slots (ADR 0006).
 *
 * Each column is a `minmax(0, <n>fr)` track, so columns share the width by
 * their proportions and long content cannot widen one. `widths` is used only
 * when it has one proportion per column; otherwise the columns are equal.
 */
function columnsTemplate(count: number, widths: Settings["widths"]): ColumnsTemplateStyle {
  const proportions = widths?.length === count ? widths : Array.from({ length: count }, () => 1)
  return {
    "--columns-template": proportions.map((proportion) => `minmax(0, ${proportion}fr)`).join(" "),
  }
}

export function ColumnsRender({
  settings: { columns, widths, gap, stackBelow },
  slots,
  region,
}: ContainerProps<typeof settings, Slot>) {
  const stack = STACK_CLASS[stackBelow]
  return (
    // The root is the query container: the columns follow its width.
    <div data-slot="columns" className={cn("@container w-full", HIDDEN_WHEN_EMPTY)} {...slots.root}>
      <div
        data-slot="columns-grid"
        className={cn("grid", stack.grid, GAP_CLASS[gap])}
        style={columnsTemplate(columns, widths)}
      >
        {columnRegions(columns).map((name) => (
          <div
            key={name}
            data-slot="columns-column"
            className={cn("flex min-w-0 flex-col", GAP_CLASS[gap], stack.column)}
          >
            {region(name)}
          </div>
        ))}
      </div>
    </div>
  )
}
