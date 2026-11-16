import type { ItemColor } from "@/generated"

/** What each colour is called where one is chosen. */
export const ITEM_COLOR_LABELS: Record<ItemColor, string> = {
  muted: "Neutral",
  primary: "Primary",
  success: "Success",
  warning: "Warning",
  info: "Information",
  destructive: "Destructive",
}
