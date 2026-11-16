import { ListChecksIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { required } from "../../runtime/rules"
import { ReferenceListSelectEdit, ReferenceListSelectReadOnly } from "./reference-list-select"
import { settings, slots } from "./settings"

export const referenceListSelect = defineInput({
  type: "reference-list-select",
  displayName: "Reference-list select",
  description: "One choice from a reference list.",
  category: "input",
  icon: ListChecksIcon,
  valueType: "option",
  settings,
  defaultValue: () => null,
  rules: [required],
  slots,
  forProperty: (property) =>
    property.type === "referenceList"
      ? {
          label: property.displayName,
          ...(property.helpText ? { helpText: property.helpText } : {}),
          referenceList: property.referenceList ?? null,
          ...(property.required ? { required: true } : {}),
        }
      : null,
  Edit: ReferenceListSelectEdit,
  ReadOnly: ReferenceListSelectReadOnly,
})
