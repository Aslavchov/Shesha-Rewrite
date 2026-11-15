import * as React from "react"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ColorValue } from "@/generated"

import { PANEL_POPUP_ATTRIBUTE } from "../properties/described-by"
import { type RunEnd, useDraft, useEditRun, useResetOn } from "../properties/edit-run"
import {
  type ColourChoices,
  colourName,
  HEX_COLOUR,
  OPAQUE_HEX_COLOUR,
  sameColour,
  swatchColour,
  themeColourChoices,
  tokenOf,
} from "./colours"

const DEFAULT_CHOICES = themeColourChoices("props")

/** How many swatches sit side by side: what the up and down arrows move by. */
const SWATCH_COLUMNS = 2

/**
 * The swatches are one Tab stop (Phase 4, section 6): the arrow keys move
 * between them, Home and End go to the ends.
 */
function moveBetweenSwatches(event: React.KeyboardEvent<HTMLFieldSetElement>) {
  const swatches = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")]
  const at = swatches.indexOf(document.activeElement as HTMLButtonElement)
  if (at < 0) return
  const last = swatches.length - 1
  const to = {
    ArrowRight: Math.min(at + 1, last),
    ArrowLeft: Math.max(at - 1, 0),
    ArrowDown: at + SWATCH_COLUMNS > last ? at : at + SWATCH_COLUMNS,
    ArrowUp: at - SWATCH_COLUMNS < 0 ? at : at - SWATCH_COLUMNS,
    Home: 0,
    End: last,
  }[event.key]
  if (to === undefined) return
  event.preventDefault()
  swatches[to].focus()
}

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
  inheritedValue,
  choices = DEFAULT_CHOICES,
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
  /** The colour that applies when nothing is set, where it is known: the swatch shows it. */
  inheritedValue?: ColorValue
  /** The swatches offered. Without it, the theme colours. */
  choices?: ColourChoices
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
  const hexPattern = choices.alpha ? HEX_COLOUR : OPAQUE_HEX_COLOUR
  // One swatch takes Tab: the chosen one, or the first.
  const chosenAt = choices.choices.findIndex((choice) => sameColour(value, choice.value))

  const typeHex = (text: string) => {
    setHex(text)
    const candidate = text.startsWith("#") ? text : `#${text}`
    const isValid = hexPattern.test(candidate)
    run.invalid(!isValid)
    if (isValid) {
      setError(null)
      onChange(candidate, run.current())
    } else {
      setError(
        choices.alpha
          ? "Enter six or eight hex digits, such as #003BB2."
          : "Enter six hex digits, such as #003BB2.",
      )
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
        <Swatch value={value ?? inheritedValue} />
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
            {choices.title}
            {choices.note ? <span className="font-normal"> · {choices.note}</span> : null}
          </p>
          {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the arrow keys move between the swatches inside */}
          <fieldset
            aria-label={choices.title}
            className="grid min-w-0 grid-cols-2 gap-0.5"
            onKeyDown={moveBetweenSwatches}
          >
            {choices.choices.map((choice, index) => {
              const isChosen = index === chosenAt
              return (
                <button
                  key={tokenOf(choice.value)}
                  type="button"
                  data-testid={choices.testId(choice)}
                  aria-pressed={isChosen}
                  tabIndex={index === Math.max(chosenAt, 0) ? 0 : -1}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs -outline-offset-2 hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:font-medium"
                  onClick={() => {
                    onChange(choice.value)
                    setOpen(false)
                  }}
                >
                  <Swatch value={choice.value} />
                  <span className="min-w-0 flex-1 truncate">{choice.label}</span>
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
            Custom colour
            {choices.customNote ? (
              <span className="font-normal"> · {choices.customNote}</span>
            ) : null}
          </label>
          <div className="flex items-center gap-2">
            <Swatch value={hexPattern.test(hex) ? hex : undefined} className="size-8 rounded-md" />
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
