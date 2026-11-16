import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useCatalog, useDataClient } from "@/data/client"
import { PROPERTY_TYPE_ORDER, PROPERTY_TYPES } from "@/data/properties"
import { RowCombobox } from "@/data/row-combobox"
import { DateInput } from "@/forms/parts/date-input"
import type { DataValues, EntityRecord, PropertyDefinition, PropertyType } from "@/generated"

import { nameProblem, toName } from "./names"
import { useDefinitionCache, useFormsUsing } from "./hooks"
import { ChoiceSelect, SaveError, UsedBy } from "./parts"

/** What is typed for a property: text for every limit, read when it is saved. */
type Draft = {
  displayName: string
  name: string
  /** Whether the name was typed, or still follows the display name. */
  nameTyped: boolean
  helpText: string
  type: PropertyType
  required: boolean
  readOnly: boolean
  maxLength: string
  multiline: boolean
  whole: boolean
  min: string
  max: string
  earliest: string
  latest: string
  referenceList: string | null
  entity: string | null
  /** The value for existing rows that have none, when the property must have one. */
  fill: string
}

const text = (value: number | string | undefined) => (value === undefined ? "" : String(value))

function draftOf(property: PropertyDefinition | null): Draft {
  return {
    displayName: property?.displayName ?? "",
    name: property?.name ?? "",
    nameTyped: property !== null,
    helpText: property?.helpText ?? "",
    type: property?.type ?? "text",
    required: property?.required ?? false,
    readOnly: property?.readOnly ?? false,
    maxLength: text(property?.maxLength),
    multiline: property?.multiline ?? false,
    whole: property?.whole ?? false,
    min: text(property?.min),
    max: text(property?.max),
    earliest: property?.earliest ?? "",
    latest: property?.latest ?? "",
    referenceList: property?.referenceList ?? null,
    entity: property?.entity ?? null,
    fill: "",
  }
}

const numberOf = (value: string) => (value.trim() === "" ? undefined : Number(value))

/** The definition a draft stands for: only the limits of its own type (ADR 0011). */
function definitionOf(draft: Draft): PropertyDefinition {
  const maxLength = numberOf(draft.maxLength)
  const min = numberOf(draft.min)
  const max = numberOf(draft.max)
  return {
    name: draft.name,
    displayName: draft.displayName.trim(),
    ...(draft.helpText.trim() === "" ? {} : { helpText: draft.helpText.trim() }),
    type: draft.type,
    ...(draft.required && draft.type !== "boolean" ? { required: true } : {}),
    ...(draft.readOnly ? { readOnly: true } : {}),
    ...(draft.type === "text"
      ? {
          ...(maxLength === undefined ? {} : { maxLength }),
          ...(draft.multiline ? { multiline: true } : {}),
        }
      : {}),
    ...(draft.type === "number"
      ? {
          ...(draft.whole ? { whole: true } : {}),
          ...(min === undefined ? {} : { min }),
          ...(max === undefined ? {} : { max }),
        }
      : {}),
    ...(draft.type === "date"
      ? {
          ...(draft.earliest === "" ? {} : { earliest: draft.earliest }),
          ...(draft.latest === "" ? {} : { latest: draft.latest }),
        }
      : {}),
    ...(draft.type === "referenceList" && draft.referenceList
      ? { referenceList: draft.referenceList }
      : {}),
    ...(draft.type === "reference" && draft.entity ? { entity: draft.entity } : {}),
  }
}

/**
 * Adds or edits one property of an entity (spec 3.1 to 3.3). Nothing changes
 * until Save, and a change the rows cannot take is refused with the reason
 * shown here.
 */
