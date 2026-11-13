import * as React from "react"

import type { Slots } from "../runtime"

/**
 * How every input shows its value in read-only mode: the label, then the
 * value as text (spec section 6). No control is rendered.
 */
export function ReadOnlyField({
  name,
  label,
  slots,
  children,
}: {
  name: string
  label: string
  slots: Slots<"label">
  /** The value as text. Nothing, null or an empty string shows the empty marker. */
  children?: React.ReactNode
}) {
  const isEmpty = children === undefined || children === null || children === ""
  return (
    <dl className="flex min-w-0 flex-col gap-1" {...slots.root}>
      <dt className="text-sm leading-snug font-medium" {...slots.label}>
        {label}
      </dt>
      <dd
        data-testid={`field-${name}-value`}
        data-empty={isEmpty ? "true" : undefined}
        className="min-h-5 text-sm leading-snug wrap-break-word whitespace-pre-wrap text-foreground data-empty:text-muted-foreground"
      >
        {isEmpty ? <EmptyValue /> : children}
      </dd>
    </dl>
  )
}

/** The marker for "no value": a dash for the eye, words for a screen reader. */
function EmptyValue() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">No value</span>
    </>
  )
}
