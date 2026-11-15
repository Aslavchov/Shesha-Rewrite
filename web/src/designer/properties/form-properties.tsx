import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { FormDocument } from "@/generated"

import { useDesignerContext } from "../context"
import { formDescriptionProblem, formNameProblem } from "../model/rules"
import { FORM_OWNER } from "../model/settings"
import { useCheckedText } from "./panel-run"
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
  const field = useCheckedText(name, formNameProblem, (text, run) =>
    store.run({ type: "rename-form", name: text, merge: run }),
  )
  const id = "props-form-name-input"
  return (
    <PropertyRow id={id} label="Name" error={field.error}>
      <Input
        id={id}
        data-testid="props-form-name"
        value={field.draft}
        aria-invalid={field.error !== null || undefined}
        aria-describedby={describedBy(id, field.error, undefined)}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        onChange={(event) => field.onChange(event.target.value)}
      />
    </PropertyRow>
  )
}

function FormDescriptionField({ description }: { description: string }) {
  const { store } = useDesignerContext()
  const field = useCheckedText(description, formDescriptionProblem, (text, run) =>
    store.run({ type: "describe-form", description: text, merge: run }),
  )
  const id = "props-form-description-input"
  const help = "Shown with the form in the Forms list."
  return (
    <PropertyRow id={id} label="Description" help={help} error={field.error}>
      <Textarea
        id={id}
        data-testid="props-form-description"
        value={field.draft}
        rows={3}
        aria-invalid={field.error !== null || undefined}
        aria-describedby={describedBy(id, field.error, help)}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        onChange={(event) => field.onChange(event.target.value)}
        className="min-h-16"
      />
    </PropertyRow>
  )
}
