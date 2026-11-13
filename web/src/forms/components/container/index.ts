import { SquareDashedIcon } from "lucide-react"

import { defineContainer } from "../../runtime"
import { ContainerRender } from "./container"
import { CONTENT_REGION, settings, slots } from "./settings"

export const container = defineContainer({
  type: "container",
  displayName: "Container",
  description: "Groups components in a column or a row, with an optional title.",
  category: "layout",
  icon: SquareDashedIcon,
  settings,
  regions: () => [CONTENT_REGION],
  slots,
  Render: ContainerRender,
})
