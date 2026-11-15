import * as React from "react"
import { cn } from "cn"
import { ChevronRightIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FONT_WEIGHTS, RADIUS_STEPS, SPACE_STEPS } from "@/forms/runtime"
import type { ColorValue, SlotStyle } from "@/generated"

import { STYLE_PROPERTIES, STYLE_PROPERTY_LABELS, type StyleProperty } from "../model/editor"
import { focusSoon, type RunEnd } from "../properties/edit-run"
import { PropertyRow } from "../properties/property-row"
import { colourName, slotLabel, themeColourChoices } from "./colours"
import { ColourPicker } from "./colour-picker"

/**
 * The Appearance editor (spec 3.4, ADR 0009): the style overrides of every
 * slot of one thing, edited as data. It knows nothing about the designer: it
 * is given the slots, the current overrides and where the values come from
 * when nothing is set, and it reports each change. The Phase 4 theme editor
 * uses the same component, with the theme as what it edits and the
 * components' own look as the defaults.
 */

export type { StyleProperty }

/** Where a slot's values come from when it sets none. */
export type AppearanceDefaults = {
  /** What an unset value is called: "Default", or "From the theme". */
  readonly label: string
  /** Values that apply when none is set here, by slot. Phase 3 has none. */
  readonly styles?: Readonly<Record<string, SlotStyle>>
  /**
   * What an unset value is called when `styles` holds nothing for it:
   * "Default", under a theme that says nothing about the property. Without
   * it, `label`. Added in Phase 4 (ADR 0010), as is `setLabel`.
   */
  readonly fallbackLabel?: string
  /** What a value set here is called, such as "Set here". */
  readonly setLabel?: string
}

export type AppearanceEditorProps = {
  /** The slots that can be styled, in the definition's order. `root` is the whole thing. */
  readonly slots: readonly string[]
  /** The overrides set now, by slot. */
  readonly styles: Readonly<Record<string, SlotStyle>> | undefined
  readonly defaults: AppearanceDefaults
  /** One property of one slot changed; `undefined` removes the override. `run` merges a run of edits. */
  readonly onChange: (
    slot: string,
    property: StyleProperty,
    value: SlotStyle[StyleProperty] | undefined,
    run?: string,
  ) => void
  /** Every override of one slot removed. */
  readonly onResetSlot: (slot: string) => void
  /**
   * A run of typed edits is over (a hex colour): `keep` is false when the
   * field was left with a value that is not valid, and the run should be
   * taken back.
   */
  readonly onRunEnd: RunEnd
  /** Changes when the values jump (undo, redo): typed values and their errors are dropped. */
  readonly resetKey: number
  /** The slot being pointed at (hovered or focused), or null: to show it where it is drawn. */
  readonly onPoint?: (slot: string | null) => void
  /** The start of every test id. */
  readonly testIdPrefix?: string
}

const SCALE_LABELS: Record<string, string> = {
  none: "None",
  xs: "Extra small",
  sm: "Small",
  md: "Medium",
  lg: "Large",
  xl: "Extra large",
  "2xl": "Double extra large",
  full: "Full",
  normal: "Normal",
  medium: "Medium",
  semibold: "Semibold",
}

const SCALES: Partial<Record<StyleProperty, readonly string[]>> = {
  radius: RADIUS_STEPS,
  fontWeight: FONT_WEIGHTS,
  padding: SPACE_STEPS,
}

export function AppearanceEditor(props: AppearanceEditorProps) {
  const { slots, onPoint } = props
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- pointing is a hint, not an action
    <div className="flex flex-col gap-1" onPointerLeave={() => onPoint?.(null)}>
      {slots.map((slot) => (
        <SlotEditor key={slot} slot={slot} {...props} />
      ))}
    </div>
  )
}

