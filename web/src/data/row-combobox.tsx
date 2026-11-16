import * as React from "react"

import {
  Combobox,
  ComboboxClear,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxStatus,
} from "@/components/ui/combobox"

import { useCatalog, useRow, useRows } from "./client"

type Choice = { readonly id: string; readonly display: string }

const SEARCH_DELAY = 200
const CHOICES = 20

/**
 * Chooses a row of an entity: an accessible combobox that searches the
 * entity by its display property on the server as you type, and shows the
 * display value of the row chosen. The value is the row's id (ADR 0011).
 */
export function RowCombobox({
  entity,
  value,
  onChange,
  onLeave,
  placeholder,
  clearable = true,
  popupTestId,
  popupProps,
  ...input
}: {
  entity: string | null
  value: string | null
  onChange: (id: string | null) => void
  /** Focus left the control while its list was closed. */
  onLeave?: () => void
  placeholder?: string
  clearable?: boolean
  popupTestId?: string
  popupProps?: React.HTMLAttributes<HTMLElement>
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "placeholder">) {
  const catalog = useCatalog()
  const definition = catalog.entity(entity)
  /** What is being typed, or null while the control shows the chosen row. */
  const [typing, setTyping] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typing?.trim() ?? ""), SEARCH_DELAY)
    return () => window.clearTimeout(timer)
  }, [typing])

  const chosenRow = useRow(definition ? entity : null, value)
  const chosen = React.useMemo<Choice | null>(
    () => (value === null ? null : { id: value, display: chosenRow.data?.display ?? "" }),
    [value, chosenRow.data],
  )

  const display = definition?.displayProperty
  const found = useRows(isOpen && definition ? entity : null, {
    select: display ? [display] : [],
    ...(search === "" ? {} : { search }),
    ...(display ? { sort: [{ property: display, direction: "asc" }] } : {}),
    pageSize: CHOICES,
  })
  const items = React.useMemo<Choice[]>(
    () => (found.data?.rows ?? []).map((row) => ({ id: row.id, display: row.display })),
    [found.data],
  )
  const more = (found.data?.total ?? 0) - items.length

  return (
    <Combobox<Choice>
      items={items}
      // The server has already searched; nothing is filtered again here.
      filter={null}
      value={chosen}
      onValueChange={(item) => {
        setTyping(null)
        onChange(item?.id ?? null)
      }}
      inputValue={typing ?? chosen?.display ?? ""}
      onInputValueChange={(text, details) => {
        // Only typing is a search; the text set when an item is chosen is not.
        if (details.reason === "input-change" || details.reason === "input-clear") setTyping(text)
      }}
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open)
        if (!open) setTyping(null)
      }}
      itemToStringLabel={(item) => item.display}
      isItemEqualToValue={(item, other) => item.id === other.id}
    >
      <ComboboxInput
        {...input}
        placeholder={placeholder}
        autoComplete="off"
        onBlur={(event) => {
          input.onBlur?.(event)
          if (!isOpen) onLeave?.()
        }}
      >
        {clearable && value !== null ? <ComboboxClear aria-label="Clear" /> : null}
      </ComboboxInput>
      <ComboboxContent data-testid={popupTestId} {...popupProps}>
        <ComboboxStatus>
          {found.isError
            ? "The choices could not be loaded."
            : found.data === undefined
              ? "Searching…"
              : items.length === 0
                ? search === ""
                  ? "There is nothing to choose from yet."
                  : `Nothing matches “${search}”.`
                : more > 0
                  ? `Showing the first ${items.length} of ${items.length + more}. Type to narrow them.`
                  : null}
        </ComboboxStatus>
        <ComboboxList>
          {(item: Choice) => (
            <ComboboxItem key={item.id} value={item} data-row-id={item.id}>
              {item.display}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
