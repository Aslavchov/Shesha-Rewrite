import { optionalChoiceFrom, space, type Tab, tabs } from "../../runtime/settings"

export const settings = {
  tabs: tabs({
    label: "Tabs",
    help: "Each tab holds its own components. Renaming a tab keeps them.",
    group: "general",
    default: [
      { key: "tab1", label: "Tab 1" },
      { key: "tab2", label: "Tab 2" },
    ],
  }),
  defaultTab: optionalChoiceFrom({
    label: "Default tab",
    help: "The tab shown when the form opens. Without one, the first tab.",
    group: "general",
    from: (resolved) =>
      tabList(resolved.tabs).map((tab) => ({ value: tab.key, label: tab.label || tab.key })),
  }),
  gap: space({
    label: "Gap",
    help: "The space between the components in a tab.",
    group: "layout",
    default: "md",
  }),
}

/** The tabs in resolved settings, read without trusting their type. */
function tabList(value: unknown): readonly Tab[] {
  return settings.tabs.parse(value) ?? settings.tabs.default
}

/** The tab shown first: the default tab if it is one of the tabs, else the first. */
export function firstTab(list: readonly Tab[], defaultTab: string | null): string {
  return list.find((tab) => tab.key === defaultTab)?.key ?? list[0]?.key ?? ""
}

export const slots = ["root", "list", "tab", "panel"] as const

export type Slot = (typeof slots)[number]
