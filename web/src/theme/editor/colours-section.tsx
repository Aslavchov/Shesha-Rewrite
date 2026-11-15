import * as React from "react"
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ColourPicker } from "@/designer/appearance/colour-picker"
import { focusSoon } from "@/designer/properties/edit-run"

import {
  COLOR_ROLES,
  type ColorRole,
  contrastWarnings,
  type Mode,
  MODES,
  resolveColor,
  roleName,
} from "../variables"
import { useEndRun, useThemeEditor, useThemeEditorContext } from "./context"
import { ACCENT_CHOICES, SURFACE_CHOICES } from "./palette"
import { EditorSection } from "./section"

const ROLE_HELP: Record<ColorRole, string> = {
  primary: "Buttons, links, selected items and focus rings.",
  destructive: "Errors and actions that delete.",
  success: "Messages that something worked.",
  warning: "Messages that need attention.",
  info: "Neutral notes.",
  background: "Behind every page.",
  sidebar: "Behind the navigation.",
}

const SOURCE_TEXT = { derived: "From light", "built-in": "Built-in" } as const

/** The theme's colours (spec 3.2): each role in light and in dark mode. */
export function ColoursSection() {
  const theme = useThemeEditor((snapshot) => snapshot.editor.document)
  const warnings = React.useMemo(() => contrastWarnings(theme), [theme])

  return (
    <EditorSection
      testId="theme-colours"
      title="Colours"
      description="Text on a colour is chosen for you, light or dark, to stay readable. A dark value you do not set is worked out from the light one, keeping its hue."
    >
      <div className="flex flex-col gap-3">
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <span className="text-xs font-medium text-muted-foreground">Light mode</span>
          <span className="text-xs font-medium text-muted-foreground">Dark mode</span>
        </div>
        {COLOR_ROLES.map((role) => (
          <RoleRow key={role} role={role} />
        ))}
      </div>
      {warnings.length > 0 ? (
        <output
          data-testid="theme-contrast-warning"
          className="flex gap-2.5 rounded-lg border border-warning/50 bg-warning/5 p-3"
        >
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium text-foreground">
              {warnings.length === 1
                ? "One colour is hard to read"
                : `${warnings.length} colours are hard to read`}
            </p>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {warnings.map((warning) => (
                <li key={`${warning.role}/${warning.mode}/${warning.message}`}>
                  {warning.message}
                </li>
              ))}
            </ul>
          </div>
        </output>
      ) : null}
    </EditorSection>
  )
}

function RoleRow({ role }: { role: ColorRole }) {
  return (
    <fieldset aria-label={roleName(role)} className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium text-foreground">{roleName(role)}</span>
        <span className="text-xs text-muted-foreground">{ROLE_HELP[role]}</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        {MODES.map((mode) => (
          <RoleColour key={mode} role={role} mode={mode} />
        ))}
      </div>
    </fieldset>
  )
}

function RoleColour({ role, mode }: { role: ColorRole; mode: Mode }) {
  const { store } = useThemeEditorContext()
  const theme = useThemeEditor((snapshot) => snapshot.editor.document)
  const epoch = useThemeEditor((snapshot) => snapshot.epoch)
  const endRun = useEndRun()
  const id = React.useId()
  const colour = resolveColor(theme, role, mode)
  const isSet = colour.source === "set"
  const testId = mode === "dark" ? `theme-color-${role}-dark` : `theme-color-${role}`
  const label = `${roleName(role)}, ${mode} mode`

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="min-w-0 flex-1">
        <ColourPicker
          id={id}
          testId={testId}
          label={label}
          value={isSet ? colour.value : undefined}
          inherited={isSet ? "" : `${SOURCE_TEXT[colour.source]} · ${colour.value.toUpperCase()}`}
          inheritedValue={colour.value}
          choices={role === "background" || role === "sidebar" ? SURFACE_CHOICES : ACCENT_CHOICES}
          onChange={(value, run) => {
            if (typeof value !== "string") return
            store.run({ type: "set-color", role, mode, value, ...(run ? { merge: run } : {}) })
          }}
          onRunEnd={endRun}
          resetKey={epoch}
        />
      </div>
      {isSet ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                data-testid={`${testId}-reset`}
                aria-label={`Reset ${label}`}
                onClick={() => {
                  store.run({ type: "set-color", role, mode, value: undefined })
                  focusSoon(() => document.getElementById(id))
                }}
              />
            }
          >
            <RotateCcwIcon aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>
            {mode === "dark"
              ? "Work it out from the light value again"
              : "Back to the built-in colour"}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}
