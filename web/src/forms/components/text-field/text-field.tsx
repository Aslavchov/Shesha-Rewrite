import { Input } from "@/components/ui/input"

import { StackedField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { settings, Slot } from "./settings"

export function TextFieldEdit({
  instance,
  settings: { label, helpText, placeholder, required: isRequired },
  slots: slot,
  field,
}: InputEditProps<"text", typeof settings, Slot>) {
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
        <Input
          {...control}
          {...slot.control}
          type="text"
          value={field.value ?? ""}
          placeholder={placeholder ?? undefined}
          onChange={(event) => field.setValue(event.target.value)}
          onBlur={field.leave}
        />
      )}
    </StackedField>
  )
}

export function TextFieldReadOnly({
  instance,
  settings: { label },
  slots: slot,
  value,
}: InputReadOnlyProps<"text", typeof settings, Slot>) {
  return (
    <ReadOnlyField name={instance.name} label={label} slots={slot}>
      {value}
    </ReadOnlyField>
  )
}
