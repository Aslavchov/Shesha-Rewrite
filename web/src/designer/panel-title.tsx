import type * as React from "react"

/** The heading of one of the designer's panels, or of a group in the toolbox. */
export function PanelTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="px-4 pt-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
    >
      {children}
    </h2>
  )
}
