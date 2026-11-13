import { SquareChevronDownIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { required } from "../../runtime/rules"
import { SelectEdit, SelectReadOnly } from "./select"
import { settings, slots } from "./settings"

export const select = defineInput({
  type: "select",
  displayName: "Select",
  description: "One choice from a list of options.",
  category: "input",
  icon: SquareChevronDownIcon,
  valueType: "option",
  settings,
  // A default that is not one of the options is no default.
  defaultValue: ({ defaultValue, options }) =>
    options.some((option) => option.value === defaultValue) ? defaultValue : null,
  rules: [required],
  slots,
  Edit: SelectEdit,
  ReadOnly: SelectReadOnly,
})
