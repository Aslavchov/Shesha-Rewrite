import * as React from "react"
import { QueryClient, useQuery } from "@tanstack/react-query"

import type {
  DataQuery,
  EntityDefinition,
  EntityRecord,
  ReferenceListDefinition,
  ReferenceListRecord,
} from "@/generated"

import { type DataApi, serverApi } from "./api"

/**
 * Where components get definitions and rows from. The app provides the
 * server's API and its own query cache; a test provides fakes. With no
 * provider at all (a component rendered by itself) the server's API and a
 * cache of this module's own are used, so nothing ever fails for want of one.
 */
export type DataClient = { readonly api: DataApi; readonly queries: QueryClient }

let fallback: DataClient | null = null

function fallbackClient(): DataClient {
  fallback ??= {
    api: serverApi,
    queries: new QueryClient({
      defaultOptions: { queries: { networkMode: "always", retry: false } },
    }),
  }
  return fallback
}

export const DataContext = React.createContext<DataClient | null>(null)

export function useDataClient(): DataClient {
  return React.useContext(DataContext) ?? fallbackClient()
}

export const DATA_KEYS = {
  all: ["data"] as const,
  entities: ["data", "definitions", "entities"] as const,
  lists: ["data", "definitions", "lists"] as const,
  forms: ["data", "forms"] as const,
  definitions: ["data", "definitions"] as const,
  rows: (entity: string) => ["data", "rows", entity] as const,
  page: (entity: string, query: DataQuery) => ["data", "rows", entity, "page", query] as const,
  row: (entity: string, id: string) => ["data", "rows", entity, "row", id] as const,
}

/**
 * Every entity and reference list definition, by name. `status` says whether
 * they are known yet: a component shows nothing misleading while it is
 * "loading", and says so when it is "error".
 */
export type Catalog = {
  readonly status: "loading" | "ready" | "error"
  readonly entities: ReadonlyMap<string, EntityRecord>
  readonly lists: ReadonlyMap<string, ReferenceListRecord>
  readonly entity: (name: string | null | undefined) => EntityDefinition | undefined
  readonly list: (name: string | null | undefined) => ReferenceListDefinition | undefined
  readonly refetch: () => void
}

const NO_ENTITIES: ReadonlyMap<string, EntityRecord> = new Map()
const NO_LISTS: ReadonlyMap<string, ReferenceListRecord> = new Map()

/**
 * The definitions, read once and shared by everything on the page. With
 * `enabled` false nothing is read: what is already known is used.
 */
export function useCatalog(enabled = true): Catalog {
  const { api, queries } = useDataClient()
  const entities = useQuery(
    {
      queryKey: DATA_KEYS.entities,
      queryFn: async ({ signal }) =>
        new Map((await api.entities(signal)).entities.map((record) => [record.name, record])),
      staleTime: 30_000,
      enabled,
    },
    queries,
  )
  const lists = useQuery(
    {
      queryKey: DATA_KEYS.lists,
      queryFn: async ({ signal }) =>
        new Map(
          (await api.referenceLists(signal)).referenceLists.map((record) => [record.name, record]),
        ),
      staleTime: 30_000,
      enabled,
    },
    queries,
  )

  const entityMap = entities.data ?? NO_ENTITIES
  const listMap = lists.data ?? NO_LISTS
  const status =
    entities.data && lists.data ? "ready" : entities.isError || lists.isError ? "error" : "loading"
  const refetchEntities = entities.refetch
  const refetchLists = lists.refetch
  return React.useMemo(
    () => ({
      status,
      entities: entityMap,
      lists: listMap,
      entity: (name) => (name ? entityMap.get(name)?.definition : undefined),
      list: (name) => (name ? listMap.get(name)?.definition : undefined),
      refetch: () => {
        void refetchEntities()
        void refetchLists()
      },
    }),
    [status, entityMap, listMap, refetchEntities, refetchLists],
  )
}

/** One page of rows. The page before stays on screen while the next one loads. */
export function useRows(entity: string | null, query: DataQuery) {
  const { api, queries } = useDataClient()
  return useQuery(
    {
      queryKey: DATA_KEYS.page(entity ?? "", query),
      queryFn: ({ signal }) => api.query(entity ?? "", query, signal),
      enabled: entity !== null,
      placeholderData: (previous) => previous,
    },
    queries,
  )
}

/** One row, by id. */
export function useRow(entity: string | null, id: string | null) {
  const { api, queries } = useDataClient()
  return useQuery(
    {
      queryKey: DATA_KEYS.row(entity ?? "", id ?? ""),
      queryFn: ({ signal }) => api.row(entity ?? "", id ?? "", signal),
      enabled: entity !== null && id !== null,
    },
    queries,
  )
}

/** Every form's id and name, for a setting that names a form. */
export function useFormChoices(enabled = true) {
  const { api, queries } = useDataClient()
  return useQuery(
    {
      queryKey: DATA_KEYS.forms,
      queryFn: async ({ signal }) =>
        (await api.forms(signal)).forms
          .map((form) => ({ value: form.id, label: form.name }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      enabled,
    },
    queries,
  )
}

/** The display value of a row, for showing a stored reference. Null until it is known. */
export function useRowDisplay(entity: string | null, id: string | null): string | null {
  const catalog = useCatalog()
  const row = useRow(catalog.entity(entity) ? entity : null, id)
  if (id === null) return null
  return row.data?.display ?? (row.isError ? id : null)
}
