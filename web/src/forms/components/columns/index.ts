import { Columns2Icon } from "lucide-react"

import { defineContainer } from "../../runtime"
import { ColumnsRender } from "./columns"
import { columnRegions, settings, slots } from "./settings"

export const columns = defineContainer({
  type: "columns",
  displayName: "Columns",
  description: "Lays components out side by side, and stacks them when it is narrow.",
  category: "layout",
  icon: Columns2Icon,
  settings,
  regions: (resolved) => columnRegions(resolved.columns),
  slots,
  Render: ColumnsRender,
})
