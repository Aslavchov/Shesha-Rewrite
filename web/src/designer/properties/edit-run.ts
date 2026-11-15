import * as React from "react"

/**
 * A run of edits to one field (ADR 0009). Every change made while a field
 * has focus carries the same run key, so the editor merges them into one undo
 * step: typing a label, or holding an arrow key on a number. Focusing the
 * field again starts a new run.
 */

let runs = 0

/** A key no other run has had. */
export const newRun = () => `edit-${++runs}`

/**
 * The run key for one field: pass `start` to its onFocus, and read `current`
 * when a change is made. A change made without focus (a click) starts a run
 * of its own.
 */
export function useEditRun() {
  const run = React.useRef<string | null>(null)
  return React.useMemo(
    () => ({
      start: () => {
        run.current = newRun()
      },
      current: () => (run.current ??= newRun()),
      end: () => {
        run.current = null
      },
    }),
    [],
  )
}

/**
 * Text being edited, and the value the document has. While the document's
 * value is the one the text came from, the text is kept, even when it is not
 * valid yet; when the document's value changes some other way (undo), the
 * text follows it.
 */
export function useDraft(external: string) {
  const [draft, setDraft] = React.useState(external)
  const [synced, setSynced] = React.useState(external)
  if (external !== synced) {
    setSynced(external)
    setDraft(external)
  }
  return [draft, setDraft] as const
}
