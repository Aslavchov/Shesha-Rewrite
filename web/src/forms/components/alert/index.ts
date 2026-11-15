import { MessageSquareWarningIcon } from "lucide-react"

import { defineStatic } from "../../runtime"
import { AlertRender } from "./alert"
import { settings, slots } from "./settings"

export const alert = defineStatic({
  type: "alert",
  displayName: "Alert",
  description: "A message for the people filling in the form.",
  category: "content",
  icon: MessageSquareWarningIcon,
  settings,
  slots,
  Edit: AlertRender,
  ReadOnly: AlertRender,
})
