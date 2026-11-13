import { SquareCheckIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { requiredChecked } from "../../runtime/rules"
import { CheckboxEdit, CheckboxReadOnly } from "./checkbox"
import { settings, slots } from "./settings"

export const checkbox = defineInput({
  type: "checkbox",
  displayName: "Checkbox",
  description: "A box that is checked or not.",
  category: "input",
  icon: SquareCheckIcon,
  valueType: "boolean",
  settings,
  defaultValue: (resolved) => resolved.defaultValue,
  rules: [requiredChecked],
  slots,
  Edit: CheckboxEdit,
  ReadOnly: CheckboxReadOnly,
})
