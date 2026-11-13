import * as React from "react"
import { CalendarIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { StackedField } from "../../parts/field"
import { ReadOnlyField } from "../../parts/read-only"
import { useTextDraft } from "../../parts/use-text-draft"
import type { InputEditProps, InputReadOnlyProps } from "../../runtime"
import { formatDate, parseDateText } from "../../runtime/dates"
import { DateCalendar } from "./date-calendar"
import type { settings, Slot } from "./settings"

export function DatePickerEdit({
  instance,
  settings: { label, helpText, placeholder, required: isRequired, minDate, maxDate },
  slots: slot,
  field,
}: InputEditProps<"date", typeof settings, Slot>) {
  const draft = useTextDraft(field, {
    format: formatDate,
    parse: parseDateText,
    unreadable: "Enter a date like 14 March 1990",
  })
  const [open, setOpen] = React.useState(false)
  // The control: the text input and the calendar button, not the calendar.
  const group = React.useRef<HTMLDivElement>(null)

  function leave() {
    draft.settle()
    field.leave()
  }

  /*
   * The field is left when focus leaves the input and the button while the
   * calendar is closed (ADR 0005). Two things make that less simple than it
   * sounds. React sends the calendar's focus events here too, through the
   * portal, though the calendar is not inside the group in the DOM. And
   * closing the calendar may move focus without any event from the group.
   * So: focus moving inside the calendar is never leaving, and where focus
   * is once the calendar has closed is checked then (`closed`).
   */
  function blurred(event: React.FocusEvent) {
    const control = group.current
    if (open || control === null) return
    if (!(event.target instanceof Node) || !control.contains(event.target)) return
    if (!control.contains(event.relatedTarget)) leave()
  }

  function closed() {
    const control = group.current
    if (control !== null && !control.contains(control.ownerDocument.activeElement)) leave()
  }

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
        <InputGroup ref={group} onBlur={blurred}>
          <InputGroupInput
            {...control}
            {...slot.control}
            type="text"
            autoComplete="off"
            value={draft.text}
            placeholder={placeholder}
            onChange={(event) => draft.change(event.target.value)}
          />
          <InputGroupAddon align="inline-end">
            <Popover
              open={open}
              onOpenChange={setOpen}
              onOpenChangeComplete={(isOpen) => {
                if (!isOpen) closed()
              }}
            >
              <PopoverTrigger
                render={<InputGroupButton size="icon-xs" aria-label="Choose date" />}
                {...slot.trigger}
              >
                <CalendarIcon aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                aria-label="Choose date"
                data-testid={`field-${instance.name}-popup`}
                className="w-auto p-0"
                // The calendar focuses its own day: the selected one, or today.
                initialFocus={false}
                {...slot.popup}
              >
                <DateCalendar
                  value={field.value}
                  minDate={minDate}
                  maxDate={maxDate}
                  onChoose={(value) => {
                    draft.choose(value)
                    setOpen(false)
                  }}
                />
              </PopoverContent>
            </Popover>
          </InputGroupAddon>
        </InputGroup>
      )}
    </StackedField>
  )
}

export function DatePickerReadOnly({
  instance,
  settings: { label },
  slots: slot,
  value,
}: InputReadOnlyProps<"date", typeof settings, Slot>) {
  return (
    <ReadOnlyField name={instance.name} label={label} slots={slot}>
      {value === null ? null : formatDate(value)}
    </ReadOnlyField>
  )
}
