import * as React from "react"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { FormDocument } from "@/generated"

import { useDesignerContext } from "../context"
import { formDescriptionProblem, formNameProblem } from "../model/rules"
import { FORM_OWNER } from "../model/settings"
import { useDraft, useEditRun } from "./edit-run"
import { describedBy } from "./described-by"
import { PanelSection, PropertyRow } from "./property-row"
import { SettingsEditor } from "./settings-editor"

const NO_CONTEXT = {
  resolved: {},
  rules: [],
  storedRegions: [],
  showRegion: () => {},
}

/** With nothing selected: the form's own name, description and settings (spec 3.3). */
export function FormProperties({ document }: { document: FormDocument }) {
  return (
    <>
      <PanelSection title="Form" testId="props-form">
        <FormNameField name={document.name} />
        <FormDescriptionField description={document.description ?? ""} />
      </PanelSection>
      <SettingsEditor
        target={null}
        owner={FORM_OWNER}
        stored={document.settings}
        context={NO_CONTEXT}
        hidden={0}
      />
    </>
  )
}

function FormNameField({ name }: { name: string }) {
  const { store } = useDesignerContext()
  const run = useEditRun()
  const [draft, setDraft] = useDraft(name)
  const [error, setError] = React.useState<string | null>(null)
  const id = "props-form-name-input"
  return (
    <PropertyRow id={id} label="Name" error={error}>
      <Input
        id={id}
        data-testid="props-form-name"
        value={draft}
        aria-invalid={error !== null || undefined}
        aria-describedby={describedBy(id, error, undefined)}
        onFocus={run.start}
        onBlur={run.end}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          const problem = formNameProblem(text)
          setError(problem)
          if (problem === null) store.run({ type: "rename-form", name: text, merge: run.current() })
        }}
      />
    </PropertyRow>
  )
}

function FormDescriptionField({ description }: { description: string }) {
  const { store } = useDesignerContext()
  const run = useEditRun()
  const [draft, setDraft] = useDraft(description)
  const [error, setError] = React.useState<string | null>(null)
  const id = "props-form-description-input"
  const help = "Shown with the form in the Forms list."
  return (
    <PropertyRow id={id} label="Description" help={help} error={error}>
      <Textarea
        id={id}
        data-testid="props-form-description"
        value={draft}
        rows={3}
        aria-invalid={error !== null || undefined}
        aria-describedby={describedBy(id, error, help)}
        onFocus={run.start}
        onBlur={run.end}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          const problem = formDescriptionProblem(text)
          setError(problem)
          if (problem === null) {
            store.run({ type: "describe-form", description: text, merge: run.current() })
          }
        }}
        className="min-h-16"
      />
    </PropertyRow>
  )
}
