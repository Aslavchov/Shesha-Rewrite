import { useCatalog } from "@/data/client"
import type { ReferenceListItem } from "@/generated"

/** The items of a list, in order, and whether the list is known yet. */
export function useReferenceList(name: string | null): {
  readonly status: "none" | "loading" | "ready" | "missing"
  readonly items: readonly ReferenceListItem[]
} {
  const catalog = useCatalog()
  if (name === null) return { status: "none", items: [] }
  const list = catalog.list(name)
  if (list) return { status: "ready", items: list.items }
  return { status: catalog.status === "ready" ? "missing" : "loading", items: [] }
}
