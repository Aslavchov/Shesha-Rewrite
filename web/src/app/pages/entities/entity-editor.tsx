import * as React from "react"
import { LockIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCatalog, useDataClient, useFormChoices } from "@/data/client"
import { PROPERTY_TYPES } from "@/data/properties"
import type { EntityDefinition, EntityRecord, PropertyDefinition } from "@/generated"

import { nameProblem, toName, withArticle } from "./names"
import { useDefinitionCache, useFormsUsing } from "./hooks"
import { ChoiceSelect, SaveError, UsedBy } from "./parts"
import { PropertyDialog } from "./property-dialog"

/**
 * One entity (spec 3.1): its own settings, saved with Save, and its
 * properties, each added and edited in a dialog of its own. With no record,
 * a new entity being named.
 */
export function EntityEditor({
  record,
  onCreated,
  onDeleted,
  justCreated = false,
}: {
  record: EntityRecord | null
  onCreated: (name: string) => void
  onDeleted: () => void
  /** The editor opens on what was just created here: it says so. */
  justCreated?: boolean
}) {
  const catalog = useCatalog()
  const { api } = useDataClient()
  const cache = useDefinitionCache()
  const forms = useFormChoices()
  const id = React.useId()

  const stored = record?.definition
  const [displayName, setDisplayName] = React.useState(stored?.displayName ?? "")
  const [name, setName] = React.useState(stored?.name ?? "")
  const [nameTyped, setNameTyped] = React.useState(false)
  const [displayProperty, setDisplayProperty] = React.useState(stored?.displayProperty ?? null)
  const [defaultForm, setDefaultForm] = React.useState(stored?.defaultForm ?? null)
  const [wasSubmitted, setWasSubmitted] = React.useState(false)
  const [state, setState] = React.useState<{ busy: boolean; error: unknown; saved: boolean }>({
    busy: false,
    error: null,
    saved: justCreated,
  })
  /** The property being edited, "new" for one being added, or null. */
  const [editing, setEditing] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const usage = useFormsUsing(isDeleting, record?.name ?? "")

  const isNew = record === null
  const displayError = displayName.trim() === "" ? "Give the entity a display name." : null
  const nameError = isNew ? nameProblem(name, [...catalog.entities.keys()]) : null
  const isDirty =
    isNew ||
    displayName.trim() !== stored?.displayName ||
    displayProperty !== (stored?.displayProperty ?? null) ||
    defaultForm !== (stored?.defaultForm ?? null)

  // A new entity starts at its display name, where its name is made from.
  React.useEffect(() => {
    if (isNew) document.getElementById(`${id}-display`)?.focus()
  }, [isNew, id])

  const save = () => {
    setWasSubmitted(true)
    if (displayError || nameError) {
      document.getElementById(displayError ? `${id}-display` : `${id}-name`)?.focus()
      return
    }
    const definition: EntityDefinition = {
      name,
      displayName: displayName.trim(),
      properties: stored?.properties ?? [],
      ...(displayProperty === null ? {} : { displayProperty }),
      ...(defaultForm === null ? {} : { defaultForm }),
    }
    setState({ busy: true, error: null, saved: false })
    const request = record
      ? api.updateEntity(record.revision, definition)
      : api.createEntity(definition)
    request.then(
      (saved) => {
        cache.entity(saved)
        setState({ busy: false, error: null, saved: true })
        if (!record) onCreated(saved.name)
      },
      (error: unknown) => setState({ busy: false, error, saved: false }),
    )
  }

  const textProperties = (stored?.properties ?? [])
    .filter((property) => property.type === "text")
    .map((property) => ({ value: property.name, label: property.displayName }))
  const editingProperty =
    editing === null || editing === "new"
      ? null
      : (stored?.properties.find((property) => property.name === editing) ?? null)

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{isNew ? "New entity" : stored?.displayName}</CardTitle>
          <CardDescription>
            {isNew
              ? "Name the entity to create it. It gets a data API at once; add its properties next."
              : `${record.rows === 1 ? "1 row" : `${record.rows} rows`}. Its data is at /api/data/${record.name}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            noValidate
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              save()
            }}
          >
            <Field>
              <FieldLabel htmlFor={`${id}-display`}>Display name</FieldLabel>
              <Input
                id={`${id}-display`}
                data-testid="entity-display-name"
                value={displayName}
                autoComplete="off"
                aria-required="true"
                aria-invalid={wasSubmitted && displayError ? true : undefined}
                onChange={(event) => {
                  setDisplayName(event.target.value)
                  if (isNew && !nameTyped) setName(toName(event.target.value))
                  setState((current) => ({ ...current, saved: false }))
                }}
              />
              <FieldError>{wasSubmitted ? displayError : null}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
              <Input
                id={`${id}-name`}
                data-testid="entity-name"
                value={name}
                disabled={!isNew}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={wasSubmitted && nameError ? true : undefined}
                aria-describedby={`${id}-name-help`}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameTyped(true)
                }}
              />
              <FieldError data-testid="entity-name-error">
                {wasSubmitted ? nameError : null}
              </FieldError>
              <FieldDescription id={`${id}-name-help`}>
                {isNew
                  ? "Used in the API and in data paths. Made from the display name; fixed once saved."
                  : "Fixed: it was saved."}
              </FieldDescription>
            </Field>
            {isNew ? null : (
              <>
                <Field>
                  <FieldLabel htmlFor={`${id}-display-property`}>Display property</FieldLabel>
                  <ChoiceSelect
                    id={`${id}-display-property`}
                    testId="entity-display-property"
                    value={displayProperty}
                    choices={textProperties}
                    none="None: rows are shown by their id"
                    onChange={(value) => {
                      setDisplayProperty(value)
                      setState((current) => ({ ...current, saved: false }))
                    }}
                  />
                  <FieldDescription>
                    The text property that stands for a row in pickers, references and messages.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-default-form`}>Default form</FieldLabel>
                  <ChoiceSelect
                    id={`${id}-default-form`}
                    testId="entity-default-form"
                    value={defaultForm}
                    choices={forms.data ?? []}
                    none="None"
                    onChange={(value) => {
                      setDefaultForm(value)
                      setState((current) => ({ ...current, saved: false }))
                    }}
                  />
                  <FieldDescription>The form a row of this entity opens in.</FieldDescription>
                </Field>
              </>
            )}
            <div className="flex flex-col gap-3 sm:col-span-2">
              <SaveError error={state.error} testId="entity-error" />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  data-testid="entity-save"
                  aria-disabled={!isDirty || state.busy || undefined}
                  onClick={(event) => {
                    if (!isDirty || state.busy) event.preventDefault()
                  }}
                >
                  {isNew ? "Create entity" : "Save"}
                </Button>
                {!isNew && isDirty ? (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="entity-discard"
                    disabled={state.busy}
                    onClick={() => {
                      setDisplayName(stored?.displayName ?? "")
                      setDisplayProperty(stored?.displayProperty ?? null)
                      setDefaultForm(stored?.defaultForm ?? null)
                      setWasSubmitted(false)
                      setState({ busy: false, error: null, saved: false })
                      document.getElementById(`${id}-display`)?.focus()
                    }}
                  >
                    Discard
                  </Button>
                ) : null}
                <output data-testid="entity-save-status" className="text-sm text-muted-foreground">
                  {state.busy
                    ? "Saving…"
                    : !isNew && isDirty
                      ? "Unsaved changes"
                      : state.saved
                        ? "Saved"
                        : ""}
                </output>
                {isNew ? null : (
                  <Button
                    type="button"
                    variant="destructive"
                    data-testid="entity-delete"
                    className="ml-auto"
                    onClick={() => {
                      setDeleteError(null)
                      setIsDeleting(true)
                    }}
                  >
                    <Trash2Icon aria-hidden="true" data-icon="inline-start" />
                    Delete entity
                  </Button>
                )}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {record ? (
        <Card>
          <CardHeader>
            <CardTitle>Properties</CardTitle>
            <CardDescription>
              What {withArticle(record.definition.displayName.toLowerCase())} holds. Select a
              property to change it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul
              data-testid="entity-properties"
              className="flex flex-col divide-y overflow-hidden rounded-lg border"
            >
              {record.definition.properties.map((property) => (
                <li key={property.name}>
                  <PropertyRow
                    property={property}
                    isDisplay={record.definition.displayProperty === property.name}
                    onOpen={() => setEditing(property.name)}
                  />
                </li>
              ))}
              {SYSTEM.map((system) => (
                <li
                  key={system.name}
                  data-testid={`property-system-${system.name}`}
                  className="flex items-center gap-3 bg-muted/40 px-3 py-2 text-muted-foreground"
                >
                  <LockIcon aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{system.label}</span>{" "}
                    <span className="font-mono text-xs">{system.name}</span>
                  </span>
                  <span className="text-xs">{system.about}</span>
                </li>
              ))}
            </ul>
            <Button
              variant="outline"
              data-testid="property-new"
              className="self-start"
              onClick={() => setEditing("new")}
            >
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              Add property
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {record && editing !== null && (editing === "new" || editingProperty) ? (
        <PropertyDialog
          key={editing}
          record={record}
          property={editingProperty}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {record ? (
        <ConfirmDialog
          open={isDeleting}
          title={`Delete ${record.definition.displayName}?`}
          confirmLabel="Delete entity"
          isBusy={state.busy}
          error={deleteError}
          onCancel={() => setIsDeleting(false)}
          onConfirm={() => {
            setState((current) => ({ ...current, busy: true }))
            api.deleteEntity(record.name).then(
              () => {
                void cache.refresh()
                onDeleted()
              },
              (error: unknown) => {
                setState((current) => ({ ...current, busy: false }))
                setDeleteError(error instanceof Error ? error.message : "It could not be deleted.")
              },
            )
          }}
        >
          <p>
            The entity, its {record.definition.properties.length} properties and its{" "}
            {record.rows === 1 ? "1 row" : `${record.rows} rows`} are removed for good.
          </p>
          <UsedBy usage={usage} />
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

/** What every row has besides its entity's properties (spec 3.1): shown, never edited. */
const SYSTEM = [
  { name: "id", label: "Id", about: "Chosen by the server" },
  { name: "createdAt", label: "Created", about: "Set when the row is created" },
  { name: "updatedAt", label: "Updated", about: "Set on every save" },
  { name: "revision", label: "Revision", about: "Goes up on every save" },
] as const

function limitsOf(property: PropertyDefinition): string[] {
  const limits: string[] = []
  if (property.maxLength !== undefined) limits.push(`at most ${property.maxLength} characters`)
  if (property.multiline) limits.push("several lines")
  if (property.whole) limits.push("whole")
  if (property.min !== undefined && property.max !== undefined) {
    limits.push(`${property.min} to ${property.max}`)
  } else if (property.min !== undefined) limits.push(`${property.min} or more`)
  else if (property.max !== undefined) limits.push(`${property.max} or less`)
  if (property.earliest !== undefined) limits.push(`from ${property.earliest}`)
  if (property.latest !== undefined) limits.push(`until ${property.latest}`)
  return limits
}

function PropertyRow({
  property,
  isDisplay,
  onOpen,
}: {
  property: PropertyDefinition
  isDisplay: boolean
  onOpen: () => void
}) {
  const catalog = useCatalog()
  const type = PROPERTY_TYPES[property.type]
  const target =
    property.type === "referenceList"
      ? (catalog.list(property.referenceList)?.displayName ?? property.referenceList)
      : property.type === "reference"
        ? (catalog.entity(property.entity)?.displayName ?? property.entity)
        : null
  const flags = [
    property.required ? "Required" : null,
    property.readOnly ? "Read-only" : null,
    isDisplay ? "Display property" : null,
  ].filter((flag) => flag !== null)
  return (
    <button
      type="button"
      data-testid={`property-${property.name}`}
      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:-outline-offset-2"
      onClick={onOpen}
    >
      <type.icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-40 flex-1 flex-col">
        <span className="font-medium text-foreground">{property.displayName}</span>
        <span className="font-mono text-xs text-muted-foreground">{property.name}</span>
      </span>
      <span
        data-testid={`property-${property.name}-type`}
        className="text-sm text-muted-foreground"
      >
        {[target ? `${type.label}: ${target}` : type.label, ...limitsOf(property)].join(", ")}
      </span>
      <span className="flex flex-wrap gap-1">
        {flags.map((flag) => (
          <span
            key={flag}
            className="rounded-full border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {flag}
          </span>
        ))}
      </span>
    </button>
  )
}
