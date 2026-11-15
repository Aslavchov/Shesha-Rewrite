import * as React from "react"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Choice, Setting } from "@/forms/runtime"

import { useDraft } from "./edit-run"
import { usePanelRun } from "./panel-run"

/**
 * One editor per setting kind (spec 3.1). The panel picks the editor by the
 * setting's kind and nothing else, so a setting added to a definition gets an
 * editor with no change here. Each editor keeps the text being typed, checks
 * it, and stores it only when it is valid; until then it reports why not.
 */

export type EditorContext = {
  /** The instance's settings, resolved: for choices that come from another setting. */
  readonly resolved: Readonly<Record<string, unknown>>
  /** The rules of an input, for its messages. */
  readonly rules: readonly { readonly id: string; readonly label: string }[]
  /** The regions the instance has stored, so a new tab never reuses one's key. */
  readonly storedRegions: readonly string[]
  /** Shows one of the instance's regions on the canvas (a tab). */
  readonly showRegion: (region: string) => void
}

export type SettingEditorProps = {
  readonly id: string
  readonly testId: string
  readonly setting: Setting<unknown>
  /** The value in use: the stored one if it is valid, else the default. */
  readonly value: unknown
  readonly describedBy: string | undefined
  readonly invalid: boolean
  /** Why a value cannot be stored, or null if it can. */
  readonly check: (value: unknown) => string | null
  /** Stores a value, or resets the setting when it is undefined, as part of a run of edits. */
  readonly commit: (value: unknown, run?: string) => void
  /** The editor's own error: what is typed and cannot be stored. Null clears it. */
  readonly onError: (error: string | null) => void
  /** Goes up when the document jumps (undo, redo): drop the draft and show the document. */
  readonly epoch: number
  readonly context: EditorContext
}

/** What a setting stores when its text is emptied: nothing, if it is optional. */
const isOptional = (setting: Setting<unknown>) => setting.default === null

/** Shared by the text-like editors: keep the draft, check it, store it when valid. */
function useTextEditor(
  props: SettingEditorProps,
  external: string,
  read: (text: string) => { value: unknown } | { error: string },
) {
  const run = usePanelRun()
  const [draft, setDraft] = useDraft(external, props.epoch)
  const report = (error: string | null) => {
    run.invalid(error !== null)
    props.onError(error)
  }
  const change = (text: string) => {
    setDraft(text)
    if (text.trim() === "" && isOptional(props.setting)) {
      report(null)
      props.commit(undefined, run.current())
      return
    }
    const result = read(text)
    if ("error" in result) {
      report(result.error)
      return
    }
    const problem = props.check(result.value)
    report(problem)
    if (problem === null) props.commit(result.value, run.current())
  }
  // Left with a value that cannot be stored: the run is taken back, and the
  // field shows the document's value again.
  const leave = () => {
    if (!run.end()) return
    setDraft(external)
    props.onError(null)
  }
  return {
    id: props.id,
    "data-testid": props.testId,
    "aria-describedby": props.describedBy,
    "aria-invalid": props.invalid || undefined,
    value: draft,
    onFocus: run.start,
    onBlur: leave,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      change(event.target.value),
  }
}

export function TextEditor(props: SettingEditorProps) {
  const external = typeof props.value === "string" ? props.value : ""
  const input = useTextEditor(props, external, (text) => ({ value: text }))
  return props.setting.multiline ? (
    <Textarea {...input} rows={3} className="min-h-16 text-sm" />
  ) : (
    <Input {...input} type="text" />
  )
}

/** What a number setting accepts, in words: "Enter a whole number, 0 or more." */
function numberHint(setting: Setting<unknown>): string {
  const { min, max, whole } = setting.limits ?? {}
  const kind = whole ? "a whole number" : "a number"
  if (min !== undefined && max !== undefined) return `Enter ${kind} from ${min} to ${max}.`
  if (min !== undefined) return `Enter ${kind}, ${min} or more.`
  if (max !== undefined) return `Enter ${kind}, ${max} or less.`
  return `Enter ${kind}.`
}

export function NumberEditor(props: SettingEditorProps) {
  const external = typeof props.value === "number" ? String(props.value) : ""
  const input = useTextEditor(props, external, (text) => {
    const number = Number(text.trim())
    if (text.trim() === "" || !Number.isFinite(number)) return { error: numberHint(props.setting) }
    if (props.setting.parse(number) === undefined) return { error: numberHint(props.setting) }
    return { value: number }
  })
  const { min, max, whole } = props.setting.limits ?? {}
  return (
    <Input
      {...input}
      type="number"
      inputMode={whole ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={whole ? 1 : "any"}
      className="tabular-nums"
    />
  )
}

export function PatternEditor(props: SettingEditorProps) {
  const external = typeof props.value === "string" ? props.value : ""
  const input = useTextEditor(props, external, (text) =>
    props.setting.parse(text) === undefined
      ? { error: "This is not a regular expression that can be used. Check its brackets." }
      : { value: text },
  )
  return <Input {...input} type="text" spellCheck={false} className="font-mono" />
}

export function DateEditor(props: SettingEditorProps) {
  const external = typeof props.value === "string" ? props.value : ""
  const input = useTextEditor(props, external, (text) =>
    props.setting.parse(text) === undefined ? { error: "Enter a date." } : { value: text },
  )
  return <Input {...input} type="date" />
}

export function NumberListEditor(props: SettingEditorProps) {
  const external = Array.isArray(props.value) ? props.value.join(", ") : ""
  const input = useTextEditor(props, external, (text) => {
    const numbers = text
      .split(/[\s,]+/)
      .filter((part) => part !== "")
      .map(Number)
    return props.setting.parse(numbers) === undefined
      ? { error: "Enter whole numbers of 1 or more, separated by commas." }
      : { value: numbers }
  })
  return <Input {...input} type="text" inputMode="numeric" placeholder="1, 2" />
}

export function BooleanEditor(props: SettingEditorProps) {
  return (
    <Switch
      id={props.id}
      data-testid={props.testId}
      aria-describedby={props.describedBy}
      checked={props.value === true}
      onCheckedChange={(checked) => props.commit(checked)}
    />
  )
}

/** The value "none" in a choice whose default is no value. */
const NONE = "__none__"

export function ChoiceEditor(props: SettingEditorProps) {
  const { setting, context } = props
  const choices: readonly Choice[] =
    setting.choicesFrom?.(context.resolved) ?? setting.choices ?? []
  const optional = isOptional(setting)
  const current = typeof props.value === "string" ? props.value : optional ? NONE : ""
  const labelOf = (value: string) =>
    value === NONE ? "None" : (choices.find((choice) => choice.value === value)?.label ?? value)
  return (
    <Select
      value={current}
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
      >
        <SelectValue>{labelOf(current)}</SelectValue>
      </SelectTrigger>
      <SelectContent data-testid={`${props.testId}-choices`}>
        <SelectGroup>
          {optional ? (
            <SelectItem value={NONE} className="text-muted-foreground">
              None
            </SelectItem>
          ) : null}
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
