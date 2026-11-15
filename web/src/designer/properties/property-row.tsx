import type * as React from "react"
import { cn } from "cn"
import { RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * One editable property in the panel: its label, whether it is set on this
 * instance or uses the default, a reset, the editor, its error and its help.
 * Shared by settings, the identity fields and the Appearance editor.
 */
export function PropertyRow({
  id,
  label,
  help,
  error,
  isSet,
  resetTestId,
  resetLabel,
  onReset,
  defaultText = "Default",
  inline = false,
  children,
}: {
  /** The editor's DOM id; the label points at it, and help and error derive from it. */
  id: string
  label: string
  help?: string
  error?: string | null
  /** Set on this instance (true), using the default (false), or neither applies (undefined). */
  isSet?: boolean
  resetTestId?: string
  /** What the reset button says to assistive technology. */
  resetLabel?: string
  onReset?: () => void
  /** What "not set" is called, such as "Default" or "From the theme". */
  defaultText?: string
  /** The editor sits beside the label (a switch) rather than under it. */
  inline?: boolean
  children: React.ReactNode
}) {
  const header = (
    <div className="flex min-h-6 items-center gap-1.5">
      <label
        htmlFor={id}
        id={`${id}-label`}
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-xs font-medium",
          isSet ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {isSet ? (
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
        ) : null}
        <span className="truncate">{label}</span>
        {isSet === undefined ? null : (
          <span className="sr-only">{isSet ? ", set" : ", default"}</span>
        )}
      </label>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {isSet === false ? (
          <span aria-hidden="true" className="text-xs text-muted-foreground">
            {defaultText}
          </span>
        ) : null}
        {isSet && onReset ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  data-testid={resetTestId}
                  aria-label={resetLabel ?? `Reset ${label.toLowerCase()}`}
                  onClick={onReset}
                />
              }
            >
              <RotateCcwIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Reset to the default</TooltipContent>
          </Tooltip>
        ) : null}
        {inline ? children : null}
      </span>
    </div>
  )
  return (
    <div
      data-property-row={id}
      data-value-source={isSet === undefined ? undefined : isSet ? "set" : "default"}
      className="flex flex-col gap-1"
    >
      {header}
      {inline ? null : children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {help ? (
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
    </div>
  )
}

/** A titled group of rows in the panel. */
export function PanelSection({
  title,
  testId,
  children,
  action,
}: {
  title: string
  testId?: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section
      data-testid={testId}
      aria-label={title}
      className="flex flex-col gap-3 border-t px-4 pt-3 pb-4 first:border-t-0"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}
