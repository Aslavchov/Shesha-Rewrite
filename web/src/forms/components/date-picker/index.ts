import { CalendarDaysIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { maxDate, minDate, required } from "../../runtime/rules"
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
  rules: [required, minDate, maxDate],
  slots,
  Edit: DatePickerEdit,
  ReadOnly: DatePickerReadOnly,
})
