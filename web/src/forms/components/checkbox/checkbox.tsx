import { Checkbox } from "@/components/ui/checkbox"

import { InlineField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { settings, Slot } from "./settings"

export function CheckboxEdit({
  instance,
  settings: { label, helpText, required: isRequired },
  slots: slot,
  field,
}: InputEditProps<"boolean", typeof settings, Slot>) {
  return (
    <InlineField
      name={instance.name}
      field={field}
      label={label}
      required={isRequired}
      helpText={helpText}
      slots={slot}
    >
      {(control) => (
        <Checkbox
          {...control}
          {...slot.control}
          // A real button, so the label beside it names it and toggles it.
          // The linter cannot see that label: it is tied to this id by htmlFor.
          nativeButton
          // oxlint-disable-next-line jsx-a11y/control-has-associated-label
          render={<button type="button" />}
          checked={field.value === true}
          onCheckedChange={(checked) => field.setValue(checked)}
          onBlur={field.leave}
        />
      )}
    </InlineField>
  )
}

export function CheckboxReadOnly({
  instance,
  settings: { label },
  slots: slot,
  value,
}: InputReadOnlyProps<"boolean", typeof settings, Slot>) {
  return (
    <ReadOnlyField name={instance.name} label={label} slots={slot}>
      {value === true ? "Yes" : "No"}
    </ReadOnlyField>
  )
}
