import { HashIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { max, min, numberRange, required, wholeNumber } from "../../runtime/rules"
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
  constraints: [numberRange],
  rules: [required, wholeNumber, min, max],
  slots,
  forProperty: (property) =>
    property.type === "number"
      ? {
          label: property.displayName,
          ...(property.helpText ? { helpText: property.helpText } : {}),
          ...(property.required ? { required: true } : {}),
          ...(property.whole ? { wholeNumber: true } : {}),
          ...(property.min === undefined ? {} : { min: property.min }),
          ...(property.max === undefined ? {} : { max: property.max }),
        }
      : null,
  Edit: NumberFieldEdit,
  ReadOnly: NumberFieldReadOnly,
})
