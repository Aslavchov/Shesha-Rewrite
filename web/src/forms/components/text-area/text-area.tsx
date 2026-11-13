import { Textarea } from "@/components/ui/textarea"

import { StackedField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { settings, Slot } from "./settings"

export function TextAreaEdit({
  instance,
  settings: { label, helpText, placeholder, required: isRequired, rows },
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
        // No native maxLength: text over the limit stays, with the rule's
        // error, so a person who pastes too much can see what to cut.
        <Textarea
          {...control}
          {...slot.control}
          rows={rows}
          value={field.value ?? ""}
          placeholder={placeholder ?? undefined}
          onChange={(event) => field.setValue(event.target.value)}
          onBlur={field.leave}
        />
      )}
    </StackedField>
  )
}

export function TextAreaReadOnly({
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
