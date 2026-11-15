import * as React from "react"
import { TriangleAlertIcon } from "lucide-react"

import type { Setting, SettingGroup, SettingKind } from "@/forms/runtime"

import { useDesignerContext } from "../context"
import { type Command, type CommandResult } from "../model/editor"
import { type SettingsOwner, settingProblem } from "../model/settings"
import {
  BooleanEditor,
  ChoiceEditor,
  DateEditor,
  type EditorContext,
  NumberEditor,
  NumberListEditor,
  PatternEditor,
  type SettingEditorProps,
  TextEditor,
} from "./editors"
import { MessagesEditor, OptionsEditor, TabsEditor } from "./list-editors"
import { useEpoch } from "./panel-run"
import { describedBy } from "./described-by"
import { focusSoon, useResetOn } from "./edit-run"
import { PanelSection, PropertyRow } from "./property-row"

/**
 * The settings of an instance, or of the form, generated from the
 * descriptors (spec 3.1, ADR 0009): one editor per setting, chosen by its
 * kind, in sections by its group. Nothing here names a component type.
 */

const EDITORS: Record<SettingKind, React.ComponentType<SettingEditorProps>> = {
  text: TextEditor,
  number: NumberEditor,
  boolean: BooleanEditor,
  choice: ChoiceEditor,
  date: DateEditor,
  pattern: PatternEditor,
  options: OptionsEditor,
  "number-list": NumberListEditor,
  messages: MessagesEditor,
  tabs: TabsEditor,
}

const GROUPS: readonly { group: SettingGroup; title: string }[] = [
  { group: "general", title: "General" },
  { group: "data", title: "Data" },
  { group: "validation", title: "Validation" },
  { group: "layout", title: "Layout" },
]

export type SettingsEditorProps = {
  /** The instance whose settings these are, or null for the form's own. */
  readonly target: string | null
  readonly owner: SettingsOwner
  readonly stored: Readonly<Record<string, unknown>> | undefined
  readonly context: EditorContext
  /** How many components the target holds in regions it does not show. */
  readonly hidden: number
}

/** Runs a command and keeps focus where it is: the panel is where the person is typing. */
function useRun() {
  const { store } = useDesignerContext()
  return React.useCallback((command: Command): CommandResult => store.run(command), [store])
}

export function SettingsEditor({ target, owner, stored, context, hidden }: SettingsEditorProps) {
  const entries = Object.entries(owner.settings)
  return GROUPS.map(({ group, title }) => {
    const settings = entries.filter(([, setting]) => setting.group === group)
    if (settings.length === 0) return null
    return (
      <PanelSection key={group} title={title} testId={`props-group-${group}`}>
        {settings.map(([key, setting]) => (
          <SettingField
            key={key}
            target={target}
            settingKey={key}
            setting={setting}
            owner={owner}
            stored={stored}
            context={context}
            hidden={hidden}
          />
        ))}
      </PanelSection>
    )
  })
}

function SettingField({
  target,
  settingKey: key,
  setting,
  owner,
  stored,
  context,
  hidden,
}: Omit<SettingsEditorProps, "owner"> & {
  owner: SettingsOwner
  settingKey: string
  setting: Setting<unknown>
}) {
  const run = useRun()
  const epoch = useEpoch()
  // An error is about what is typed; when the document jumps, it goes.
  const [error, setError] = useResetOn<string | null>(null, epoch)
  /** Said under the row after a change of this setting hid components. */
  const [warning, setWarning] = React.useState<{ before: number } | null>(null)
  const id = `props-${target ?? "form"}-${key}`
  const isSet = stored !== undefined && Object.hasOwn(stored, key)
  const value = isSet ? (setting.parse(stored[key]) ?? setting.default) : setting.default
  const Editor = EDITORS[setting.kind]
  const help = setting.help

  const commit = (next: unknown, merge?: string) => {
    const before = hidden
    run(
      next === undefined
        ? { type: "reset-setting", id: target, key, ...(merge ? { merge } : {}) }
        : { type: "set-setting", id: target, key, value: next, ...(merge ? { merge } : {}) },
    )
    setWarning((current) => current ?? { before })
  }

  const newlyHidden = warning === null ? 0 : hidden - warning.before
  const reset = () => {
    setError(null)
    commit(undefined)
    // The reset button goes with what it reset: focus moves to the editor.
    focusSoon(() => document.getElementById(id))
  }

  return (
    <PropertyRow
      id={id}
      label={setting.label}
      help={help}
      error={error}
      isSet={isSet}
      resetTestId={`props-reset-${key}`}
      onReset={reset}
      inline={setting.kind === "boolean"}
    >
      <Editor
        id={id}
        testId={`props-setting-${key}`}
        setting={setting}
        value={value}
        describedBy={describedBy(id, error, help)}
        invalid={error !== null}
        check={(candidate) => settingProblem(owner, stored, key, candidate)}
        commit={commit}
        onError={setError}
        epoch={epoch}
        context={context}
      />
      {newlyHidden > 0 ? (
        <p
          data-testid={`props-warning-${key}`}
          className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-foreground"
        >
          <TriangleAlertIcon aria-hidden="true" className="mt-px size-3.5 shrink-0 text-warning" />
          <span>
            {newlyHidden === 1
              ? "1 component is now hidden. It is kept, and comes back when its region is shown again."
              : `${newlyHidden} components are now hidden. They are kept, and come back when their regions are shown again.`}
          </span>
        </p>
      ) : null}
    </PropertyRow>
  )
}
