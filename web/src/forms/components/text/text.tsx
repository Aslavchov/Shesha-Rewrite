import { cn } from "cn"

import type { StaticProps } from "../../runtime"
import type { settings, Slot } from "./settings"

type Settings = StaticProps<typeof settings, Slot>["settings"]

/**
 * Headings start at level 2: the page around a form already has its level 1
 * heading. The levels step down in size, and none is larger than the page's.
 */
const VARIANT: Record<
  Settings["variant"],
  { element: "h2" | "h3" | "h4" | "p"; className: string }
> = {
  heading2: {
    element: "h2",
    className: "font-heading text-xl leading-tight font-semibold tracking-tight",
  },
  heading3: {
    element: "h3",
    className: "font-heading text-lg leading-snug font-semibold tracking-tight",
  },
  heading4: { element: "h4", className: "font-heading text-base leading-snug font-semibold" },
  paragraph: { element: "p", className: "text-sm leading-relaxed" },
  muted: { element: "p", className: "text-sm leading-relaxed text-muted-foreground" },
}

const ALIGNMENT: Record<Settings["alignment"], string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
}

/** Static text: shown the same way when the form is filled in and when it is read. */
export function TextRender({
  settings: { text, variant, alignment },
  slots,
}: StaticProps<typeof settings, Slot>) {
  const { element: Element, className } = VARIANT[variant]
  return (
    <Element
      data-slot="text"
      className={cn(
        "min-w-0 wrap-break-word whitespace-pre-line text-foreground",
        className,
        ALIGNMENT[alignment],
      )}
      {...slots.root}
    >
      {text}
    </Element>
  )
}
