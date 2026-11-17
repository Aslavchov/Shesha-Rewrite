import { StatusTag } from "@/components/status-tag"
import type { ReferenceListItem } from "@/generated"

/** What components that show reference list values share (ADR 0011). */

/**
 * A stored value as its item's label in its colour. A value the list no
 * longer has is shown as it is stored, so nothing a row holds is ever hidden.
 */
export function ItemTag({
  items,
  value,
  ...props
}: {
  items: readonly ReferenceListItem[]
  value: string
} & Omit<React.ComponentProps<typeof StatusTag>, "color" | "children">) {
  const item = items.find((candidate) => candidate.value === value)
  return (
    <StatusTag color={item?.color ?? "muted"} retired={item?.retired} {...props}>
      {item?.label ?? value}
    </StatusTag>
  )
}
