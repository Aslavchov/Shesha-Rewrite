import * as React from "react"
import { CalendarIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { formatDate, parseDateText } from "../runtime/dates"
import { DateCalendar } from "./date-calendar"

/**
 * A date typed or picked from the calendar, outside a form: the same control
 * as the Date picker (typed "14 March 1990" or "1990-03-14", or chosen), for
 * places such as a table's filters and the Entities page. The value is
 * "YYYY-MM-DD", or null for none (ADR 0005).
 */
export function DateInput({
  value,
  onChange,
  minDate = null,
  maxDate = null,
  placeholder = "e.g. 14 March 1990",
  testId,
  ...input
}: {
  value: string | null
  onChange: (value: string | null) => void
  minDate?: string | null
  maxDate?: string | null
  placeholder?: string
  testId?: string
} & Pick<
  React.ComponentProps<"input">,
  "id" | "aria-label" | "aria-describedby" | "aria-invalid" | "disabled"
>) {
  /** What is typed, while it is being typed, or null to show the value. */
  const [typed, setTyped] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const isUnreadable = typed !== null && typed.trim() !== "" && parseDateText(typed) === null
  const label = input["aria-label"]

  return (
    <InputGroup>
      <InputGroupInput
        {...input}
        data-testid={testId}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={isUnreadable || input["aria-invalid"] || undefined}
        value={typed ?? (value === null ? "" : formatDate(value))}
        onChange={(event) => {
          const text = event.target.value
          setTyped(text)
          if (text.trim() === "") onChange(null)
          else {
            const parsed = parseDateText(text)
            if (parsed !== null) onChange(parsed)
          }
        }}
        // Typing is over: a date that was read is shown in its standard form;
        // text that is not a date stays, marked, so it can be fixed.
        onBlur={() => {
          if (!isUnreadable) setTyped(null)
        }}
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <InputGroupButton
                size="icon-xs"
                aria-label={label ? `Choose ${label.toLowerCase()}` : "Choose date"}
                data-testid={testId ? `${testId}-trigger` : undefined}
                disabled={input.disabled}
              />
            }
          >
            <CalendarIcon aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            aria-label={label ? `Choose ${label.toLowerCase()}` : "Choose date"}
            data-testid={testId ? `${testId}-popup` : undefined}
            className="w-auto p-0"
            // The calendar focuses its own day: the selected one, or today.
            initialFocus={false}
          >
            <DateCalendar
              value={value}
              minDate={minDate}
              maxDate={maxDate}
              onChoose={(chosen) => {
                setTyped(null)
                onChange(chosen)
                setOpen(false)
              }}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  )
}
