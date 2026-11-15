import * as React from "react"

/**
 * A run of edits to one field (ADR 0009). Every change made while a field
 * has focus carries the same run key, so the editor merges them into one undo
 * step: typing a label, or holding an arrow key on a number. When the field
 * is left, the run ends. If what the field holds then is valid, the run is
 * kept and said aloud once, with its final value. If not, the run is taken
 * back: the document returns to what it was when the field took focus, so a
 * half-typed value is never left behind.
 */

let runs = 0

/** A key no other run has had. */
export const newRun = () => `edit-${++runs}`

/** Ends a run: `keep` is false when the field was left with a value that cannot be stored. */
export type RunEnd = (run: string, keep: boolean) => void

/**
 * The run of one field. Pass `start` to its onFocus and `end` to its onBlur;
 * read `current` when a change is made, and report with `invalid` whether
 * what the field holds can be stored. `end` returns true when the run was
 * taken back, so the field can show the document's value again.
 *
 * A change made without focus (a click) starts a run of its own. A field
 * that goes away while it has a run (another selection) ends it the same way.
 */
export function useEditRun(finish: RunEnd) {
  const run = React.useRef<string | null>(null)
  const isInvalid = React.useRef(false)
  const finishRef = React.useRef(finish)
  React.useEffect(() => {
    finishRef.current = finish
  })

  const handle = React.useMemo(() => {
    const end = (): boolean => {
      const key = run.current
      const takenBack = isInvalid.current
      run.current = null
      isInvalid.current = false
      if (key !== null) finishRef.current(key, !takenBack)
      return takenBack
    }
    return {
      start: () => {
        end()
        run.current = newRun()
      },
      current: () => (run.current ??= newRun()),
      invalid: (flag: boolean) => {
        isInvalid.current = flag
      },
      end,
    }
  }, [])

  // Leaving by going away: another selection replaces the panel's fields.
  React.useEffect(() => () => void handle.end(), [handle])
  return handle
}

/**
 * State that starts again from `initial` whenever `key` changes, in the same
 * render: a draft that follows the document, an error that goes when the
 * document jumps (undo, redo).
 */
export function useResetOn<T>(initial: T, key: string | number) {
  const [state, setState] = React.useState(initial)
  const [seen, setSeen] = React.useState(key)
  if (seen !== key) {
    setSeen(key)
    setState(initial)
    return [initial, setState] as const
  }
  return [state, setState] as const
}

/**
 * Text being edited, and the value the document has. While the document's
 * value is the one the text came from, the text is kept, even when it is not
 * valid yet; when the document's value changes some other way, or the
 * document jumps (`epoch`: undo, redo, a run taken back), the text follows it.
 */
export function useDraft(external: string, epoch: number) {
  return useResetOn(external, `${epoch}\u0000${external}`)
}

const FOCUSABLE =
  'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** The element itself if it takes focus, else the first thing inside it that does. */
export function focusableIn(element: Element | null | undefined): HTMLElement | null {
  if (!element) return null
  if (element instanceof HTMLElement && element.matches(FOCUSABLE)) return element
  return element.querySelector<HTMLElement>(FOCUSABLE)
}

/**
 * Moves focus once the change that caused it has been drawn: to the first of
 * the candidates that exists and takes focus. Used where the control that
 * had focus goes away (a reset button, a removed row, a fixed problem), so
 * focus never drops to the page.
 */
export function focusSoon(...candidates: (() => Element | null | undefined)[]) {
  requestAnimationFrame(() => {
    for (const candidate of candidates) {
      const target = focusableIn(candidate())
      if (target && target.isConnected) {
        target.focus()
        return
      }
    }
  })
}
