import * as React from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { StackedField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { Option } from "../../runtime/settings"
import type { settings, Slot } from "./settings"

const DEFAULT_PLACEHOLDER = "Select an option"

/** What a value is shown as: its option's label, or the value itself if no option has it. */
function labelOf(options: readonly Option[], value: string | null): string | null {
  if (value === null) return null
  return options.find((option) => option.value === value)?.label ?? value
}

export function SelectEdit({
  instance,
  settings: { label, helpText, placeholder, options, required: isRequired },
  slots: slot,
  field,
}: InputEditProps<"option", typeof settings, Slot>) {
  const prompt = placeholder ?? DEFAULT_PLACEHOLDER
  // The field is left when focus leaves it while the list is closed (ADR 0005).
  // Opening the list moves focus from the trigger into it, which is not leaving.
  const isOpen = React.useRef(false)

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
        <Select
          value={field.value}
          onValueChange={(value) => field.setValue(value)}
          onOpenChange={(open, { reason }) => {
            isOpen.current = open
            // Tabbing or clicking away from the open list closes it and moves
            // on without passing through the trigger. Escape and choosing an
            // option return focus to the trigger, so they are not leaving.
            if (!open && (reason === "focus-out" || reason === "outside-press")) field.leave()
          }}
        >
          <SelectTrigger
            {...control}
            {...slot.trigger}
            className="w-full"
            onBlur={() => {
              if (!isOpen.current) field.leave()
            }}
          >
            <SelectValue>{labelOf(options, field.value) ?? prompt}</SelectValue>
          </SelectTrigger>
          <SelectContent data-testid={`field-${instance.name}-popup`} {...slot.popup}>
            <SelectGroup>
              {isRequired ? null : (
                // An optional select can be cleared: this item's value is "no value".
                <SelectItem
                  value={null}
                  data-testid={`field-${instance.name}-option`}
                  className="text-muted-foreground"
                  {...slot.item}
                >
                  {prompt}
                </SelectItem>
              )}
              {options.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  data-testid={`field-${instance.name}-option`}
                  {...slot.item}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </StackedField>
  )
}

export function SelectReadOnly({
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
