import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  FilterIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { DATA_KEYS, useCatalog, useDataClient, useRows } from "@/data/client"
import { useRowNavigation } from "@/data/navigation"
import { formatDate } from "@/data/properties"
import type { DataRow, EntityDefinition, PropertyDefinition } from "@/generated"

import { ItemTag } from "../../parts/reference-list"
import type { StaticProps } from "../../runtime"
import { Filters } from "./filters"
import type { settings, Slot } from "./settings"
import {
  activeFilters,
  nextSort,
  pageStatus,
  queryFor,
  recallView,
  rememberView,
  type TableView,
} from "./view"

const SEARCH_DELAY = 250

type Column = { readonly property: PropertyDefinition; readonly header: string }

/**
 * The rows of an entity (spec section 6). Paging, sorting, search and
 * filters all run on the server: the table only says what it wants to see.
 */
export function DataTable({
  instance,
  settings: config,
  slots,
}: StaticProps<typeof settings, Slot>) {
  const catalog = useCatalog()
  const entity = catalog.entity(config.entity)

  if (config.entity === null) {
    return (
      <Notice name={instance.name} slots={slots}>
        This table has no entity yet. Choose one in its properties.
      </Notice>
    )
  }
  if (!entity) {
    return catalog.status === "ready" ? (
      <Notice name={instance.name} slots={slots}>
        There is no entity named {config.entity}. Choose another in the table&rsquo;s properties.
      </Notice>
    ) : catalog.status === "error" ? (
      <Notice name={instance.name} slots={slots} onRetry={catalog.refetch}>
        The table could not be loaded. Check that the app is still running, then retry.
      </Notice>
    ) : (
      <div aria-busy="true" {...slots.root} data-testid={`table-${instance.name}`}>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  // Another entity is another table: its view and its drafts start afresh.
  return (
    <Table key={entity.name} instance={instance} config={config} slots={slots} entity={entity} />
  )
}

function Notice({
  name,
  slots,
  onRetry,
  children,
}: {
  name: string
  slots: StaticProps<typeof settings, Slot>["slots"]
  onRetry?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-input bg-muted/50 p-4 text-sm text-muted-foreground"
      {...slots.root}
      // The spec's own test id for a table, in place of the usual `field-<name>`.
      data-testid={`table-${name}`}
    >
      <p className="min-w-0 flex-1">{children}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" data-testid="table-error-retry" onClick={onRetry}>
          <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
          Retry
        </Button>
      ) : null}
    </div>
  )
}

