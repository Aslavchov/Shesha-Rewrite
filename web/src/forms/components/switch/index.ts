import { ToggleRightIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { settings, slots } from "./settings"
import { SwitchEdit, SwitchReadOnly } from "./switch"

export const switchField = defineInput({
  type: "switch",
  displayName: "Switch",
  description: "A setting that is on or off.",
  category: "input",
  icon: ToggleRightIcon,
  valueType: "boolean",
  settings,
  defaultValue: (resolved) => resolved.defaultValue,
  rules: [],
  slots,
  Edit: SwitchEdit,
  ReadOnly: SwitchReadOnly,
})
