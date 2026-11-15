import * as React from "react"
import { flushSync } from "react-dom"
import { cn } from "cn"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { type ContainerProps, GAP_CLASS, REVEAL_EVENT } from "../../runtime"
import { firstTab, type settings, type Slot } from "./settings"

/** On each panel: the key of its tab, so a control inside can say which tab to show. */
const PANEL_ATTRIBUTE = "data-tab-key"

/**
 * Tabs: one region per tab, keyed by the tab's stable key (ADR 0009). Every
 * panel stays mounted, so the fields in a tab that is not shown still take
 * part in validation; when one of them is the first invalid field, its tab is
 * shown before it takes focus.
 */
export function TabsRender({
  instance,
  settings: { tabs, defaultTab, gap },
  slots,
  region,
  shownRegion,
  regionSwitch,
}: ContainerProps<typeof settings, Slot>) {
  const initial = firstTab(tabs, defaultTab)
  const [chosen, setChosen] = React.useState(initial)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const isTab = (key: string | null) => tabs.some((tab) => tab.key === key)
  // In the designer, the tab the author chose. Otherwise the person's
  // choice, while it is still one of the tabs.
  const active =
    shownRegion !== null && isTab(shownRegion) ? shownRegion : isTab(chosen) ? chosen : initial

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const reveal = (event: Event) => {
      const panel = (event.target as Element).closest(`[${PANEL_ATTRIBUTE}]`)
      // Only this component's own panels: an inner Tabs handles its own.
      if (!panel || panel.closest("[data-slot=tabs]") !== root) return
      const key = panel.getAttribute(PANEL_ATTRIBUTE)
      // Synchronously, so the focus that follows the event lands.
      if (key) flushSync(() => setChosen(key))
    }
    root.addEventListener(REVEAL_EVENT, reveal)
    return () => root.removeEventListener(REVEAL_EVENT, reveal)
  }, [])

  return (
    <Tabs
      ref={rootRef}
      value={active}
      onValueChange={(value) => {
        if (typeof value === "string") setChosen(value)
      }}
      className="min-w-0 gap-3"
      {...slots.root}
    >
      <TabsList {...slots.list}>
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.key}
            value={tab.key}
            data-testid={`field-${instance.name}-tab-${tab.key}`}
            {...regionSwitch(tab.key)}
            {...slots.tab}
          >
            {tab.label || "Untitled"}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.key}
          value={tab.key}
          keepMounted
          data-testid={`field-${instance.name}-panel-${tab.key}`}
          {...{ [PANEL_ATTRIBUTE]: tab.key }}
          className={cn("flex min-w-0 flex-col", GAP_CLASS[gap])}
          {...slots.panel}
        >
          {region(tab.key)}
        </TabsContent>
      ))}
    </Tabs>
  )
}
