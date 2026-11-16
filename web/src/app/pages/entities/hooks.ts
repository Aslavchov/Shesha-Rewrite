import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { DATA_KEYS, useDataClient } from "@/data/client"
import { registry } from "@/forms/registry"
import type { EntityRecord, ReferenceListRecord } from "@/generated"

import { formsUsing } from "./usage"

/**
 * Writes to the definitions that keep every reader on the page in step: the
 * stored record replaces the cached one at once, and rows are read again.
 */
export function useDefinitionCache() {
  const queries = useQueryClient()
  return React.useMemo(
    () => ({
      entity(record: EntityRecord) {
        queries.setQueryData<Map<string, EntityRecord>>(DATA_KEYS.entities, (current) =>
          new Map(current).set(record.name, record),
        )
        void queries.invalidateQueries({ queryKey: DATA_KEYS.rows(record.name) })
      },
      list(record: ReferenceListRecord) {
        queries.setQueryData<Map<string, ReferenceListRecord>>(DATA_KEYS.lists, (current) =>
          new Map(current).set(record.name, record),
        )
      },
      /** Something was deleted, or may be out of date: read everything again. */
      refresh: () => queries.invalidateQueries({ queryKey: DATA_KEYS.all }),
    }),
    [queries],
  )
}

/**
 * The names of the forms that use an entity or one of its properties, read
 * when a delete is about to be confirmed. Undefined until they are known.
 */
export function useFormsUsing(
  enabled: boolean,
  entity: string,
  property?: string,
): { names: string[] | undefined; failed: boolean } {
  const { api, queries } = useDataClient()
  const forms = useQuery(
    {
      queryKey: ["entities", "usage-forms"],
      queryFn: async ({ signal }) => {
        const list = await api.forms(signal)
        return Promise.all(list.forms.map((form) => api.form(form.id, signal)))
      },
      enabled,
      staleTime: 0,
      gcTime: 0,
    },
    queries,
  )
  const names = React.useMemo(
    () => (forms.data ? formsUsing(forms.data, registry, entity, property) : undefined),
    [forms.data, entity, property],
  )
  return { names, failed: forms.isError }
}
