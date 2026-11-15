import * as React from "react"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ColorValue } from "@/generated"

import { PANEL_POPUP_ATTRIBUTE } from "../properties/described-by"
import { type RunEnd, useDraft, useEditRun, useResetOn } from "../properties/edit-run"
import { colourName, HEX_COLOUR, swatchColour, THEME_COLOURS } from "./colours"

/** A swatch's colour as a CSS custom property: data for display, like a box's place. */
type SwatchStyle = React.CSSProperties & { "--swatch": string }

export function Swatch({
  value,
  className,
}: {
  value: ColorValue | undefined
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      style={value === undefined ? undefined : ({ "--swatch": swatchColour(value) } as SwatchStyle)}
      className={cn(
        "size-4 shrink-0 rounded-sm border border-input",
        value === undefined ? "border-dashed" : "bg-(--swatch)",
        className,
      )}
    />
  )
}

/**
 * Picks a colour: a theme colour first (it follows light and dark mode), or a
 * custom hex value. The trigger shows what is chosen, or what is inherited.
 */
export function ColourPicker({
  id,
  testId,
  label,
  value,
  inherited,
  describedBy,
  onChange,
  onRunEnd,
  resetKey,
}: {
  id: string
  testId: string
  /** What the property is called, for the popup's name. */
  label: string
  value: ColorValue | undefined
  /** Shown when nothing is set: where the colour comes from instead. */
  inherited: string
  describedBy?: string
  /** A new colour, as part of a run of edits when it is typed. */
  onChange: (value: ColorValue, run?: string) => void
  /** The typed colour's run is over: kept, or taken back when it was left not valid. */
  onRunEnd: RunEnd
  /** Changes when the values jump (undo, redo): the typed colour is dropped. */
  resetKey: number
}) {
  const [open, setOpen] = React.useState(false)
  const hexId = React.useId()
  const run = useEditRun(onRunEnd)
  const external = typeof value === "string" ? value : ""
  const [hex, setHex] = useDraft(external, resetKey)
  const [error, setError] = useResetOn<string | null>(null, resetKey)
  const name = colourName(value)

  const typeHex = (text: string) => {
    setHex(text)
    const candidate = text.startsWith("#") ? text : `#${text}`
    const isValid = HEX_COLOUR.test(candidate)
    run.invalid(!isValid)
    if (isValid) {
      setError(null)
      onChange(candidate, run.current())
    } else {
      setError("Enter six or eight hex digits, such as #003BB2.")
    }
  }
  const leaveHex = () => {
    if (!run.end()) return
    setHex(external)
    setError(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        data-testid={testId}
        aria-describedby={describedBy}
        aria-label={`${label}: ${name ?? inherited}`}
        className="flex h-8 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm shadow-xs transition-colors hover:bg-muted dark:bg-input/30"
      >
        <Swatch value={value} />
        <span className={cn("truncate", name === null && "text-muted-foreground")}>
          {name ?? inherited}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={label}
        data-testid={`${testId}-popup`}
        {...{ [PANEL_POPUP_ATTRIBUTE]: "" }}
        className="w-72 gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Theme colours <span className="font-normal">· follow light and dark mode</span>
          </p>
          <fieldset aria-label="Theme colours" className="grid min-w-0 grid-cols-2 gap-0.5">
            {THEME_COLOURS.map((colour) => {
              const isChosen = typeof value === "object" && value.token === colour.token
              return (
                <button
                  key={colour.token}
                  type="button"
                  data-testid={`props-token-${colour.token}`}
                  aria-pressed={isChosen}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:font-medium"
                  onClick={() => {
                    onChange({ token: colour.token })
                    setOpen(false)
                  }}
                >
                  <Swatch value={{ token: colour.token }} />
                  <span className="min-w-0 flex-1 truncate">{colour.label}</span>
                  {isChosen ? (
                    <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />
                  ) : null}
                </button>
              )
            })}
          </fieldset>
        </div>
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <label htmlFor={hexId} className="text-xs font-medium text-muted-foreground">
            Custom colour <span className="font-normal">· stays the same in dark mode</span>
          </label>
          <div className="flex items-center gap-2">
            <Swatch value={HEX_COLOUR.test(hex) ? hex : undefined} className="size-8 rounded-md" />
            <Input
              id={hexId}
              data-testid={`${testId}-hex`}
              placeholder="#003BB2"
              spellCheck={false}
              value={hex}
              aria-invalid={error !== null || undefined}
              aria-describedby={error ? `${hexId}-error` : undefined}
              onFocus={run.start}
              onBlur={leaveHex}
              onChange={(event) => typeHex(event.target.value.trim())}
              className="font-mono"
            />
          </div>
          {error ? (
            <p id={`${hexId}-error`} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
