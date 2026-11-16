import type { DataFilter, DataQuery, PropertyDefinition } from "@/generated"

/**
 * What a person has asked of one table: the page, the order, the search and
 * the filters. Pure, so the query it becomes can be tested by itself.
 */

/** One property's filter as typed: a single value, or the two ends of a range. */
export type FilterDraft = { readonly value?: string; readonly from?: string; readonly to?: string }

export type TableView = {
  readonly page: number
  readonly sort: { readonly property: string; readonly direction: "asc" | "desc" } | null
  readonly search: string
  readonly filters: Readonly<Record<string, FilterDraft>>
  /**
   * What the person left the table through: a row they opened, or New.
   * Focus returns there when they come back.
   */
  readonly returnTo?: string | null
}

export const INITIAL_VIEW: TableView = { page: 1, sort: null, search: "", filters: {} }

/** Clicking a header: ascending, then descending, then the table's own order again. */
export function nextSort(view: TableView, property: string): TableView["sort"] {
  if (view.sort?.property !== property) return { property, direction: "asc" }
  return view.sort.direction === "asc" ? { property, direction: "desc" } : null
}

const filled = (text: string | undefined): text is string =>
  text !== undefined && text.trim() !== ""

/** The typed filters of one property (ADR 0011), from what was entered for it. */
export function filtersFor(property: PropertyDefinition, draft: FilterDraft): DataFilter[] {
  const name = property.name
  switch (property.type) {
    case "text":
      return filled(draft.value)
        ? [{ property: name, op: "contains", value: draft.value.trim() }]
        : []
    case "number": {
      const bound = (text: string | undefined, op: "gte" | "lte"): DataFilter[] => {
        const number = filled(text) ? Number(text) : Number.NaN
        return Number.isFinite(number) ? [{ property: name, op, value: number }] : []
      }
      return [...bound(draft.from, "gte"), ...bound(draft.to, "lte")]
    }
    case "date":
      return [
        ...(filled(draft.from) ? [{ property: name, op: "gte" as const, value: draft.from }] : []),
        ...(filled(draft.to) ? [{ property: name, op: "lte" as const, value: draft.to }] : []),
      ]
    case "boolean":
      return filled(draft.value)
        ? [{ property: name, op: "eq", value: draft.value === "true" }]
        : []
    case "referenceList":
    case "reference":
      return filled(draft.value) ? [{ property: name, op: "eq", value: draft.value }] : []
  }
}

/** How many properties have a filter that does something. */
export function activeFilters(view: TableView, properties: readonly PropertyDefinition[]): number {
  return properties.filter(
    (property) => filtersFor(property, view.filters[property.name] ?? {}).length > 0,
  ).length
}

/** The list query (ADR 0011) a view asks for. */
export function queryFor(
  view: TableView,
  shown: readonly PropertyDefinition[],
  pageSize: number,
  options: { search: boolean; filters: boolean },
): DataQuery {
  const filter = options.filters
    ? shown.flatMap((property) => filtersFor(property, view.filters[property.name] ?? {}))
    : []
  const search = options.search ? view.search.trim() : ""
  return {
    select: shown.map((property) => property.name),
    ...(filter.length > 0 ? { filter } : {}),
    ...(search === "" ? {} : { search }),
    ...(view.sort ? { sort: [view.sort] } : {}),
    page: view.page,
    pageSize,
  }
}

/** "1–10 of 50", or what to say when there is nothing. */
export function pageStatus(page: number, pageSize: number, shown: number, total: number): string {
  if (total === 0) return "No rows"
  if (shown === 0) return `No rows on this page; ${total} in all`
  const first = (page - 1) * pageSize + 1
  return `${first}–${first + shown - 1} of ${total}`
}

/**
 * What each table was last asked to show, by instance id, for as long as the
 * page is open: coming back from a row finds the list as it was left.
 */
const remembered = new Map<string, TableView>()

export const recallView = (instance: string): TableView => remembered.get(instance) ?? INITIAL_VIEW
export const rememberView = (instance: string, view: TableView) => remembered.set(instance, view)
/** Forgets every table's view: for tests, which reuse instance ids. */
export const forgetViews = () => remembered.clear()
