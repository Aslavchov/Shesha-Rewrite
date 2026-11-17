import type * as React from "react"
import { cn } from "cn"

import type { ItemColor } from "@/generated"

/**
 * A reference list item as people see it: its label in its colour. The
 * colours are roles of the theme (ADR 0010), so a tag follows light and dark
 * mode and any published theme; the label always says what the colour means.
 */

const COLORS: Record<ItemColor, string> = {
  muted: "border-border bg-muted text-muted-foreground",
  primary: "border-primary/25 bg-primary/10 text-primary",
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/25 bg-warning/10 text-warning",
  info: "border-info/25 bg-info/10 text-info",
  destructive: "border-destructive/25 bg-destructive/10 text-destructive",
}

export function StatusTag({
  color,
  retired = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { color: ItemColor; retired?: boolean }) {
  return (
    <span
      data-slot="status-tag"
      data-color={color}
      data-retired={retired ? "true" : undefined}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap",
        COLORS[color],
        className,
      )}
      {...props}
    >
      <span className="truncate">{children}</span>
      {retired ? <span className="font-normal opacity-80">(retired)</span> : null}
    </span>
  )
}