export function PropertyDialog({
  record,
  property,
  onClose,
}: {
  record: EntityRecord
  /** The property being edited, or null for a new one. */
  property: PropertyDefinition | null
  onClose: () => void
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        data-testid="property-dialog"
        className="max-h-[calc(100svh---spacing(8))] overflow-y-auto sm:max-w-lg"
      >
        <PropertyFields record={record} property={property} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

function PropertyFields({
  record,
  property,
  onClose,
}: {
  record: EntityRecord
  property: PropertyDefinition | null
  onClose: () => void
}) {
  const catalog = useCatalog()
  const { api } = useDataClient()
  const cache = useDefinitionCache()
  const id = React.useId()
  const [draft, setDraft] = React.useState(() => draftOf(property))
  const [wasSubmitted, setWasSubmitted] = React.useState(false)
  const [state, setState] = React.useState<{ busy: boolean; error: unknown }>({
    busy: false,
    error: null,
  })
  const [isDeleting, setIsDeleting] = React.useState(false)
  const usage = useFormsUsing(isDeleting, record.name, property?.name)
  const set = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }))

  const isNew = property === null
  const entity = record.definition
  const others = entity.properties
    .filter((candidate) => candidate !== property)
    .map((candidate) => candidate.name)
  const displayError = draft.displayName.trim() === "" ? "Give the property a display name." : null
  const nameError = isNew
    ? nameProblem(draft.name, [...others, "id", "revision", "createdAt", "updatedAt"])
    : null
  const targetError =
    draft.type === "referenceList" && draft.referenceList === null
      ? "Choose the reference list."
      : draft.type === "reference" && draft.entity === null
        ? "Choose the entity."
        : null
  const show = <T,>(problem: T) => (wasSubmitted ? problem : null)

  // Rows that exist need a value when the property must have one.
  const needsFill =
    draft.required &&
    draft.type !== "boolean" &&
    record.rows > 0 &&
    (isNew || !property.required || property.type !== draft.type)
  const fillValue = (): DataValues | undefined => {
    if (!needsFill || draft.fill.trim() === "") return undefined
    return { [draft.name]: draft.type === "number" ? Number(draft.fill) : draft.fill }
  }

  const save = () => {
    setWasSubmitted(true)
    const first = displayError
      ? `${id}-display`
      : nameError
        ? `${id}-name`
        : targetError
          ? `${id}-target`
          : null
    if (first !== null) {
      document.getElementById(first)?.focus()
      return
    }
    const next = definitionOf(draft)
    const properties = isNew
      ? [...entity.properties, next]
      : entity.properties.map((candidate) => (candidate === property ? next : candidate))
    setState({ busy: true, error: null })
    api.updateEntity(record.revision, { ...entity, properties }, fillValue()).then(
      (stored) => {
        cache.entity(stored)
        onClose()
      },
      (error: unknown) => setState({ busy: false, error }),
    )
  }

  const remove = () => {
    if (!property) return
    setState({ busy: true, error: null })
    const properties = entity.properties.filter((candidate) => candidate !== property)
    const { displayProperty, ...rest } = entity
    const definition = {
      ...rest,
      properties,
      // A row can no longer be shown by a property that is gone.
      ...(displayProperty !== undefined && displayProperty !== property.name
        ? { displayProperty }
        : {}),
    }
    api.updateEntity(record.revision, definition).then(
      (stored) => {
        cache.entity(stored)
        onClose()
      },
      (error: unknown) => {
        setIsDeleting(false)
        setState({ busy: false, error })
      },
    )
  }

  const types = PROPERTY_TYPE_ORDER.map((type) => ({
    value: type,
    label: PROPERTY_TYPES[type].label,
  }))
  const lists = [...catalog.lists.values()].map((list) => ({
    value: list.name,
    label: list.definition.displayName,
  }))
  const entities = [...catalog.entities.values()].map((candidate) => ({
    value: candidate.name,
    label: candidate.definition.displayName,
  }))
  const rowsText = record.rows === 1 ? "1 existing row" : `${record.rows} existing rows`

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <DialogHeader>
        <DialogTitle>{isNew ? "New property" : `Edit ${property.displayName}`}</DialogTitle>
        <DialogDescription>
          {isNew
            ? `A property of ${entity.displayName}. Its name is used in data paths and the API, and is fixed once saved.`
            : `A property of ${entity.displayName}. A change that would lose existing values is refused.`}
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor={`${id}-display`}>Display name</FieldLabel>
        <Input
          id={`${id}-display`}
          data-testid="property-display-name"
          value={draft.displayName}
          autoComplete="off"
          aria-required="true"
          aria-invalid={show(displayError) ? true : undefined}
          onChange={(event) =>
            set({
              displayName: event.target.value,
              ...(draft.nameTyped ? {} : { name: toName(event.target.value) }),
            })
          }
        />
        <FieldError>{show(displayError)}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input
          id={`${id}-name`}
          data-testid="property-name"
          value={draft.name}
          disabled={!isNew}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          aria-invalid={show(nameError) ? true : undefined}
          aria-describedby={`${id}-name-help`}
          onChange={(event) => set({ name: event.target.value, nameTyped: true })}
        />
        <FieldError data-testid="property-name-error">{show(nameError)}</FieldError>
        <FieldDescription id={`${id}-name-help`}>
          {isNew ? "Made from the display name. Fixed once saved." : "Fixed: it was saved."}
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${id}-type`}>Type</FieldLabel>
        <ChoiceSelect
          id={`${id}-type`}
          testId="property-type"
          value={draft.type}
          choices={types}
          onChange={(type) => {
            if (type !== null) set({ type: type as PropertyType })
          }}
        />
      </Field>

      {draft.type === "text" ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${id}-max-length`}>Maximum length</FieldLabel>
            <Input
              id={`${id}-max-length`}
              data-testid="property-max-length"
              type="number"
              min={1}
              step={1}
              value={draft.maxLength}
              onChange={(event) => set({ maxLength: event.target.value })}
            />
            <FieldDescription>In characters. Empty for no limit of its own.</FieldDescription>
          </Field>
          <Toggle
            id={`${id}-multiline`}
            testId="property-multiline"
            label="Several lines"
            help="The value may run over several lines."
            checked={draft.multiline}
            onChange={(multiline) => set({ multiline })}
          />
        </>
      ) : null}

      {draft.type === "number" ? (
        <>
          <Toggle
            id={`${id}-whole`}
            testId="property-whole"
            label="Whole numbers only"
            checked={draft.whole}
            onChange={(whole) => set({ whole })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor={`${id}-min`}>Minimum</FieldLabel>
              <Input
                id={`${id}-min`}
                data-testid="property-min"
                type="number"
                step="any"
                value={draft.min}
                onChange={(event) => set({ min: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-max`}>Maximum</FieldLabel>
              <Input
                id={`${id}-max`}
                data-testid="property-max"
                type="number"
                step="any"
                value={draft.max}
                onChange={(event) => set({ max: event.target.value })}
              />
            </Field>
          </div>
        </>
      ) : null}

      {draft.type === "date" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor={`${id}-earliest`}>Earliest</FieldLabel>
            <DateInput
              id={`${id}-earliest`}
              testId="property-earliest"
              aria-label="Earliest"
              value={draft.earliest || null}
              onChange={(value) => set({ earliest: value ?? "" })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${id}-latest`}>Latest</FieldLabel>
            <DateInput
              id={`${id}-latest`}
              testId="property-latest"
              aria-label="Latest"
              value={draft.latest || null}
              onChange={(value) => set({ latest: value ?? "" })}
            />
          </Field>
        </div>
      ) : null}

      {draft.type === "referenceList" ? (
        <Field>
          <FieldLabel htmlFor={`${id}-target`}>Reference list</FieldLabel>
          <ChoiceSelect
            id={`${id}-target`}
            testId="property-reference-list"
            value={draft.referenceList}
            choices={lists}
            invalid={show(targetError) !== null}
            onChange={(referenceList) => set({ referenceList })}
          />
          <FieldError>{show(targetError)}</FieldError>
          <FieldDescription>Its values come from this list.</FieldDescription>
        </Field>
      ) : null}

      {draft.type === "reference" ? (
        <Field>
          <FieldLabel htmlFor={`${id}-target`}>Entity</FieldLabel>
          <ChoiceSelect
            id={`${id}-target`}
            testId="property-entity"
            value={draft.entity}
            choices={entities}
            invalid={show(targetError) !== null}
            onChange={(target) => set({ entity: target })}
          />
          <FieldError>{show(targetError)}</FieldError>
          <FieldDescription>Its value is a row of this entity.</FieldDescription>
        </Field>
      ) : null}

      <Field>
        <FieldLabel htmlFor={`${id}-help`}>Help text</FieldLabel>
        <Textarea
          id={`${id}-help`}
          data-testid="property-help-text"
          rows={2}
          value={draft.helpText}
          onChange={(event) => set({ helpText: event.target.value })}
        />
      </Field>

      {draft.type === "boolean" ? null : (
        <Toggle
          id={`${id}-required`}
          testId="property-required"
          label="Required"
          help="A row must have a value."
          checked={draft.required}
          onChange={(required) => set({ required })}
        />
      )}
      <Toggle
        id={`${id}-read-only`}
        testId="property-read-only"
        label="Read-only"
        help="Forms show the value and do not let people change it."
        checked={draft.readOnly}
        onChange={(readOnly) => set({ readOnly })}
      />

      {needsFill ? (
        <Field>
          <FieldLabel htmlFor={`${id}-fill`}>Value for the {rowsText}</FieldLabel>
          {draft.type === "referenceList" ? (
            <ChoiceSelect
              id={`${id}-fill`}
              testId="property-fill"
              value={draft.fill === "" ? null : draft.fill}
              choices={(catalog.list(draft.referenceList)?.items ?? [])
                .filter((item) => !item.retired)
                .map((item) => ({ value: item.value, label: item.label }))}
              onChange={(fill) => set({ fill: fill ?? "" })}
            />
          ) : draft.type === "reference" ? (
            <RowCombobox
              id={`${id}-fill`}
              data-testid="property-fill"
              entity={draft.entity}
              value={draft.fill === "" ? null : draft.fill}
              onChange={(fill) => set({ fill: fill ?? "" })}
            />
          ) : draft.type === "date" ? (
            <DateInput
              id={`${id}-fill`}
              testId="property-fill"
              aria-label={`Value for the ${rowsText}`}
              value={draft.fill || null}
              onChange={(value) => set({ fill: value ?? "" })}
            />
          ) : (
            <Input
              id={`${id}-fill`}
              data-testid="property-fill"
              type={draft.type === "number" ? "number" : "text"}
              step="any"
              value={draft.fill}
              onChange={(event) => set({ fill: event.target.value })}
            />
          )}
          <FieldDescription>
            A required property needs a value in every row. Rows that have none get this one.
          </FieldDescription>
        </Field>
      ) : null}

      <SaveError error={state.error} testId="property-error" />

      <DialogFooter className="sm:justify-between">
        {isNew ? (
          <span />
        ) : (
          <Button
            type="button"
            variant="destructive"
            data-testid="property-delete"
            disabled={state.busy}
            onClick={() => setIsDeleting(true)}
          >
            <Trash2Icon aria-hidden="true" data-icon="inline-start" />
            Delete
          </Button>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="submit" data-testid="property-save" disabled={state.busy}>
            {isNew ? "Add property" : "Save"}
          </Button>
        </div>
      </DialogFooter>

      {property ? (
        <ConfirmDialog
          open={isDeleting}
          title={`Delete ${property.displayName}?`}
          confirmLabel="Delete"
          isBusy={state.busy}
          onConfirm={remove}
          onCancel={() => setIsDeleting(false)}
        >
          <p>
            {record.rows === 0
              ? `${property.displayName} is removed from ${entity.displayName}.`
              : `${property.displayName} and its values in ${rowsText.replace("existing ", "")} are removed for good.`}
          </p>
          <UsedBy usage={usage} />
        </ConfirmDialog>
      ) : null}
    </form>
  )
}

function Toggle({
  id,
  testId,
  label,
  help,
  checked,
  onChange,
}: {
  id: string
  testId: string
  label: string
  help?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {help ? (
          <span id={`${id}-help`} className="text-sm text-muted-foreground">
            {help}
          </span>
        ) : null}
      </div>
      <Switch
        id={id}
        data-testid={testId}
        checked={checked}
        aria-describedby={help ? `${id}-help` : undefined}
        onCheckedChange={onChange}
      />
    </div>
  )
}
