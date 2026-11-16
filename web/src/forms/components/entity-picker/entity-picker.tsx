import { useCatalog, useRowDisplay } from "@/data/client"
import { RowCombobox } from "@/data/row-combobox"

import { StackedField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { settings, Slot } from "./settings"

export function EntityPickerEdit({
  instance,
  settings: { label, helpText, placeholder, entity, required: isRequired },
  slots: slot,
  field,
}: InputEditProps<"reference", typeof settings, Slot>) {
  const catalog = useCatalog()
  const definition = catalog.entity(entity)
  const prompt =
    entity === null
      ? "No entity chosen"
      : !definition && catalog.status === "ready"
        ? "This entity no longer exists"
        : (placeholder ?? `Search ${definition?.displayName.toLowerCase() ?? "rows"}…`)

  return (
    <StackedField
      name={instance.name}
      field={field}
      label={label}
      required={isRequired}
      helpText={helpText}
      slots={slot}
    >
      {(control) => (
        <RowCombobox
          {...control}
          {...slot.control}
          entity={definition ? entity : null}
          value={field.value}
          onChange={field.setValue}
          onLeave={field.leave}
          placeholder={prompt}
          clearable={!isRequired}
          disabled={!definition}
          popupTestId={`field-${instance.name}-popup`}
          popupProps={slot.popup}
        />
      )}
    </StackedField>
  )
}

export function EntityPickerReadOnly({
  instance,
  settings: { label, entity },
  slots: slot,
  value,
}: InputReadOnlyProps<"reference", typeof settings, Slot>) {
  const display = useRowDisplay(entity, value)
  return (
    <ReadOnlyField name={instance.name} label={label} slots={slot}>
      {value === null ? null : (display ?? "…")}
    </ReadOnlyField>
  )
}
