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
import { ItemTag } from "../../parts/reference-list"
import { useReferenceList } from "../../parts/use-reference-list"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import type { settings, Slot } from "./settings"

const DEFAULT_PLACEHOLDER = "Select an option"

export function ReferenceListSelectEdit({
  instance,
  settings: { label, helpText, placeholder, referenceList, required: isRequired },
  slots: slot,
  field,
}: InputEditProps<"option", typeof settings, Slot>) {
  const list = useReferenceList(referenceList)
  const prompt =
    list.status === "none"
      ? "No reference list chosen"
      : list.status === "missing"
        ? "This reference list no longer exists"
        : (placeholder ?? DEFAULT_PLACEHOLDER)
  // A retired item is offered only while it is the value (spec section 6).
  const offered = list.items.filter((item) => !item.retired || item.value === field.value)
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
            <SelectValue>
              {field.value === null ? prompt : <ItemTag items={list.items} value={field.value} />}
            </SelectValue>
          </SelectTrigger>
          <SelectContent data-testid={`field-${instance.name}-popup`} {...slot.popup}>
            <SelectGroup>
              {isRequired ? null : (
                <SelectItem
                  value={null}
                  data-testid={`field-${instance.name}-option`}
                  className="text-muted-foreground"
                  {...slot.item}
                >
                  {prompt}
                </SelectItem>
              )}
              {offered.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  data-testid={`field-${instance.name}-option`}
                  data-value={item.value}
                  {...slot.item}
                >
                  <ItemTag items={list.items} value={item.value} />
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </StackedField>
  )
}

export function ReferenceListSelectReadOnly({
  instance,
  settings: { label, referenceList },
  slots: slot,
  value,
}: InputReadOnlyProps<"option", typeof settings, Slot>) {
  const list = useReferenceList(referenceList)
  return (
    <ReadOnlyField name={instance.name} label={label} slots={slot}>
      {value === null ? null : <ItemTag items={list.items} value={value} />}
    </ReadOnlyField>
  )
}
