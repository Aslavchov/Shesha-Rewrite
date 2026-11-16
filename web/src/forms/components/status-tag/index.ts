import { TagIcon } from "lucide-react"

import { defineInput } from "../../runtime"
import { settings, slots } from "./settings"
import { StatusTagEdit, StatusTagReadOnly } from "./status-tag"

export const statusTag = defineInput({
  type: "status-tag",
  displayName: "Status tag",
  description: "A reference list value, as a coloured label.",
  category: "content",
  icon: TagIcon,
  valueType: "option",
  settings,
  defaultValue: () => null,
  rules: [],
  slots,
  Edit: StatusTagEdit,
  ReadOnly: StatusTagReadOnly,
})
