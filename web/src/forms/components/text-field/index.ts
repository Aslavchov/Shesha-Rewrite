import { TextCursorInputIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { lengthRange, maxLength, minLength, pattern, required } from "../../runtime/rules"
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
  constraints: [lengthRange],
  rules: [required, minLength, maxLength, pattern],
  slots,
  forProperty: (property) =>
    property.type === "text" && !property.multiline
      ? {
          label: property.displayName,
          ...(property.helpText ? { helpText: property.helpText } : {}),
          ...(property.required ? { required: true } : {}),
          ...(property.maxLength === undefined ? {} : { maxLength: property.maxLength }),
        }
      : null,
  Edit: TextFieldEdit,
  ReadOnly: TextFieldReadOnly,
})
