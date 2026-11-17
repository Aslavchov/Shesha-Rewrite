import * as React from "react"

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
import type { Catalog } from "@/data/client"
import { RowCombobox } from "@/data/row-combobox"
import type { PropertyDefinition } from "@/generated"

import { DateInput } from "../../parts/date-input"
import type { FilterDraft } from "./view"

/** The value of "no filter" in a choice. */
const ANY = "__any__"

/**
 * One typed filter per column (spec section 6): text is "contains", numbers
 * and dates are a range, the rest are a choice. Every filter must hold.
 */
export function Filters({
  id,
  properties,
  headers,
  drafts,
  lists,
  onChange,
  onClear,
}: {
  id: string
  properties: readonly PropertyDefinition[]
  headers: readonly { property: PropertyDefinition; header: string }[]
  drafts: Readonly<Record<string, FilterDraft>>
  lists: Catalog
  onChange: (drafts: Readonly<Record<string, FilterDraft>>) => void
  /** Present while a filter is set. */
  onClear?: () => void
}) {
  const set = (name: string, draft: FilterDraft) => onChange({ ...drafts, [name]: draft })
  return (
    <fieldset
      id={id}
      data-testid="table-filter-panel"
      className="grid gap-x-4 gap-y-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <legend className="sr-only">Filters</legend>
      {properties.map((property) => (
        <FilterField
          key={property.name}
          id={`${id}-${property.name}`}
          property={property}
          label={headers.find((column) => column.property === property)?.header ?? property.name}
          draft={drafts[property.name] ?? {}}
          lists={lists}
          onChange={(draft) => set(property.name, draft)}
        />
      ))}
      {onClear ? (
        <div className="flex items-end sm:col-span-2 lg:col-span-3">
          <Button variant="ghost" size="sm" data-testid="table-filters-clear" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}

function FilterField({
  id,
  property,
  label,
  draft,
  lists,
  onChange,
}: {
  id: string
  property: PropertyDefinition
  label: string
  draft: FilterDraft
  lists: Catalog
  onChange: (draft: FilterDraft) => void
}) {
  const testId = `table-filter-${property.name}`
  const labelClass = "text-xs font-medium text-muted-foreground"

  if (property.type === "number" || property.type === "date") {
    // A range: the same control at each end as the rest of the app uses.
    const end = (which: "from" | "to") =>
      property.type === "date" ? (
        <DateInput
          testId={`${testId}-${which}`}
          aria-label={`${label} ${which}`}
          placeholder={which === "from" ? "From" : "To"}
          value={draft[which] || null}
          onChange={(value) => onChange({ ...draft, [which]: value ?? "" })}
        />
      ) : (
        <Input
          type="number"
          step="any"
          data-testid={`${testId}-${which}`}
          aria-label={`${label} ${which}`}
          placeholder={which === "from" ? "From" : "To"}
          value={draft[which] ?? ""}
          onChange={(event) => onChange({ ...draft, [which]: event.target.value })}
        />
      )
    return (
      <fieldset data-testid={testId} className="flex min-w-0 flex-col gap-1">
        <legend className={`${labelClass} mb-1`}>{label}</legend>
        <div className="flex items-center gap-1.5">
          {end("from")}
          <span aria-hidden="true" className="text-muted-foreground">
            –
          </span>
          {end("to")}
        </div>
      </fieldset>
    )
  }

  let control: React.ReactNode
  if (property.type === "text") {
    control = (
      <Input
        id={id}
        type="text"
        data-testid={testId}
        placeholder="Contains"
        value={draft.value ?? ""}
        onChange={(event) => onChange({ value: event.target.value })}
      />
    )
  } else if (property.type === "reference") {
    control = (
      <RowCombobox
        id={id}
        data-testid={testId}
        entity={property.entity ?? null}
        value={draft.value ?? null}
        placeholder="Any"
        popupTestId={`${testId}-popup`}
        onChange={(value) => onChange({ value: value ?? undefined })}
      />
    )
  } else {
    const choices =
      property.type === "boolean"
        ? [
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]
        : (lists.list(property.referenceList)?.items ?? []).map((item) => ({
            value: item.value,
            label: item.retired ? `${item.label} (retired)` : item.label,
          }))
    const current = draft.value ?? ANY
    control = (
      <Select
        value={current}
        onValueChange={(value) =>
          onChange({ value: typeof value === "string" && value !== ANY ? value : undefined })
        }
      >
        <SelectTrigger id={id} data-testid={testId} className="w-full">
          <SelectValue>
            {current === ANY
              ? "Any"
              : (choices.find((choice) => choice.value === current)?.label ?? current)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent data-testid={`${testId}-choices`}>
          <SelectGroup>
            <SelectItem value={ANY} className="text-muted-foreground">
              Any
            </SelectItem>
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
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {control}
    </div>
  )
}
