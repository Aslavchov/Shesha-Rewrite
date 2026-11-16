import * as React from "react"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { ITEM_COLOR_LABELS } from "@/components/status-colors"
import { StatusTag } from "@/components/status-tag"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCatalog, useDataClient } from "@/data/client"
import {
  ITEM_COLORS,
  type ItemColor,
  type ReferenceListDefinition,
  type ReferenceListRecord,
} from "@/generated"

import { nameProblem, toName, unique } from "./names"
import { useDefinitionCache } from "./hooks"
import { ChoiceSelect, SaveError } from "./parts"

/** An item as it is edited. `saved` items keep their value for good (spec 3.4). */
type Item = {
  readonly key: number
  readonly value: string | null
  readonly label: string
  readonly color: ItemColor
  readonly retired: boolean
}

const COLOR_CHOICES = ITEM_COLORS.map((color) => ({
  value: color,
  label: ITEM_COLOR_LABELS[color],
}))

let keys = 0

/** The value each item has or will get: a new item's is made from its label. */
function valuesOf(items: readonly Item[]): string[] {
  const taken = items.flatMap((item) => (item.value === null ? [] : [item.value]))
  return items.map((item) => {
    if (item.value !== null) return item.value
    const made = unique(toName(item.label) || "item", taken)
    taken.push(made)
    return made
  })
}

/**
 * One reference list (spec 3.4): its items in order, each with a label, a
 * colour and whether it is retired. Nothing changes until Save.
 */
