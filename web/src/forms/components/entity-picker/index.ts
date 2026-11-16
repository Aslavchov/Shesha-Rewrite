import { TextSearchIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { required } from "../../runtime/rules"
import { EntityPickerEdit, EntityPickerReadOnly } from "./entity-picker"
import { settings, slots } from "./settings"

export const entityPicker = defineInput({
  type: "entity-picker",
  displayName: "Entity picker",
  description: "A row of another entity, found by searching.",
  category: "input",
  icon: TextSearchIcon,
  valueType: "reference",
  settings,
  defaultValue: () => null,
  rules: [required],
  slots,
  forProperty: (property) =>
    property.type === "reference"
      ? {
          label: property.displayName,
          ...(property.helpText ? { helpText: property.helpText } : {}),
          entity: property.entity ?? null,
          ...(property.required ? { required: true } : {}),
        }
      : null,
  Edit: EntityPickerEdit,
  ReadOnly: EntityPickerReadOnly,
})
