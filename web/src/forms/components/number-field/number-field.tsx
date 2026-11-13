import { Input } from "@/components/ui/input"

import { StackedField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import { useTextDraft } from "../../parts/use-text-draft"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import { formatNumber, parseNumber } from "./number-text"
import type { settings, Slot } from "./settings"

const draftOptions = {
  format: formatNumber,
  parse: parseNumber,
  unreadable: "Enter a number",
}

export function NumberFieldEdit({
  instance,
  settings: { label, helpText, placeholder, required: isRequired, wholeNumber },
  slots: slot,
  field,
}: InputEditProps<"number", typeof settings, Slot>) {
  const draft = useTextDraft(field, draftOptions)

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
        // A text input, not type="number": the browser's number input hides
        // what was typed when it cannot read it, and changes value on scroll.
        <Input
          {...control}
          {...slot.control}
          type="text"
          inputMode={wholeNumber ? "numeric" : "decimal"}
          value={draft.text}
          placeholder={placeholder ?? undefined}
          onChange={(event) => draft.change(event.target.value)}
          onBlur={() => {
            draft.settle()
            field.leave()
          }}
        />
      )}
    </StackedField>
  )
}

export function NumberFieldReadOnly({
  instance,
  settings: { label },
  slots: slot,
  value,
}: InputReadOnlyProps<"number", typeof settings, Slot>) {
  return (
    <ReadOnlyField name={instance.name} label={label} slots={slot}>
      {value === null ? null : formatNumber(value)}
    </ReadOnlyField>
  )
}
