import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ApiRequestError } from "@/lib/api"

import type { useFormsUsing } from "./hooks"

/** What the parts of the Entities page share. */

export type Choice = { readonly value: string; readonly label: string }

const NONE = "__none__"

/** One of a list, or none when `none` names that choice. */
export function ChoiceSelect({
  id,
  testId,
  value,
  choices,
  none,
  disabled,
  invalid,
  describedBy,
  onChange,
}: {
  id: string
  testId: string
  value: string | null
  choices: readonly Choice[]
  /** What "nothing chosen" is called. Left out: one must be chosen. */
  none?: string
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  onChange: (value: string | null) => void
}) {
  const current = value ?? NONE
  const labelOf = (candidate: string) =>
    candidate === NONE
      ? (none ?? "Choose…")
      : (choices.find((choice) => choice.value === candidate)?.label ?? candidate)
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next === NONE ? null : next)
      }}
    >
      <SelectTrigger
        id={id}
        data-testid={testId}
        className="w-full"
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <SelectValue>{labelOf(current)}</SelectValue>
      </SelectTrigger>
      <SelectContent data-testid={`${testId}-choices`}>
        <SelectGroup>
          {none === undefined ? null : (
            <SelectItem value={NONE} className="text-muted-foreground">
              {none}
            </SelectItem>
          )}
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

/** A refused save, in the server's own words: the reason, then each problem. */
export function SaveError({ error, testId }: { error: unknown; testId: string }) {
  if (error === null || error === undefined) return null
  const message = error instanceof Error ? error.message : "The change could not be saved."
  const details = error instanceof ApiRequestError ? error.details : []
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground"
    >
      <p className="font-medium">{message}</p>
      {details.length > 0 ? (
        <ul className="flex list-disc flex-col gap-0.5 pl-5">
          {details.map((detail) => (
            <li key={`${detail.path}:${detail.message}`}>{detail.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** "Used by the form Person." / "Used by the forms People and Person." / "No form uses it." */
export function UsedBy({ usage }: { usage: ReturnType<typeof useFormsUsing> }) {
  if (usage.failed) return <p>The forms could not be checked for uses of it.</p>
  if (usage.names === undefined) return <p>Checking which forms use it…</p>
  if (usage.names.length === 0) return <p data-testid="confirm-usage">No form uses it.</p>
  const [last, ...rest] = [...usage.names].reverse()
  const listed = rest.length === 0 ? last : `${rest.reverse().join(", ")} and ${last}`
  return (
    <p data-testid="confirm-usage">
      Used by the {usage.names.length === 1 ? "form" : "forms"}{" "}
      <strong className="font-medium text-foreground">{listed}</strong>, which will show a problem
      until {usage.names.length === 1 ? "it is" : "they are"} changed.
    </p>
  )
}
