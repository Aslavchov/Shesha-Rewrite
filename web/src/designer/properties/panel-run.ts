import { useDesigner, useDesignerContext } from "../context"
import { useDraft, useEditRun, useResetOn } from "./edit-run"

/**
 * A field's run of edits in the properties panel: kept and said aloud when
 * the field is left with a valid value, taken back when not (ADR 0009).
 */
export function usePanelRun() {
  const { store } = useDesignerContext()
  return useEditRun((run, keep) =>
    store.run(keep ? { type: "end-run", merge: run } : { type: "revert-run", merge: run }),
  )
}

/** Goes up when the document jumps (undo, redo, a run taken back): fields drop drafts and errors. */
export const useEpoch = () => useDesigner((snapshot) => snapshot.epoch)

/**
 * A text field of the panel that is checked as it is typed: its draft, its
 * error, and its run of edits. A valid value is stored at once, as part of
 * the run; a field left with an invalid one takes the run back.
 */
export function useCheckedText(
  external: string,
  check: (text: string) => string | null,
  store: (text: string, run: string) => void,
) {
  const run = usePanelRun()
  const epoch = useEpoch()
  const [draft, setDraft] = useDraft(external, epoch)
  const [error, setError] = useResetOn<string | null>(null, epoch)
  return {
    draft,
    error,
    onFocus: run.start,
    onBlur: () => {
      if (!run.end()) return
      setDraft(external)
      setError(null)
    },
    onChange: (text: string) => {
      setDraft(text)
      const problem = check(text)
      setError(problem)
      run.invalid(problem !== null)
      if (problem === null) store(text, run.current())
    },
  }
}
