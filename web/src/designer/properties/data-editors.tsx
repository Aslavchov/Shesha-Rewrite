import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCatalog, useFormChoices } from "@/data/client"
import type { Choice, Column } from "@/forms/runtime"

import { focusSoon } from "./edit-run"
import type { SettingEditorProps } from "./editors"
import { usePanelRun } from "./panel-run"

/**
 * Editors for settings that name something defined elsewhere (Phase 5,
 * ADR 0011): an entity, a reference list, a form, the columns of a table.
 * Like every editor here they are chosen by the setting's kind alone.
 */

const NONE = "__none__"

/** One of a list of named things, or none. A name that no longer exists is still shown. */
function NamedChoice({
  props,
  choices,
  isLoading,
  none,
  onOpen,
}: {
  props: SettingEditorProps
  choices: readonly Choice[]
  isLoading: boolean
  none: string
  /** The list is about to be shown: its choices are needed now. */
  onOpen: () => void
}) {
  const current = typeof props.value === "string" ? props.value : NONE
  const known = choices.some((choice) => choice.value === current)
  const labelOf = (value: string) =>
    value === NONE
      ? none
      : (choices.find((choice) => choice.value === value)?.label ??
        (isLoading ? value : `${value} (no longer exists)`))
  return (
    <Select
      value={current}
      onOpenChange={(open) => {
        if (open) onOpen()
      }}
      onValueChange={(value) => {
        if (typeof value !== "string") return
        props.commit(value === NONE ? undefined : value)
      }}
    >
      <SelectTrigger
        id={props.id}
        data-testid={props.testId}
        aria-describedby={props.describedBy}
        className="w-full"
        // Pointing at it is reason enough to start reading the choices.
        onPointerEnter={onOpen}
        onFocus={onOpen}
      >
        <SelectValue>{labelOf(current)}</SelectValue>
      </SelectTrigger>
      <SelectContent data-testid={`${props.testId}-choices`}>
        <SelectGroup>
          <SelectItem value={NONE} className="text-muted-foreground">
            {none}
          </SelectItem>
          {current !== NONE && !known ? (
            <SelectItem value={current}>{labelOf(current)}</SelectItem>
          ) : null}
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value} data-value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/**
 * The choices are read once they are wanted: when a value is set (to show
 * its name), or when the person reaches for the control. A form that never
 * names one costs no request.
 */
function useWanted(value: unknown) {
  const [wanted, setWanted] = React.useState(false)
  return { enabled: wanted || typeof value === "string", want: () => setWanted(true) }
}

export function EntityEditor(props: SettingEditorProps) {
  const wanted = useWanted(props.value)
  const catalog = useCatalog(wanted.enabled)
  const choices = [...catalog.entities.values()]
    .map((record) => ({ value: record.name, label: record.definition.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return (
    <NamedChoice
      props={props}
      choices={choices}
      isLoading={catalog.status !== "ready"}
      none="None"
      onOpen={wanted.want}
    />
  )
}

export function ReferenceListEditor(props: SettingEditorProps) {
  const wanted = useWanted(props.value)
  const catalog = useCatalog(wanted.enabled)
  const choices = [...catalog.lists.values()]
    .map((record) => ({ value: record.name, label: record.definition.displayName }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return (
    <NamedChoice
      props={props}
      choices={choices}
      isLoading={catalog.status !== "ready"}
      none="None"
      onOpen={wanted.want}
    />
  )
}

export function FormEditor(props: SettingEditorProps) {
  const wanted = useWanted(props.value)
  const forms = useFormChoices(wanted.enabled)
  return (
    <NamedChoice
      props={props}
      choices={forms.data ?? []}
      isLoading={forms.data === undefined}
      none="The entity's default form"
      onOpen={wanted.want}
    />
  )
}

const moved = <T,>(list: readonly T[], index: number, by: -1 | 1): T[] => {
  const copy = [...list]
  ;[copy[index], copy[index + by]] = [copy[index + by], copy[index]]
  return copy
}

/** The columns of a table: which properties, in which order, under which header. */
export function ColumnsEditor(props: SettingEditorProps) {
  const catalog = useCatalog()
  const entityName = props.setting.entityFrom?.(props.context.resolved) ?? null
  const entity = catalog.entity(entityName)
  const columns: readonly Column[] = Array.isArray(props.value) ? (props.value as Column[]) : []
  const rowsRef = React.useRef<HTMLUListElement>(null)

  if (entityName === null) {
    return (
      <p id={props.id} data-testid={props.testId} className="text-xs text-muted-foreground">
        Choose an entity first.
      </p>
    )
  }
  const properties = entity?.properties ?? []
  const free = properties.filter(
    (property) => !columns.some((column) => column.property === property.name),
  )
  const store = (next: readonly Column[], run?: string) =>
    props.commit(next.length === 0 ? undefined : next, run)
  const focusRow = (index: number) =>
    focusSoon(
      () => rowsRef.current?.children[index],
      () => rowsRef.current?.children[index - 1],
      () => document.getElementById(props.id),
    )

  return (
    <div className="flex flex-col gap-2">
      {columns.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Every property is shown, in the entity&rsquo;s own order. Add a column to choose.
        </p>
      ) : (
        <ul ref={rowsRef} className="flex flex-col gap-1.5">
          {columns.map((column, index) => {
            const property = properties.find((candidate) => candidate.name === column.property)
            const name = property?.displayName ?? column.property
            return (
              <li
                key={column.property}
                data-testid={`${props.testId}-${column.property}`}
                className="flex items-center gap-1"
              >
                <ColumnHeader
                  testId={`${props.testId}-${column.property}-header`}
                  name={name}
                  missing={entity !== undefined && property === undefined}
                  header={column.header ?? ""}
                  epoch={props.epoch}
                  onChange={(header, run) =>
                    store(
                      columns.map((candidate, at) =>
                        at === index
                          ? { property: column.property, ...(header === "" ? {} : { header }) }
                          : candidate,
                      ),
                      run,
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} up`}
                  data-testid={`${props.testId}-${column.property}-up`}
                  aria-disabled={index === 0 || undefined}
                  onClick={() => {
                    if (index > 0) store(moved(columns, index, -1))
                  }}
                >
                  <ArrowUpIcon aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${name} down`}
                  data-testid={`${props.testId}-${column.property}-down`}
                  aria-disabled={index === columns.length - 1 || undefined}
                  onClick={() => {
                    if (index < columns.length - 1) store(moved(columns, index, 1))
                  }}
                >
                  <ArrowDownIcon aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove the ${name} column`}
                  data-testid={`${props.testId}-${column.property}-remove`}
                  onClick={() => {
                    store(columns.filter((_, at) => at !== index))
                    focusRow(index)
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
      <Select
        value={NONE}
        onValueChange={(value) => {
          if (typeof value === "string" && value !== NONE) store([...columns, { property: value }])
        }}
      >
        <SelectTrigger
          id={props.id}
          data-testid={props.testId}
          aria-describedby={props.describedBy}
          className="w-full"
          disabled={free.length === 0}
        >
          <SelectValue>
            {free.length === 0 ? "Every property is a column" : "Add a column"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent data-testid={`${props.testId}-choices`}>
          <SelectGroup>
            <SelectItem value={NONE} className="text-muted-foreground">
              Add a column
            </SelectItem>
            {free.map((property) => (
              <SelectItem key={property.name} value={property.name} data-value={property.name}>
                {property.displayName}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

/** A column's header: the property's own name unless another is typed. One run of edits per focus. */
function ColumnHeader({
  testId,
  name,
  missing,
  header,
  epoch,
  onChange,
}: {
  testId: string
  name: string
  missing: boolean
  header: string
  epoch: number
  onChange: (header: string, run: string) => void
}) {
  const run = usePanelRun()
  // Follows the document when it jumps (undo, redo); typing is stored at once.
  const [draft, setDraft] = React.useState({ text: header, epoch })
  const text = draft.epoch === epoch ? draft.text : header
  return (
    <Input
      data-testid={testId}
      aria-label={`Header of the ${name} column`}
      aria-invalid={missing || undefined}
      title={missing ? "The entity no longer has this property." : undefined}
      placeholder={name}
      value={text}
      className="min-w-0 flex-1"
      onFocus={run.start}
      onBlur={() => void run.end()}
      onChange={(event) => {
        setDraft({ text: event.target.value, epoch })
        onChange(event.target.value.trim(), run.current())
      }}
    />
  )
}
