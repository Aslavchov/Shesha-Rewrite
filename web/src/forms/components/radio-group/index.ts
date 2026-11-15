import { CircleDotIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { required } from "../../runtime/rules"
import { RadioGroupEdit, RadioGroupReadOnly } from "./radio-group"
import { settings, slots } from "./settings"

export const radioGroup = defineInput({
  type: "radio-group",
  displayName: "Radio group",
  description: "One choice from a few options, all in view.",
  category: "input",
  icon: CircleDotIcon,
  valueType: "option",
  settings,
  // A default that is not one of the options is no default.
  defaultValue: ({ defaultValue, options }) =>
    options.some((option) => option.value === defaultValue) ? defaultValue : null,
  rules: [required],
  slots,
  Edit: RadioGroupEdit,
  ReadOnly: RadioGroupReadOnly,
})