function Table({
  instance,
  config,
  slots,
  entity,
}: {
  instance: StaticProps<typeof settings, Slot>["instance"]
  config: StaticProps<typeof settings, Slot>["settings"]
  slots: StaticProps<typeof settings, Slot>["slots"]
  entity: EntityDefinition
}) {
  const catalog = useCatalog()
  const { api, queries } = useDataClient()
  const navigation = useRowNavigation()
  const uid = React.useId()

  const columns = React.useMemo<Column[]>(() => {
    const chosen =
      config.columns.length > 0
        ? config.columns
        : entity.properties.map((property) => ({ property: property.name, header: undefined }))
    return chosen.flatMap((column) => {
      const property = entity.properties.find((candidate) => candidate.name === column.property)
      return property ? [{ property, header: column.header || property.displayName }] : []
    })
  }, [config.columns, entity])
  const shown = React.useMemo(() => columns.map((column) => column.property), [columns])

  const [view, setViewState] = React.useState<TableView>(() => recallView(instance.id))
  /** What was just done, said with the result once the rows have arrived. */
  const [saying, setSaying] = React.useState({ text: "", count: 0 })
  const say = (text: string) => setSaying((current) => ({ text, count: current.count + 1 }))
  /** Changes the view from what it is now, and remembers it for this table. */
  const changeView = (change: (current: TableView) => TableView, said: string) => {
    setViewState((current) => {
      const next = change(current)
      rememberView(instance.id, next)
      return next
    })
    say(said)
  }
  // What is typed is searched for a moment after the last keystroke.
  const [searchText, setSearchText] = React.useState(view.search)
  const searchTimer = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(searchTimer.current), [])
  const typeSearch = (text: string) => {
    setSearchText(text)
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => {
      changeView((current) => ({ ...current, search: text.trim(), page: 1 }), "Searched")
    }, SEARCH_DELAY)
  }

  const [filtersOpen, setFiltersOpen] = React.useState(() => activeFilters(view, shown) > 0)
  const query = React.useMemo(
    () =>
      queryFor(view, shown, config.pageSize, { search: config.search, filters: config.filters }),
    [view, shown, config.pageSize, config.search, config.filters],
  )
  const rows = useRows(entity.name, query)
  const page = rows.data
  const total = page?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / config.pageSize))
  const status =
    page === undefined ? "" : pageStatus(page.page, page.pageSize, page.rows.length, page.total)

  const announcement =
    saying.text === "" || rows.isFetching || rows.isError || page === undefined
      ? ""
      : `${saying.text}. ${status}.`

  const formId = config.form ?? entity.defaultForm ?? null
  const canOpen = navigation !== null && formId !== null
  const open = (rowId: string | null) => {
    if (navigation && formId !== null) navigation.open(formId, rowId)
  }

  const regionRef = React.useRef<HTMLElement>(null)
  const [deleting, setDeleting] = React.useState<DataRow | null>(null)
  const [deleteState, setDeleteState] = React.useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  })
  const confirmDelete = () => {
    if (!deleting) return
    setDeleteState({ busy: true, error: null })
    api.deleteRow(entity.name, deleting.id).then(
      () => {
        // The last row of a page takes the page with it: step back to the one before.
        const emptied = page?.rows.length === 1 && view.page > 1
        changeView(
          (current) => (emptied ? { ...current, page: current.page - 1 } : current),
          `Deleted ${deleting.display}`,
        )
        setDeleting(null)
        setDeleteState({ busy: false, error: null })
        void queries.invalidateQueries({ queryKey: DATA_KEYS.rows(entity.name) })
        // The row's button is gone with the row: focus goes to the table.
        regionRef.current?.focus()
      },
      (error: unknown) => {
        setDeleteState({
          busy: false,
          error: error instanceof Error ? error.message : "The row could not be deleted.",
        })
      },
    )
  }

  const filterCount = activeFilters(view, shown)
  const hasCriteria = view.search !== "" || filterCount > 0
  const clear = () => {
    window.clearTimeout(searchTimer.current)
    setSearchText("")
    changeView(
      (current) => ({ ...current, search: "", filters: {}, page: 1 }),
      "Cleared the search and the filters",
    )
  }
  const label = entity.displayName

  return (
    <div
      className="flex max-w-full min-w-0 flex-col gap-3"
      {...slots.root}
      data-testid={`table-${instance.name}`}
    >
      {config.search || config.filters || (config.allowNew && canOpen) ? (
        <div className="flex flex-wrap items-center gap-2" {...slots.toolbar}>
          {config.search ? (
            <div className="relative min-w-40 flex-1 sm:max-w-xs">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                data-testid="table-search"
                aria-label={`Search ${label}`}
                placeholder="Search"
                value={searchText}
                className="pl-8"
                onChange={(event) => typeSearch(event.target.value)}
              />
            </div>
          ) : null}
          {config.filters ? (
            <Button
              variant="outline"
              data-testid="table-filters"
              aria-expanded={filtersOpen}
              aria-controls={`${uid}-filters`}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <FilterIcon aria-hidden="true" data-icon="inline-start" />
              Filters
              {filterCount > 0 ? (
                <span
                  data-testid="table-filters-count"
                  className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums"
                >
                  {filterCount}
                  <span className="sr-only"> active</span>
                </span>
              ) : null}
            </Button>
          ) : null}
          {config.allowNew && canOpen ? (
            <Button data-testid="table-new" className="ml-auto" onClick={() => open(null)}>
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              New
            </Button>
          ) : null}
        </div>
      ) : null}

      {config.filters && filtersOpen ? (
        <Filters
          id={`${uid}-filters`}
          properties={shown}
          headers={columns}
          drafts={view.filters}
          lists={catalog}
          onChange={(filters) =>
            changeView((current) => ({ ...current, filters, page: 1 }), "Filtered")
          }
          onClear={
            filterCount > 0
              ? () =>
                  changeView(
                    (current) => ({ ...current, filters: {}, page: 1 }),
                    "Cleared the filters",
                  )
              : undefined
          }
        />
      ) : null}

      {rows.isError && page === undefined ? (
        <div
          role="alert"
          data-testid="table-error"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm"
        >
          <p className="min-w-0 flex-1 text-foreground">
            The rows could not be loaded. {rows.error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            data-testid="table-error-retry"
            onClick={() => void rows.refetch()}
          >
            <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
            Retry
          </Button>
        </div>
      ) : (
        <section
          ref={regionRef}
          aria-label={`${label} rows`}
          aria-busy={rows.isFetching}
          // Scrolls sideways inside itself at narrow widths, so it must be reachable by keyboard.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          data-testid="table-scroll"
          // Positioned, so that text hidden for the eye inside it (sr-only) scrolls
          // with it instead of widening the page.
          className="relative max-w-full min-w-0 overflow-x-auto rounded-lg border bg-card -outline-offset-2"
        >
          <table className="w-full border-collapse text-left text-sm" {...slots.table}>
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground" {...slots.header}>
                {columns.map(({ property, header }) => {
                  const direction =
                    view.sort?.property === property.name ? view.sort.direction : null
                  const Icon =
                    direction === "asc"
                      ? ArrowUpIcon
                      : direction === "desc"
                        ? ArrowDownIcon
                        : ChevronsUpDownIcon
                  return (
                    <th
                      key={property.name}
                      scope="col"
                      aria-sort={
                        direction === "asc"
                          ? "ascending"
                          : direction === "desc"
                            ? "descending"
                            : "none"
                      }
                      className="h-9 px-1 font-medium whitespace-nowrap"
                    >
                      <button
                        type="button"
                        data-testid={`table-sort-${property.name}`}
                        className="flex h-7 items-center gap-1 rounded-md px-2 transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() => {
                          const sort = nextSort(view, property.name)
                          changeView(
                            (current) => ({ ...current, sort, page: 1 }),
                            sort === null
                              ? "Sorting removed"
                              : `Sorted by ${header}, ${sort.direction === "asc" ? "ascending" : "descending"}`,
                          )
                        }}
                      >
                        {header}
                        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                      </button>
                    </th>
                  )
                })}
                {config.allowDelete ? (
                  <th scope="col" className="w-10 px-3">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {page === undefined
                ? Array.from({ length: Math.min(config.pageSize, 5) }, (_, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      <td
                        colSpan={columns.length + (config.allowDelete ? 1 : 0)}
                        className="px-3 py-2.5"
                      >
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                : page.rows.map((row) => (
                    <tr
                      key={row.id}
                      data-testid={`table-row-${row.id}`}
                      className={
                        canOpen
                          ? "cursor-pointer border-b transition-colors last:border-b-0 hover:bg-muted/50"
                          : "border-b last:border-b-0"
                      }
                      onClick={(event) => {
                        // A press on the row's own link or button is theirs.
                        if (event.target instanceof Element && event.target.closest("a, button")) {
                          return
                        }
                        open(row.id)
                      }}
                      {...slots.row}
                    >
                      {columns.map(({ property }, index) => (
                        <td
                          key={property.name}
                          data-column={property.name}
                          className={
                            property.type === "number"
                              ? "max-w-80 truncate px-3 py-2 text-right whitespace-nowrap tabular-nums"
                              : "max-w-80 truncate px-3 py-2 whitespace-nowrap"
                          }
                        >
                          {index === 0 && canOpen && formId !== null ? (
                            <a
                              href={navigation.href(formId, row.id)}
                              data-testid={`table-open-${row.id}`}
                              className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline"
                              onClick={(event) => {
                                // A plain click stays in the app; a modified one opens a tab.
                                if (event.metaKey || event.ctrlKey || event.shiftKey) return
                                event.preventDefault()
                                open(row.id)
                              }}
                            >
                              <Cell property={property} row={row} catalog={catalog} link />
                            </a>
                          ) : (
                            <Cell property={property} row={row} catalog={catalog} />
                          )}
                        </td>
                      ))}
                      {config.allowDelete ? (
                        <td className="px-2 py-1 text-right">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            data-testid={`table-delete-${row.id}`}
                            aria-label={`Delete ${row.display}`}
                            onClick={() => {
                              setDeleteState({ busy: false, error: null })
                              setDeleting(row)
                            }}
                          >
                            <Trash2Icon aria-hidden="true" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
            </tbody>
          </table>
          {page !== undefined && page.rows.length === 0 ? (
            <div
              data-testid="table-empty"
              className="flex flex-col items-center gap-2 px-4 py-8 text-center"
            >
              <p className="font-medium text-foreground">
                {hasCriteria ? "Nothing matches" : `No ${label.toLowerCase()} rows yet`}
              </p>
              <p className="text-muted-foreground">
                {hasCriteria
                  ? "No row fits the search and the filters."
                  : config.allowNew && canOpen
                    ? "Press New to add the first one."
                    : "Rows appear here once they are added."}
              </p>
              {hasCriteria ? (
                <Button variant="outline" size="sm" data-testid="table-clear" onClick={clear}>
                  Clear the search and the filters
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2" {...slots.pagination}>
        <p data-testid="table-page-status" className="text-sm text-muted-foreground tabular-nums">
          {rows.isError && page !== undefined
            ? "These rows may be out of date: the last request failed."
            : status === ""
              ? "Loading…"
              : status}
        </p>
        <nav aria-label={`${label} pages`} className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-testid="table-page-prev"
            aria-disabled={view.page <= 1 || undefined}
            onClick={() => {
              if (view.page <= 1) return
              changeView(
                (current) => ({ ...current, page: current.page - 1 }),
                `Page ${view.page - 1} of ${pages}`,
              )
            }}
          >
            <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="table-page-next"
            aria-disabled={view.page >= pages || undefined}
            onClick={() => {
              if (view.page >= pages) return
              changeView(
                (current) => ({ ...current, page: current.page + 1 }),
                `Page ${view.page + 1} of ${pages}`,
              )
            }}
          >
            Next
            <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
        </nav>
      </div>

      {/* oxlint-disable-next-line jsx-a11y/no-redundant-roles */}
      <output role="status" data-testid="table-live" className="sr-only">
        <span key={saying.count}>{announcement}</span>
      </output>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.display ?? "this row"}?`}
        confirmLabel="Delete"
        isBusy={deleteState.busy}
        error={deleteState.error}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      >
        <p>This {label.toLowerCase()} is removed for good. It cannot be undone.</p>
      </ConfirmDialog>
    </div>
  )
}

/** One value as a person reads it. */
function Cell({
  property,
  row,
  catalog,
  link = false,
}: {
  property: PropertyDefinition
  row: DataRow
  catalog: ReturnType<typeof useCatalog>
  link?: boolean
}) {
  const value = row.values[property.name]
  if (value === null || value === undefined || value === "") {
    // A link needs something to press: the row's own name stands in.
    if (link) return <>{row.display}</>
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">—</span>
        <span className="sr-only">No value</span>
      </span>
    )
  }
  switch (property.type) {
    case "boolean":
      return <>{value === true ? "Yes" : "No"}</>
    case "date":
      return <>{typeof value === "string" ? formatDate(value) : String(value)}</>
    case "referenceList":
      return (
        <ItemTag items={catalog.list(property.referenceList)?.items ?? []} value={String(value)} />
      )
    case "reference":
      return <>{row.references[property.name] ?? String(value)}</>
    case "text":
      // Only the first line: a row is one line high.
      return <>{String(value).split("\n", 1)[0]}</>
    case "number":
      return <>{String(value)}</>
  }
}
