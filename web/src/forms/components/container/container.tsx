import { cn } from "cn"

import { FieldLegend, FieldSet } from "@/components/ui/field"

import { type ContainerProps, GAP_CLASS } from "../../runtime"
import { CONTENT_REGION, type settings, type Slot } from "./settings"

/** Children stretch to the container's width. */
const VERTICAL = "flex-col"

/** Children keep their own width, share a top edge and wrap onto further rows. */
const HORIZONTAL = "flex-row flex-wrap items-start"

/**
 * A container with nothing rendered inside takes no room, so it leaves no
 * empty box and no extra gap in whatever holds it. This is what makes a row
 * of buttons disappear in read-only mode, where buttons render nothing.
 */
const HIDDEN_WHEN_EMPTY = "empty:hidden"

/** The same for a titled container: a title with nothing under it is not shown either. */
const HIDDEN_WHEN_CONTENT_EMPTY = "has-[>[data-slot=container-content]:empty]:hidden"

export function ContainerRender({
  settings: { title, direction, gap },
  slots,
  region,
}: ContainerProps<typeof settings, Slot>) {
  const layout = cn(
    "flex min-w-0",
    direction === "horizontal" ? HORIZONTAL : VERTICAL,
    GAP_CLASS[gap],
  )
  const children = region(CONTENT_REGION)

  if (title === null) {
    return (
      <div data-slot="container" className={cn(layout, HIDDEN_WHEN_EMPTY)} {...slots.root}>
        {children}
      </div>
    )
  }
  // A fieldset and its legend: the group is announced by its title.
  return (
    <FieldSet className={cn("min-w-0", HIDDEN_WHEN_CONTENT_EMPTY)} {...slots.root}>
      <FieldLegend {...slots.title}>{title}</FieldLegend>
      <div data-slot="container-content" className={layout}>
        {children}
      </div>
    </FieldSet>
  )
}