export function ReferenceListEditor({
  record,
  onCreated,
  onDeleted,
  justCreated = false,
}: {
  record: ReferenceListRecord | null
  onCreated: (name: string) => void
  onDeleted: () => void
  /** The editor opens on what was just created here: it says so. */
  justCreated?: boolean
}) {
  const catalog = useCatalog()
  const { api } = useDataClient()
  const cache = useDefinitionCache()
  const id = React.useId()
  const stored = record?.definition
  const itemsOf = (definition: ReferenceListDefinition | undefined): Item[] =>
    (definition?.items ?? []).map((item) => ({
      key: ++keys,
      value: item.value,
      label: item.label,
      color: item.color,
      retired: item.retired ?? false,
    }))

  const [displayName, setDisplayName] = React.useState(stored?.displayName ?? "")
  const [name, setName] = React.useState(stored?.name ?? "")
  const [nameTyped, setNameTyped] = React.useState(false)
  const [items, setItems] = React.useState<Item[]>(() => itemsOf(stored))
  const [wasSubmitted, setWasSubmitted] = React.useState(false)
  const [state, setState] = React.useState<{ busy: boolean; error: unknown; saved: boolean }>({
    busy: false,
    error: null,
    saved: justCreated,
  })
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  const listRef = React.useRef<HTMLUListElement>(null)

  const isNew = record === null
  const values = valuesOf(items)
  const displayError = displayName.trim() === "" ? "Give the list a display name." : null
  const nameError = isNew ? nameProblem(name, [...catalog.lists.keys()]) : null
  const blank = items.findIndex((item) => item.label.trim() === "")
  const change = (next: Item[]) => {
    setItems(next)
    setState((current) => ({ ...current, saved: false }))
  }
  const update = (key: number, patch: Partial<Item>) =>
    change(items.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  const move = (index: number, by: -1 | 1) => {
    const next = [...items]
    ;[next[index], next[index + by]] = [next[index + by], next[index]]
    change(next)
  }

  const save = () => {
    setWasSubmitted(true)
    if (displayError || nameError) {
      document.getElementById(displayError ? `${id}-display` : `${id}-name`)?.focus()
      return
    }
    if (blank >= 0) {
      listRef.current?.querySelectorAll<HTMLElement>("[data-item-label]")[blank]?.focus()
      return
    }
    const definition: ReferenceListDefinition = {
      name,
      displayName: displayName.trim(),
      items: items.map((item, index) => ({
        value: values[index],
        label: item.label.trim(),
        color: item.color,
        ...(item.retired ? { retired: true } : {}),
      })),
    }
    setState({ busy: true, error: null, saved: false })
    const request = record
      ? api.updateReferenceList(record.revision, definition)
      : api.createReferenceList(definition)
    request.then(
      (saved) => {
        cache.list(saved)
        setItems(itemsOf(saved.definition))
        setState({ busy: false, error: null, saved: true })
        if (!record) onCreated(saved.name)
      },
      (error: unknown) => setState({ busy: false, error, saved: false }),
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isNew ? "New reference list" : stored?.displayName}</CardTitle>
        <CardDescription>
          The choices of a reference list property, in the order they are offered. An item&rsquo;s
          label can change freely; rows store its value, which is fixed once saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`${id}-display`}>Display name</FieldLabel>
              <Input
                id={`${id}-display`}
                data-testid="reflist-display-name"
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
                data-testid="reflist-name"
                value={name}
                disabled={!isNew}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={wasSubmitted && nameError ? true : undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameTyped(true)
                }}
              />
              <FieldError>{wasSubmitted ? nameError : null}</FieldError>
              <FieldDescription>
                {isNew ? "Made from the display name. Fixed once saved." : "Fixed: it was saved."}
              </FieldDescription>
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-foreground">Items</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items yet. Add the first one.</p>
            ) : (
              <ul ref={listRef} data-testid="reflist-items" className="flex flex-col gap-2">
                {items.map((item, index) => {
                  const value = values[index]
                  const label = item.label.trim() || "this item"
                  return (
                    <li
                      key={item.key}
                      data-testid={`reflist-item-${value}`}
                      data-retired={item.retired ? "true" : undefined}
                      className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
                    >
                      <Input
                        data-item-label=""
                        data-testid={`reflist-item-${value}-label`}
                        aria-label={`Label of item ${index + 1}`}
                        aria-invalid={wasSubmitted && item.label.trim() === "" ? true : undefined}
                        placeholder="Label"
                        value={item.label}
                        className="min-w-32 flex-1"
                        onChange={(event) => update(item.key, { label: event.target.value })}
                      />
                      <div className="w-36">
                        <ChoiceSelect
                          id={`${id}-colour-${item.key}`}
                          testId={`reflist-item-${value}-colour`}
                          value={item.color}
                          choices={COLOR_CHOICES}
                          onChange={(color) => {
                            if (color !== null) update(item.key, { color: color as ItemColor })
                          }}
                        />
                      </div>
                      {/* A fixed column, so every row's fields line up whatever the label. */}
                      <span className="flex w-36 shrink-0">
                        <StatusTag color={item.color} retired={item.retired}>
                          {item.label.trim() || "Label"}
                        </StatusTag>
                      </span>
                      <span className="ml-auto flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          data-testid={`reflist-item-${value}-up`}
                          aria-label={`Move ${label} up`}
                          aria-disabled={index === 0 || undefined}
                          onClick={() => {
                            if (index > 0) move(index, -1)
                          }}
                        >
                          <ArrowUpIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          data-testid={`reflist-item-${value}-down`}
                          aria-label={`Move ${label} down`}
                          aria-disabled={index === items.length - 1 || undefined}
                          onClick={() => {
                            if (index < items.length - 1) move(index, 1)
                          }}
                        >
                          <ArrowDownIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`reflist-item-${value}-retire`}
                          aria-pressed={item.retired}
                          title="A retired item is hidden from new choices, and still shown where rows hold it."
                          onClick={() => update(item.key, { retired: !item.retired })}
                        >
                          {item.retired ? (
                            <ArchiveRestoreIcon aria-hidden="true" data-icon="inline-start" />
                          ) : (
                            <ArchiveIcon aria-hidden="true" data-icon="inline-start" />
                          )}
                          {item.retired ? "Retired" : "Retire"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          data-testid={`reflist-item-${value}-delete`}
                          aria-label={`Delete ${label}`}
                          onClick={() => change(items.filter((other) => other.key !== item.key))}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </Button>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
            {wasSubmitted && blank >= 0 ? (
              <p role="alert" className="text-sm text-destructive">
                Every item needs a label.
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              data-testid="reflist-item-new"
              className="self-start"
              onClick={() => {
                change([
                  ...items,
                  { key: ++keys, value: null, label: "", color: "muted", retired: false },
                ])
                requestAnimationFrame(() => {
                  const labels = listRef.current?.querySelectorAll<HTMLElement>("[data-item-label]")
                  labels?.[labels.length - 1]?.focus()
                })
              }}
            >
              <PlusIcon aria-hidden="true" data-icon="inline-start" />
              Add item
            </Button>
          </div>

          <SaveError error={state.error} testId="reflist-error" />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" data-testid="reflist-save" disabled={state.busy}>
              {isNew ? "Create list" : "Save"}
            </Button>
            <output data-testid="reflist-save-status" className="text-sm text-muted-foreground">
              {state.busy ? "Saving…" : state.saved ? "Saved" : ""}
            </output>
            {isNew ? null : (
              <Button
                type="button"
                variant="destructive"
                data-testid="reflist-delete"
                className="ml-auto"
                onClick={() => {
                  setDeleteError(null)
                  setIsDeleting(true)
                }}
              >
                <Trash2Icon aria-hidden="true" data-icon="inline-start" />
                Delete list
              </Button>
            )}
          </div>
        </form>
      </CardContent>

      {record ? (
        <ConfirmDialog
          open={isDeleting}
          title={`Delete ${record.definition.displayName}?`}
          confirmLabel="Delete list"
          isBusy={state.busy}
          error={deleteError}
          onCancel={() => setIsDeleting(false)}
          onConfirm={() => {
            setState((current) => ({ ...current, busy: true }))
            api.deleteReferenceList(record.name).then(
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
          <p>The list and its items are removed for good. A list that properties use is kept.</p>
        </ConfirmDialog>
      ) : null}
    </Card>
  )
}
