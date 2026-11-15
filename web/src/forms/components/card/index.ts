import { SquareIcon } from "lucide-react"

import { defineContainer } from "../../runtime"
import { CardRender } from "./card"
import { CONTENT_REGION, settings, slots } from "./settings"

export const card = defineContainer({
  type: "card",
  displayName: "Card",
  description: "Groups components on a raised surface, with a title.",
  category: "layout",
  icon: SquareIcon,
  settings,
  regions: () => [CONTENT_REGION],
  slots,
  Render: CardRender,
})
