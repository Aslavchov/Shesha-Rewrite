import { CalendarDaysIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { dateRange, maxDate, minDate, required } from "../../runtime/rules"
import { DatePickerEdit, DatePickerReadOnly } from "./date-picker"
import { settings, slots } from "./settings"

export const datePicker = defineInput({
  type: "date-picker",
  displayName: "Date picker",
  description: "A calendar date, typed or picked from a calendar.",
  category: "input",
  icon: CalendarDaysIcon,
  valueType: "date",
  settings,
  defaultValue: (resolved) => resolved.defaultValue,
  constraints: [dateRange],
  rules: [required, minDate, maxDate],
  slots,
  forProperty: (property) =>
    property.type === "date"
      ? {
          label: property.displayName,
          ...(property.helpText ? { helpText: property.helpText } : {}),
          ...(property.required ? { required: true } : {}),
          ...(property.earliest === undefined ? {} : { minDate: property.earliest }),
          ...(property.latest === undefined ? {} : { maxDate: property.latest }),
        }
      : null,
  Edit: DatePickerEdit,
  ReadOnly: DatePickerReadOnly,
})
