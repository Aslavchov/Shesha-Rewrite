import { Switch } from "@/components/ui/switch"

import { InlineField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { settings, Slot } from "./settings"

export function SwitchEdit({
  instance,
  settings: { label, helpText },
  slots: slot,
  field,
}: InputEditProps<"boolean", typeof settings, Slot>) {
  return (
    <InlineField name={instance.name} field={field} label={label} helpText={helpText} slots={slot}>
      {(control) => (
        <Switch
          {...control}
          {...slot.control}
          // A real button, so the label beside it names it and toggles it.
          nativeButton
          render={<button type="button" />}
          checked={field.value === true}
          onCheckedChange={(checked) => field.setValue(checked)}
          onBlur={field.leave}
        />
      )}
    </InlineField>
  )
}

export function SwitchReadOnly({
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
