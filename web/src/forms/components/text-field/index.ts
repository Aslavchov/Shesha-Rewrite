import { TextCursorInputIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { maxLength, minLength, pattern, required } from "../../runtime/rules"
import { settings, slots } from "./settings"
import { TextFieldEdit, TextFieldReadOnly } from "./text-field"

export const textField = defineInput({
  type: "text-field",
  displayName: "Text field",
  description: "A single line of text.",
  category: "input",
  icon: TextCursorInputIcon,
  valueType: "text",
  settings,
  defaultValue: (resolved) => resolved.defaultValue,
  rules: [required, minLength, maxLength, pattern],
  slots,
  Edit: TextFieldEdit,
  ReadOnly: TextFieldReadOnly,
})
