import { HashIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { max, min, required, wholeNumber } from "../../runtime/rules"
import { NumberFieldEdit, NumberFieldReadOnly } from "./number-field"
import { settings, slots } from "./settings"

export const numberField = defineInput({
  type: "number-field",
  displayName: "Number field",
  description: "A number, whole or with decimals.",
  category: "input",
  icon: HashIcon,
  valueType: "number",
  settings,
  defaultValue: (resolved) => resolved.defaultValue,
  rules: [required, wholeNumber, min, max],
  slots,
  Edit: NumberFieldEdit,
  ReadOnly: NumberFieldReadOnly,
})
