import * as React from "react"

import type { FieldApi } from "../runtime"

/**
 * For controls where a person types text that stands for a value of another
 * type: a number, a date. The control shows the text exactly as typed while
 * it is being edited, and the value in its standard form otherwise.
 *
 * Text that cannot be read is reported to the form (`field.setUnreadable`),
 * so the field fails validation with `unreadable` instead of silently losing
 * what was typed (ADR 0005).
 */
export function useTextDraft<V>(
  field: FieldApi<V>,
  {
    format,
    parse,
    unreadable,
  }: {
    /** The value as the text to show. */
    format: (value: V) => string
    /** The value the text stands for, or null if it cannot be read. */
    parse: (text: string) => V | null
    /** The error to show for text that cannot be read. */
    unreadable: string
  },
) {
  // The text being typed, tagged with the reset it belongs to: after a reset
  // the tag no longer matches and the draft is ignored, with no effect needed.
  const [draft, setDraft] = React.useState<{ text: string; resets: number } | null>(null)
  const typed = draft !== null && draft.resets === field.resets ? draft.text : null

  return {
    /** What the text control shows. */
    text: typed ?? (field.value === null ? "" : format(field.value)),

    /** The person typed: keep their text, and set the value it stands for. */
    change(text: string) {
      setDraft({ text, resets: field.resets })
      if (text.trim() === "") {
        field.setValue(null)
        return
      }
      const value = parse(text)
      if (value === null) field.setUnreadable(unreadable)
      else field.setValue(value)
    },

    /** The value was chosen some other way (from a calendar): drop the text. */
    choose(value: V | null) {
      setDraft(null)
      field.setValue(value)
    },

    /**
     * The person stopped typing. Readable text is replaced by the value in
     * its standard form; unreadable text stays, so they can see and fix it.
     */
    settle() {
      if (typed !== null && (typed.trim() === "" || parse(typed) !== null)) setDraft(null)
    },
  }
}
