import * as React from "react"
import { cn } from "cn"

import { useEditRun } from "@/designer/properties/edit-run"

import {
  BUILT_IN_DENSITY,
  BUILT_IN_RADIUS,
  BUILT_IN_TEXT_SIZE,
  DENSITIES,
  type DensityStep,
  RADIUS_RANGE,
  TEXT_SIZE_RANGE,
} from "../variables"
import { useEndRun, useThemeEditor, useThemeEditorContext } from "./context"
import { EditorSection } from "./section"

const DENSITY_LABELS: Record<DensityStep, string> = {
  compact: "Compact",
  regular: "Regular",
  comfortable: "Comfortable",
}

const TEXT_SIZES = Array.from(
  { length: TEXT_SIZE_RANGE.max - TEXT_SIZE_RANGE.min + 1 },
  (_, index) => TEXT_SIZE_RANGE.min + index,
)

/** Roundness, text size and density (spec 3.2): each a small, safe range. */
export function ScalesSection() {
  const { store } = useThemeEditorContext()
  const radius = useThemeEditor((snapshot) => snapshot.editor.document.radius) ?? BUILT_IN_RADIUS
  const textSize =
    useThemeEditor((snapshot) => snapshot.editor.document.textSize) ?? BUILT_IN_TEXT_SIZE
  const density = useThemeEditor((snapshot) => snapshot.editor.document.density) ?? BUILT_IN_DENSITY
  const run = useEditRun(useEndRun())
  const radiusId = React.useId()

  return (
    <EditorSection
      testId="theme-scales"
      title="Shape, text and spacing"
      description="One value each. Every corner, text size, control height and gap in the app follows."
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={radiusId} className="text-sm font-medium text-foreground">
            Roundness
          </label>
          <output
            htmlFor={radiusId}
            data-testid="theme-radius-value"
            className="text-xs text-muted-foreground"
          >
            {radius === 0 ? "Square" : `${radius} px`}
            {radius === BUILT_IN_RADIUS ? " · built-in" : ""}
          </output>
        </div>
        <input
          id={radiusId}
          type="range"
          data-testid="theme-radius"
          min={RADIUS_RANGE.min}
          max={RADIUS_RANGE.max}
          step={1}
          value={radius}
          aria-valuetext={`${radius} pixels`}
          className="h-6 w-full accent-primary"
          // One drag, or one stay in the slider with the keys, is one undo step.
          onFocus={run.start}
          onBlur={() => void run.end()}
          onPointerUp={() => void run.end()}
          onChange={(event) =>
            store.run({
              type: "set-radius",
              value: Number(event.target.value),
              merge: run.current(),
            })
          }
        />
        <p className="text-xs text-muted-foreground">
          The base radius. Small, large and full corners keep their step on the scale.
        </p>
      </div>

      <Steps
        testId="theme-text-size"
        label="Text size"
        help="The size of ordinary text. Headings and small print scale with it."
        options={TEXT_SIZES.map((size) => ({
          value: String(size),
          label: `${size} px`,
          isBuiltIn: size === BUILT_IN_TEXT_SIZE,
        }))}
        value={String(textSize)}
        onChange={(value) => store.run({ type: "set-text-size", value: Number(value) })}
      />

      <Steps
        testId="theme-density"
        label="Density"
        help="How tall controls are and how much space sits between things."
        options={DENSITIES.map((step) => ({
          value: step,
          label: DENSITY_LABELS[step],
          isBuiltIn: step === BUILT_IN_DENSITY,
        }))}
        value={density}
        onChange={(value) => store.run({ type: "set-density", value: value as DensityStep })}
      />
    </EditorSection>
  )
}

/** A few named steps, one chosen: radio buttons that look like a segmented control. */
function Steps({
  testId,
  label,
  help,
  options,
  value,
  onChange,
}: {
  testId: string
  label: string
  help: string
  options: readonly { value: string; label: string; isBuiltIn: boolean }[]
  value: string
  onChange: (value: string) => void
}) {
  const name = React.useId()
  return (
    <fieldset data-testid={testId} className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-foreground">{label}</legend>
      <div className="flex flex-wrap gap-0.5 self-start rounded-lg bg-muted p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            data-testid={`${testId}-${option.value}`}
            className={cn(
              "flex h-7 cursor-pointer items-center rounded-md px-2.5 text-sm text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-xs has-focus-visible:outline-2 has-focus-visible:outline-ring",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              className="sr-only"
              onChange={() => onChange(option.value)}
            />
            {option.label}
            {option.isBuiltIn ? <span className="sr-only"> (built-in)</span> : null}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </fieldset>
  )
}
