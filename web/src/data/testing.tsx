import type * as React from "react"

import type {
  DataPage,
  DataQuery,
  DataRow,
  DataValues,
  EntityDefinition,
  EntityRecord,
  FormRecord,
  ReferenceListDefinition,
} from "@/generated"
import { ApiRequestError } from "@/lib/api"

import type { DataApi } from "./api"
import { IsolatedDataProvider } from "./provider"

/**
 * A data API in memory, for unit tests: the definitions given, and rows that
 * a query reads with the server's own rules in miniature (search over text
 * and the display values, eq/in filters, one sort key, paging). Test-only.
 */

export const STATUS: ReferenceListDefinition = {
  name: "status",
  displayName: "Status",
  items: [
    { value: "active", label: "Active", color: "success" },
    { value: "pending", label: "Pending", color: "warning", retired: true },
    { value: "inactive", label: "Inactive", color: "muted" },
  ],
}

export const COMPANY: EntityDefinition = {
  name: "company",
  displayName: "Company",
  properties: [{ name: "name", displayName: "Name", type: "text", required: true }],
  displayProperty: "name",
}

export const PERSON: EntityDefinition = {
  name: "person",
  displayName: "Person",
  properties: [
    { name: "surname", displayName: "Surname", type: "text", required: true, maxLength: 50 },
    { name: "born", displayName: "Born", type: "date" },
    { name: "status", displayName: "Status", type: "referenceList", referenceList: "status" },
    { name: "company", displayName: "Company", type: "reference", entity: "company" },
    { name: "notes", displayName: "Notes", type: "text", multiline: true },
  ],
  displayProperty: "surname",
  defaultForm: "person-form",
}

type Stored = { entity: string; id: string; revision: number; values: DataValues }

export type FakeApi = DataApi & {
  readonly rows: Stored[]
  readonly queries: { entity: string; query: DataQuery }[]
}

export function fakeApi({
  entities = [PERSON, COMPANY],
  lists = [STATUS],
  rows = [],
  forms = [],
}: {
  entities?: EntityDefinition[]
  lists?: ReferenceListDefinition[]
  rows?: Omit<Stored, "revision">[]
  forms?: FormRecord[]
} = {}): FakeApi {
  const stored: Stored[] = rows.map((row) => ({ ...row, revision: 1 }))
  const queries: FakeApi["queries"] = []
  const definition = (name: string) => {
    const found = entities.find((entity) => entity.name === name)
    if (!found) throw new ApiRequestError("entity_not_found", `No entity ${name}.`, 404)
    return found
  }
  const display = (row: Stored): string => {
    const property = definition(row.entity).displayProperty
    const value = property ? row.values[property] : null
    return typeof value === "string" ? value : row.id
  }
  const toRow = (row: Stored, select?: string[]): DataRow => {
    const entity = definition(row.entity)
    const names = select ?? entity.properties.map((property) => property.name)
    const values: DataValues = {}
    const references: Record<string, string> = {}
    for (const name of names) {
      values[name] = row.values[name] ?? null
      const property = entity.properties.find((candidate) => candidate.name === name)
      const id = row.values[name]
      if (property?.type === "reference" && typeof id === "string") {
        const target = stored.find((other) => other.entity === property.entity && other.id === id)
        if (target) references[name] = display(target)
      }
    }
    return {
      id: row.id,
      revision: row.revision,
      createdAt: "2026-11-16T00:00:00.000Z",
      updatedAt: "2026-11-16T00:00:00.000Z",
      display: display(row),
      values,
      references,
    }
  }
  const record = (entity: EntityDefinition): EntityRecord => ({
    name: entity.name,
    revision: 1,
    updatedAt: "2026-11-16T00:00:00.000Z",
    rows: stored.filter((row) => row.entity === entity.name).length,
    definition: entity,
  })
  const find = (entity: string, id: string) => {
    const row = stored.find((candidate) => candidate.entity === entity && candidate.id === id)
    if (!row) throw new ApiRequestError("row_not_found", `No row ${id}.`, 404)
    return row
  }

  return {
    rows: stored,
    queries,
    entities: async () => ({ entities: entities.map(record) }),
    createEntity: async (entity) => record(entity),
    updateEntity: async (_revision, entity) => record(entity),
    deleteEntity: async () => {},
    referenceLists: async () => ({
      referenceLists: lists.map((list) => ({
        name: list.name,
        revision: 1,
        updatedAt: "2026-11-16T00:00:00.000Z",
        definition: list,
      })),
    }),
    createReferenceList: async (list) => ({
      name: list.name,
      revision: 1,
      updatedAt: "",
      definition: list,
    }),
    updateReferenceList: async (_revision, list) => ({
      name: list.name,
      revision: 2,
      updatedAt: "",
      definition: list,
    }),
    deleteReferenceList: async () => {},
    forms: async () => ({
      forms: forms.map((form) => ({
        id: form.id,
        name: form.document.name,
        description: form.document.description ?? "",
        updatedAt: form.updatedAt,
        revision: form.revision,
      })),
    }),
    form: async (id) => {
      const form = forms.find((candidate) => candidate.id === id)
      if (!form) throw new ApiRequestError("form_not_found", "No form.", 404)
      return form
    },
    query: async (entity, query): Promise<DataPage> => {
      queries.push({ entity, query })
      let matching = stored.filter((row) => row.entity === entity)
      const search = query.search?.toLowerCase()
      if (search) {
        matching = matching.filter((row) => {
          const shown = toRow(row)
          return [...Object.values(shown.values), ...Object.values(shown.references), shown.display]
            .filter((value) => typeof value === "string")
            .some((value) => value.toLowerCase().includes(search))
        })
      }
      for (const filter of query.filter ?? []) {
        const wanted = Array.isArray(filter.value) ? filter.value : [filter.value]
        matching = matching.filter((row) => wanted.includes(row.values[filter.property] as never))
      }
      const [sort] = query.sort ?? []
      if (sort) {
        matching = [...matching].sort((a, b) => {
          const order = String(a.values[sort.property] ?? "").localeCompare(
            String(b.values[sort.property] ?? ""),
          )
          return sort.direction === "desc" ? -order : order
        })
      }
      const page = query.page ?? 1
      const pageSize = query.pageSize ?? 25
      return {
        rows: matching
          .slice((page - 1) * pageSize, page * pageSize)
          .map((row) => toRow(row, query.select)),
        page,
        pageSize,
        total: matching.length,
      }
    },
    row: async (entity, id) => toRow(find(entity, id)),
    createRow: async (entity, values) => {
      const row: Stored = { entity, id: `new-${stored.length + 1}`, revision: 1, values }
      stored.push(row)
      return toRow(row)
    },
    updateRow: async (entity, id, revision, values) => {
      const row = find(entity, id)
      if (row.revision !== revision) {
        throw new ApiRequestError("revision_conflict", "Changed elsewhere.", 409)
      }
      Object.assign(row.values, values)
      row.revision += 1
      return toRow(row)
    },
    deleteRow: async (entity, id) => {
      const index = stored.indexOf(find(entity, id))
      stored.splice(index, 1)
    },
  }
}

/** A wrapper for `render` that provides this API with a cache of its own. */
export function withData(api: DataApi) {
  return function DataWrapper({ children }: { children: React.ReactNode }) {
    return <IsolatedDataProvider api={api}>{children}</IsolatedDataProvider>
  }
}
