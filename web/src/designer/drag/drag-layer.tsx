import type * as React from "react"
import { cn } from "cn"
import { CircleHelpIcon } from "lucide-react"

import { useDesignerContext, useDrag } from "../context"
import type { Box } from "./controller"

/** A box's place and size as CSS custom properties: layout data, not styling. */
type BoxStyle = React.CSSProperties & {
  "--box-left": string
  "--box-top": string
  "--box-width": string
  "--box-height": string
}

const boxStyle = (box: Box): BoxStyle => ({
  "--box-left": `${box.left}px`,
  "--box-top": `${box.top}px`,
  "--box-width": `${box.width}px`,
  "--box-height": `${box.height}px`,
})

const BOXED = "absolute top-(--box-top) left-(--box-left) h-(--box-height) w-(--box-width)"

type PointerStyle = React.CSSProperties & { "--pointer-x": string; "--pointer-y": string }

/**
 * What a drag looks like: a label that follows the pointer, and the drop
 * indicator showing exactly where the instance will land (spec 3.4). Over a
 * place that would refuse the drop there is no indicator.
 */
export function DragLayer() {
  const { store } = useDesignerContext()
  const state = useDrag((drag) => drag)
  if (!state) return null

  const { source, target } = state
  const outline = store.schema.outline(store.getSnapshot().editor.document)
  const node = source.kind === "existing" ? outline.byId.get(source.id) : undefined
  const definition =
    source.kind === "new" ? store.schema.registry.get(source.component) : node?.definition
  const Icon = definition?.icon ?? CircleHelpIcon
  const label = node?.instance.name ?? definition?.displayName ?? "Component"
  const pointer: PointerStyle = { "--pointer-x": `${state.x}px`, "--pointer-y": `${state.y}px` }

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {target?.region ? (
        <div
          style={boxStyle(target.region)}
          className={cn(BOXED, "rounded-md bg-primary/5 ring-1 ring-primary/40")}
        />
      ) : null}
      {target ? (
        <div
          data-testid="drop-indicator"
          data-shape={target.indicator.shape}
          style={boxStyle(target.indicator.box)}
          className={cn(
            BOXED,
            target.indicator.shape === "line"
              ? "rounded-full bg-primary"
              : "rounded-lg bg-primary/10 ring-2 ring-primary",
          )}
        />
      ) : null}
      <div
        data-testid="drag-label"
        style={pointer}
        className={cn(
          "absolute top-0 left-0 flex translate-x-[calc(var(--pointer-x)+var(--sys-space-md))] translate-y-[calc(var(--pointer-y)+var(--sys-space-md))] items-center gap-1.5 rounded-md bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md ring-1 ring-foreground/10",
          !target && "opacity-60",
        )}
      >
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </div>
    </div>
  )
}
