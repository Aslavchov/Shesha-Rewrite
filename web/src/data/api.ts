import type {
  DataPage,
  DataQuery,
  DataRow,
  DataValues,
  EntityDefinition,
  EntityList,
  EntityRecord,
  FormList,
  FormRecord,
  ReferenceListDefinition,
  ReferenceListList,
  ReferenceListRecord,
} from "@/generated"
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api"

/**
 * The entity, reference list and data API (ADR 0011), as plain functions.
 * Everything that reads or writes definitions or rows goes through a
 * `DataApi`, so a test can hand components one of its own.
 */

const part = encodeURIComponent
const entityUrl = (name: string) => `/api/entities/${part(name)}`
const listUrl = (name: string) => `/api/reference-lists/${part(name)}`
const rowsUrl = (entity: string) => `/api/data/${part(entity)}`
const rowUrl = (entity: string, id: string) => `${rowsUrl(entity)}/${part(id)}`

export type DataApi = {
  readonly entities: (signal?: AbortSignal) => Promise<EntityList>
  readonly createEntity: (definition: EntityDefinition) => Promise<EntityRecord>
  readonly updateEntity: (
    revision: number,
    definition: EntityDefinition,
    fill?: DataValues,
  ) => Promise<EntityRecord>
  readonly deleteEntity: (name: string) => Promise<void>

  readonly referenceLists: (signal?: AbortSignal) => Promise<ReferenceListList>
  readonly createReferenceList: (
    definition: ReferenceListDefinition,
  ) => Promise<ReferenceListRecord>
  readonly updateReferenceList: (
    revision: number,
    definition: ReferenceListDefinition,
  ) => Promise<ReferenceListRecord>
  readonly deleteReferenceList: (name: string) => Promise<void>

  /** Every form, for settings that name one. */
  readonly forms: (signal?: AbortSignal) => Promise<FormList>
  readonly form: (id: string, signal?: AbortSignal) => Promise<FormRecord>

  /** One page of rows: the one list query format. */
  readonly query: (entity: string, query: DataQuery, signal?: AbortSignal) => Promise<DataPage>
  readonly row: (entity: string, id: string, signal?: AbortSignal) => Promise<DataRow>
  readonly createRow: (entity: string, values: DataValues) => Promise<DataRow>
  /** Changes the properties given; the rest keep their values. */
  readonly updateRow: (
    entity: string,
    id: string,
    revision: number,
    values: DataValues,
  ) => Promise<DataRow>
  readonly deleteRow: (entity: string, id: string) => Promise<void>
}

/** The API of the server this page came from. */
export const serverApi: DataApi = {
  entities: (signal) => apiGet("/api/entities", signal),
  createEntity: (definition) => apiPost("/api/entities", { definition }),
  updateEntity: (revision, definition, fill) =>
    apiPut(entityUrl(definition.name), { revision, definition, ...(fill ? { fill } : {}) }),
  deleteEntity: (name) => apiDelete(entityUrl(name)),

  referenceLists: (signal) => apiGet("/api/reference-lists", signal),
  createReferenceList: (definition) => apiPost("/api/reference-lists", { definition }),
  updateReferenceList: (revision, definition) =>
    apiPut(listUrl(definition.name), { revision, definition }),
  deleteReferenceList: (name) => apiDelete(listUrl(name)),

  forms: (signal) => apiGet("/api/forms", signal),
  form: (id, signal) => apiGet(`/api/forms/${part(id)}`, signal),

  query: (entity, query, signal) => apiPost(`${rowsUrl(entity)}/query`, query, signal),
  row: (entity, id, signal) => apiGet(rowUrl(entity, id), signal),
  createRow: (entity, values) => apiPost(rowsUrl(entity), { values }),
  updateRow: (entity, id, revision, values) => apiPatch(rowUrl(entity, id), { revision, values }),
  deleteRow: (entity, id) => apiDelete(rowUrl(entity, id)),
}

/** Error codes of the data API that the app reacts to by name. */
export const REVISION_CONFLICT = "revision_conflict"
export const INVALID_ROW = "invalid_row"
export const ROW_NOT_FOUND = "row_not_found"
export const ENTITY_NOT_FOUND = "entity_not_found"
