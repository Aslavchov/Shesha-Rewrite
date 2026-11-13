import type { Space } from "@/generated"

/**
 * The gap between the children of a region, as a class. Spelled out in full
 * so Tailwind sees each class; the values are the space tokens.
 */
export const GAP_CLASS: Record<Space, string> = {
  none: "gap-(--sys-space-none)",
  xs: "gap-(--sys-space-xs)",
  sm: "gap-(--sys-space-sm)",
  md: "gap-(--sys-space-md)",
  lg: "gap-(--sys-space-lg)",
  xl: "gap-(--sys-space-xl)",
}
