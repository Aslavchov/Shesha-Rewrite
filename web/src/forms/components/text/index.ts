import { TypeIcon } from "lucide-react"

import { defineStatic } from "../../runtime"
import { settings, slots } from "./settings"
import { TextRender } from "./text"

export const text = defineStatic({
  type: "text",
  displayName: "Text",
  description: "A heading or a paragraph.",
  category: "content",
  icon: TypeIcon,
  settings,
  slots,
  Edit: TextRender,
  ReadOnly: TextRender,
})
