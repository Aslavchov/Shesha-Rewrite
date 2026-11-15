import * as React from "react"
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Tab } from "@/forms/runtime"

import { focusSoon, useDraft } from "./edit-run"
import type { SettingEditorProps } from "./editors"
import { usePanelRun } from "./panel-run"

/**
 * Editors for settings that are lists or maps: options, tabs and validation
 * messages. Each row's fields are their own runs of edits; adding, removing
 * and reordering a row are single steps.
 */

function IconButton({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string
  testId: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            data-testid={testId}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Moves one item of a list by one place. */
const moved = <T,>(list: readonly T[], index: number, by: -1 | 1): T[] => {
  const target = index + by
  if (target < 0 || target >= list.length) return [...list]
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

/** The buttons at the end of a row: up, down and remove. */
function RowActions({
  noun,
  index,
  count,
  testId,
  canRemove = true,
  onMove,
  onRemove,
}: {
  noun: string
  index: number
  count: number
  testId: string
  canRemove?: boolean
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <div className="flex shrink-0 items-center">
      <IconButton
        label={`Move ${noun} ${index + 1} up`}
        testId={`${testId}-up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <ArrowUpIcon aria-hidden="true" />
      </IconButton>
      <IconButton
        label={`Move ${noun} ${index + 1} down`}
        testId={`${testId}-down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
      >
        <ArrowDownIcon aria-hidden="true" />
      </IconButton>
      <IconButton
        label={`Remove ${noun} ${index + 1}`}
        testId={`${testId}-remove`}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2Icon aria-hidden="true" />
      </IconButton>
    </div>
  )
}

/**
 * What the list editors share: the rows being edited (kept, even while not
 * valid, until the list is left), the run of edits of the row field with
 * focus, and where focus goes when a row moves or goes away.
 */
function useListEditor<T>(
  props: SettingEditorProps,
  rowsOf: (value: unknown) => T[],
  problemOf: (rows: readonly T[]) => string | null,
  prefix: string,
) {
  const external = JSON.stringify(rowsOf(props.value))
  const [draft, setDraft] = useDraft(external, props.epoch)
  const rows = rowsOf(JSON.parse(draft))
  const run = usePanelRun()
  const listRef = React.useRef<HTMLFieldSetElement>(null)
  const find = (testId: string) => () => listRef.current?.querySelector(`[data-testid="${testId}"]`)

  const apply = (next: T[], merge?: string) => {
    setDraft(JSON.stringify(next))
    const problem = problemOf(next) ?? props.check(next)
    run.invalid(problem !== null)
    props.onError(problem)
    if (problem === null) props.commit(next, merge)
  }

  return {
    rows,
    listRef,
    apply,
    /** For a row's field: a change, as part of its run. */
    edit: (next: T[]) => apply(next, run.current()),
    focus: run.start,
    /** Left with rows that cannot be stored: the run is taken back, and the rows are the document's again. */
    leave: () => {
      if (!run.end()) return
      setDraft(external)
      props.onError(null)
    },
    /** Removes a row; focus goes to the row that takes its place, the one before, or Add. */
    remove: (index: number) => {
      apply(rows.filter((_, at) => at !== index))
      focusSoon(
        find(`${prefix}-${index}-label`),
        find(`${prefix}-${index - 1}-label`),
        find(`${prefix}-add`),
      )
    },
    /** Moves a row; focus follows it, to the same button if it can still be pressed. */
    move: (index: number, by: -1 | 1) => {
      apply(moved(rows, index, by))
      const target = index + by
      focusSoon(
        find(`${prefix}-${target}-${by < 0 ? "up" : "down"}`),
        find(`${prefix}-${target}-label`),
      )
    },
  }
}

// --- Options ------------------------------------------------------------------

type Option = { label: string; value: string }

const isOption = (value: unknown): value is Option =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Option).label === "string" &&
  typeof (value as Option).value === "string"

const optionsOf = (value: unknown): Option[] =>
  Array.isArray(value)
    ? value.filter(isOption).map((option) => ({ label: option.label, value: option.value }))
    : []

/** Why a list of options cannot be stored, or null. */
function optionsProblem(options: readonly Option[]): string | null {
  if (options.some((option) => option.value.trim() === "")) return "Every option needs a value."
  const seen = new Set<string>()
  for (const option of options) {
    if (seen.has(option.value))
      return `Two options have the value “${option.value}”. Values must differ.`
    seen.add(option.value)
  }
  return null
}

export function OptionsEditor(props: SettingEditorProps) {
  const { listRef, ...list } = useListEditor(props, optionsOf, optionsProblem, "props-option")
  const options = list.rows
  const edit = (index: number, part: keyof Option, text: string) =>
    list.edit(options.map((option, at) => (at === index ? { ...option, [part]: text } : option)))
  const add = () => {
    const values = new Set(options.map((option) => option.value))
    let number = options.length + 1
    while (values.has(`option${number}`)) number++
    list.apply([...options, { label: `Option ${number}`, value: `option${number}` }])
  }

  return (
    <fieldset
      ref={listRef}
      id={props.id}
      aria-labelledby={`${props.id}-label`}
      aria-describedby={props.describedBy}
      data-testid={props.testId}
      className="flex min-w-0 flex-col gap-1.5"
    >
      {options.length > 0 ? (
        <div aria-hidden="true" className="flex gap-1.5 pr-21 text-xs text-muted-foreground">
          <span className="flex-1">Label</span>
          <span className="flex-1">Value</span>
        </div>
      ) : null}
      {options.map((option, index) => (
        // The index is the identity: two options may share a value while it is typed.
        // oxlint-disable-next-line react/no-array-index-key
        <div key={index} className="flex items-center gap-1.5">
          <Input
            aria-label={`Label of option ${index + 1}`}
            data-testid={`props-option-${index}-label`}
            value={option.label}
            onFocus={list.focus}
            onBlur={list.leave}
            onChange={(event) => edit(index, "label", event.target.value)}
            className="min-w-0 flex-1"
          />
          <Input
            aria-label={`Value of option ${index + 1}`}
            data-testid={`props-option-${index}-value`}
            value={option.value}
            spellCheck={false}
            onFocus={list.focus}
            onBlur={list.leave}
            onChange={(event) => edit(index, "value", event.target.value)}
            className="min-w-0 flex-1 font-mono"
          />
          <RowActions
            noun="option"
            index={index}
            count={options.length}
            testId={`props-option-${index}`}
            onMove={(by) => list.move(index, by)}
            onRemove={() => list.remove(index)}
          />
        </div>
      ))}
      <Button variant="outline" size="sm" data-testid="props-option-add" onClick={add}>
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
        Add option
      </Button>
    </fieldset>
  )
}

// --- Tabs ---------------------------------------------------------------------

const isTab = (value: unknown): value is Tab =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Tab).key === "string" &&
  typeof (value as Tab).label === "string"

const tabsOf = (value: unknown): Tab[] =>
  Array.isArray(value) ? value.filter(isTab).map((tab) => ({ key: tab.key, label: tab.label })) : []

/**
 * Tabs, each keyed by a stable key the author never sees. A new tab takes the
 * lowest `tabN` that no tab has and no region of the instance has stored, so
 * it never inherits the components of a tab that was removed.
 */
export function TabsEditor(props: SettingEditorProps) {
  const { listRef, ...list } = useListEditor(
    props,
    tabsOf,
    (rows) => (rows.some((tab) => tab.label.trim() === "") ? "Every tab needs a label." : null),
    "props-tab",
  )
  const tabs = list.rows
  const { showRegion, storedRegions } = props.context
  const add = () => {
    const used = new Set([...tabs.map((tab) => tab.key), ...storedRegions])
    let number = 1
    while (used.has(`tab${number}`)) number++
    const key = `tab${number}`
    list.apply([...tabs, { key, label: `Tab ${tabs.length + 1}` }])
    showRegion(key)
  }

  return (
    <fieldset
      ref={listRef}
      id={props.id}
      aria-labelledby={`${props.id}-label`}
      aria-describedby={props.describedBy}
      data-testid={props.testId}
      className="flex min-w-0 flex-col gap-1.5"
    >
      {tabs.map((tab, index) => (
        <div key={tab.key} data-tab-key={tab.key} className="flex items-center gap-1.5">
          <Input
            aria-label={`Label of tab ${index + 1}`}
            data-testid={`props-tab-${index}-label`}
            value={tab.label}
            onFocus={() => {
              list.focus()
              showRegion(tab.key)
            }}
            onBlur={list.leave}
            onChange={(event) =>
              list.edit(
                tabs.map((candidate, at) =>
                  at === index ? { ...candidate, label: event.target.value } : candidate,
                ),
              )
            }
            className="min-w-0 flex-1"
          />
          <IconButton
            label={`Show tab ${index + 1} on the canvas`}
            testId={`props-tab-${index}-show`}
            onClick={() => showRegion(tab.key)}
          >
            <EyeIcon aria-hidden="true" />
          </IconButton>
          <RowActions
            noun="tab"
            index={index}
            count={tabs.length}
            testId={`props-tab-${index}`}
            canRemove={tabs.length > 1}
            onMove={(by) => list.move(index, by)}
            onRemove={() => list.remove(index)}
          />
        </div>
      ))}
      <Button variant="outline" size="sm" data-testid="props-tab-add" onClick={add}>
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
        Add tab
      </Button>
    </fieldset>
  )
}

// --- Messages -----------------------------------------------------------------

const messagesOf = (value: unknown): Record<string, string> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : {}

/** One field per rule the input has: the message shown instead of the rule's own. */
export function MessagesEditor(props: SettingEditorProps) {
  const messages = messagesOf(props.value)
  const run = usePanelRun()
  const { rules } = props.context
  if (rules.length === 0) return null

  const change = (rule: string, text: string) => {
    const { [rule]: _, ...others } = messages
    const next = text === "" ? others : { ...others, [rule]: text }
    props.commit(Object.keys(next).length === 0 ? undefined : next, run.current())
  }

  return (
    <fieldset
      id={props.id}
      aria-labelledby={`${props.id}-label`}
      aria-describedby={props.describedBy}
      data-testid={props.testId}
      className="flex min-w-0 flex-col gap-2"
    >
      {rules.map((rule) => (
        <MessageField
          key={rule.id}
          rule={rule}
          value={messages[rule.id] ?? ""}
          epoch={props.epoch}
          onFocus={run.start}
          onBlur={run.end}
          onChange={(text) => change(rule.id, text)}
        />
      ))}
    </fieldset>
  )
}

function MessageField({
  rule,
  value,
  epoch,
  onFocus,
  onBlur,
  onChange,
}: {
  rule: { id: string; label: string }
  value: string
  epoch: number
  onFocus: () => void
  onBlur: () => void
  onChange: (text: string) => void
}) {
  const [draft, setDraft] = useDraft(value, epoch)
  const id = React.useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {rule.label}
      </label>
      <Input
        id={id}
        data-testid={`props-message-${rule.id}`}
        placeholder="The rule’s own message"
        value={draft}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(event) => {
          setDraft(event.target.value)
          onChange(event.target.value)
        }}
      />
    </div>
  )
}
