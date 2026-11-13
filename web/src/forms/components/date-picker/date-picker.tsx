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
  // The control is the text input and the calendar button; the calendar is
  // rendered elsewhere in the page, in a portal.
  const control = React.useRef<HTMLDivElement>(null)
  const calendar = React.useRef<HTMLDivElement>(null)

  function leave() {
    draft.settle()
    field.leave()
  }

  /*
   * The field is left when focus leaves the control while the calendar is
   * closed (ADR 0005). Moving between the input and the button is not
   * leaving, and nothing is while the calendar is open: what happened to
   * focus in the meantime is settled when it has closed (`calendarClosed`).
   * React also sends the calendar's own focus events here, through the
   * portal; they never count, the calendar not being part of the control.
   */
  function blurred(event: React.FocusEvent) {
    const group = control.current
    if (open || group === null) return
    if (!(event.target instanceof Node) || !group.contains(event.target)) return
    if (!group.contains(event.relatedTarget)) leave()
  }

  /*
   * The calendar has closed. The field is left if focus is now on something
   * else on the page: the person tabbed out of the calendar, or clicked
   * another control. Otherwise focus is on its way back to the button
   * (after Escape, or a day being picked), and that is not leaving.
   */
  function calendarClosed() {
    const focused = document.activeElement
    if (focused === null || focused === document.body) return
    if (control.current?.contains(focused) || calendar.current?.contains(focused)) return
    leave()
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
      {(attributes) => (
        <InputGroup ref={control} onBlur={blurred}>
          <InputGroupInput
            {...attributes}
            {...slot.control}
            type="text"
            autoComplete="off"
            value={draft.text}
            placeholder={placeholder}
            onChange={(event) => draft.change(event.target.value)}
            // Typing is over: a date that was read is shown in its standard form.
            onBlur={draft.settle}
          />
          <InputGroupAddon align="inline-end">
            <Popover
              open={open}
              onOpenChange={setOpen}
              onOpenChangeComplete={(isOpen) => {
                if (!isOpen) calendarClosed()
              }}
            >
              <PopoverTrigger
                render={
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="Choose date"
                    data-testid={`field-${instance.name}-trigger`}
                    {...slot.trigger}
                  />
                }
              >
                <CalendarIcon aria-hidden="true" />
              </PopoverTrigger>
              <PopoverContent
                ref={calendar}
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
