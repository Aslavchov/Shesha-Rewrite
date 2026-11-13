import { TextAlignStartIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { maxLength, required } from "../../runtime/rules"
import { settings, slots } from "./settings"
import { TextAreaEdit, TextAreaReadOnly } from "./text-area"

export const textArea = defineInput({
  type: "text-area",
  displayName: "Text area",
  description: "Several lines of text.",
  category: "input",
  icon: TextAlignStartIcon,
  valueType: "text",
  settings,
  defaultValue: (resolved) => resolved.defaultValue,
  rules: [required, maxLength],
  slots,
  Edit: TextAreaEdit,
  ReadOnly: TextAreaReadOnly,
})