function SlotEditor({
  slot,
  styles,
  defaults,
  onChange,
  onResetSlot,
  onRunEnd,
  resetKey,
  onPoint,
  testIdPrefix = "props",
}: AppearanceEditorProps & { slot: string }) {
  const [open, setOpen] = React.useState(false)
  const toggleRef = React.useRef<HTMLButtonElement>(null)
  const bodyId = React.useId()
  const style = styles?.[slot] ?? {}
  const count = Object.keys(style).length
  const label = slotLabel(slot)

  return (
    <div
      data-testid={`${testIdPrefix}-slot-section-${slot}`}
      className="rounded-lg border border-transparent has-aria-expanded:border-border"
      onPointerEnter={() => onPoint?.(slot)}
      onFocus={() => onPoint?.(slot)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onPoint?.(null)
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          ref={toggleRef}
          data-testid={`${testIdPrefix}-slot-${slot}`}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 text-left text-sm hover:bg-muted"
          onClick={() => setOpen(!open)}
        >
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="truncate font-medium">{label}</span>
          {count > 0 ? (
            <span className="ml-auto shrink-0 rounded-sm bg-primary/10 px-1.5 text-xs text-primary">
              {count} set
            </span>
          ) : null}
        </button>
        {count > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  data-testid={`${testIdPrefix}-style-reset-${slot}`}
                  aria-label={`Reset every style of ${label.toLowerCase()}`}
                  onClick={() => {
                    onResetSlot(slot)
                    // The reset button goes with the overrides: focus stays on the part.
                    focusSoon(() => toggleRef.current)
                  }}
                />
              }
            >
              <RotateCcwIcon aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Reset this part</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div id={bodyId} hidden={!open} className="flex flex-col gap-3 px-2 pt-1 pb-3">
        {open
          ? STYLE_PROPERTIES.map((property) => (
              <PropertyEditor
                key={property}
                slot={slot}
                property={property}
                label={STYLE_PROPERTY_LABELS[property]}
                value={style[property]}
                inherited={defaults.styles?.[slot]?.[property]}
                defaults={defaults}
                testIdPrefix={testIdPrefix}
                onChange={onChange}
                onRunEnd={onRunEnd}
                resetKey={resetKey}
              />
            ))
          : null}
      </div>
    </div>
  )
}

function PropertyEditor({
  slot,
  property,
  label,
  value,
  inherited,
  defaults,
  testIdPrefix,
  onChange,
  onRunEnd,
  resetKey,
}: {
  slot: string
  property: StyleProperty
  label: string
  value: SlotStyle[StyleProperty] | undefined
  inherited: SlotStyle[StyleProperty] | undefined
  defaults: AppearanceDefaults
  testIdPrefix: string
  onChange: AppearanceEditorProps["onChange"]
  onRunEnd: RunEnd
  resetKey: number
}) {
  const id = React.useId()
  const testId = `${testIdPrefix}-style-${slot}-${property}`
  const isSet = value !== undefined
  const scale = SCALES[property]
  // Where the value comes from, in words (spec 3.4): read by everyone, and
  // what the editor is described by.
  const fallback = defaults.fallbackLabel ?? defaults.label
  const origin = inherited === undefined ? fallback : defaults.label
  const source = isSet ? (defaults.setLabel ?? "Set here") : origin
  const inheritedText =
    inherited === undefined
      ? fallback
      : `${defaults.label}: ${typeof inherited === "object" ? colourName(inherited) : (SCALE_LABELS[inherited] ?? colourName(inherited))}`
  const choices = React.useMemo(() => themeColourChoices(testIdPrefix), [testIdPrefix])

  return (
    <PropertyRow
      id={id}
      label={label}
      isSet={isSet}
      source={{ text: source, testId: `${testIdPrefix}-style-source-${slot}-${property}` }}
      resetTestId={`${testIdPrefix}-style-reset-${slot}-${property}`}
      onReset={() => {
        onChange(slot, property, undefined)
        // The reset button goes with the override: focus moves to the property's editor.
        focusSoon(() => document.getElementById(id))
      }}
    >
      {scale ? (
        <ScaleSelect
          id={id}
          testId={testId}
          scale={scale}
          value={typeof value === "string" ? value : undefined}
          inherited={inheritedText}
          describedBy={`${id}-source`}
          onChange={(step) => onChange(slot, property, step as SlotStyle[StyleProperty])}
        />
      ) : (
        <ColourPicker
          id={id}
          testId={testId}
          label={label}
          value={value as ColorValue | undefined}
          inherited={inheritedText}
          inheritedValue={inherited as ColorValue | undefined}
          choices={choices}
          describedBy={`${id}-source`}
          onChange={(colour, run) => onChange(slot, property, colour, run)}
          onRunEnd={onRunEnd}
          resetKey={resetKey}
        />
      )}
    </PropertyRow>
  )
}

const UNSET = "__default__"

function ScaleSelect({
  id,
  testId,
  scale,
  value,
  inherited,
  describedBy,
  onChange,
}: {
  id: string
  testId: string
  scale: readonly string[]
  value: string | undefined
  inherited: string
  describedBy: string
  onChange: (step: string | undefined) => void
}) {
  const current = value ?? UNSET
  return (
    <Select
      value={current}
      onValueChange={(step) => {
        if (typeof step === "string") onChange(step === UNSET ? undefined : step)
      }}
    >
      <SelectTrigger id={id} data-testid={testId} aria-describedby={describedBy} className="w-full">
        <SelectValue>
          {current === UNSET ? (
            <span className="text-muted-foreground">{inherited}</span>
          ) : (
            (SCALE_LABELS[current] ?? current)
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent data-testid={`${testId}-choices`}>
        <SelectGroup>
          <SelectItem value={UNSET} className="text-muted-foreground">
            {inherited}
          </SelectItem>
          {scale.map((step) => (
            <SelectItem key={step} value={step}>
              {SCALE_LABELS[step] ?? step}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
