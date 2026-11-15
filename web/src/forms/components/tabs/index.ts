import { PanelTopIcon } from "lucide-react"

import { defineContainer } from "../../runtime"
import { settings, slots } from "./settings"
import { TabsRender } from "./tabs"

export const tabs = defineContainer({
  type: "tabs",
  displayName: "Tabs",
  description: "Splits components across tabs, one shown at a time.",
  category: "layout",
  icon: PanelTopIcon,
  settings,
  // Each tab's region is keyed by the tab's key, never by its label.
  regions: (resolved) => resolved.tabs.map((tab) => tab.key),
  regionLabel: (resolved, name) => {
    const tab = resolved.tabs.find((candidate) => candidate.key === name)
    return tab ? tab.label || "Untitled" : name
  },
  slots,
  Render: TabsRender,
})
