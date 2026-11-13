import { MousePointerClickIcon } from "lucide-react"

import { defineStatic } from "../../runtime"
import { ButtonEdit, ButtonReadOnly } from "./button"
import { settings, slots } from "./settings"

export const button = defineStatic({
  type: "button",
  displayName: "Button",
  description: "Submits or resets the form.",
  category: "action",
  icon: MousePointerClickIcon,
  settings,
  slots,
  Edit: ButtonEdit,
  ReadOnly: ButtonReadOnly,
})
