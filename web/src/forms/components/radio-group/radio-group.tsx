import { cn } from "cn"

import { Field, FieldLabel } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

import { GroupField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { Option } from "../../runtime/settings"
import type { settings, Slot } from "./settings"

/** What a value is shown as: its option's label, or the value itself if no option has it. */
function labelOf(options: readonly Option[], value: string | null): string | null {
  if (value === null) return null
  return options.find((option) => option.value === value)?.label ?? value
}

const ORIENTATION = {
  vertical: "flex flex-col gap-2.5",
  horizontal: "flex flex-row flex-wrap gap-x-5 gap-y-2.5",
} as const

export function RadioGroupEdit({
  instance,
  settings: { label, helpText, options, required: isRequired, orientation },
  slots: slot,
  field,
}: InputEditProps<"option", typeof settings, Slot>) {
  return (
    <GroupField
      name={instance.name}
      field={field}
      label={label}
      required={isRequired}
      helpText={helpText}
      slots={slot}
    >
      {({ itemId, ...group }) => (
        <RadioGroup
          {...group}
          aria-orientation={orientation}
          className={cn("w-full", ORIENTATION[orientation])}
          // Base UI's group needs a value it controls; "no value" is null.
          value={field.value}
          onValueChange={(value) => field.setValue(typeof value === "string" ? value : null)}
          onBlur={(event) => {
            // Moving between the options is not leaving the field.
            if (!event.currentTarget.contains(event.relatedTarget)) field.leave()
          }}
        >
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">No options yet.</p>
          ) : (
            options.map((option, index) => (
              <Field
                key={option.value}
                orientation="horizontal"
                className="w-fit"
                data-testid={`field-${instance.name}-option`}
                {...slot.item}
              >
                <RadioGroupItem
                  id={itemId(index)}
                  value={option.value}
                  aria-invalid={group["aria-invalid"]}
                  // A real button, so the label beside it names it and selects it.
                  nativeButton
                  // oxlint-disable-next-line jsx-a11y/control-has-associated-label
                  render={<button type="button" />}
                />
                <FieldLabel htmlFor={itemId(index)} className="font-normal">
                  {option.label}
                </FieldLabel>
              </Field>
            ))
          )}
        </RadioGroup>
      )}
    </GroupField>
  )
}

export function RadioGroupReadOnly({
  instance,
  settings: { label, options },
  slots: slot,
  value,
}: InputReadOnlyProps<"option", typeof settings, Slot>) {
  return (
    <ReadOnlyField name={instance.name} label={label} slots={slot}>
      {labelOf(options, value)}
    </ReadOnlyField>
  )
}
