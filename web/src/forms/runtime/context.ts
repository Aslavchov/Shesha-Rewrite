import * as React from "react"

import type { FormStore } from "./store"
import { type FieldValue } from "./values"

/** What a static component (a Button) can ask the form to do. */
export type FormActions = {
  readonly submit: () => void
  readonly reset: () => void
}

export type FormContextValue = {
  readonly store: FormStore
  /** Unique per rendered form; the prefix of every element id inside it. */
  readonly uid: string
  readonly actions: FormActions
}

export const FormContext = React.createContext<FormContextValue | null>(null)

export function useFormContext(): FormContextValue {
  const context = React.useContext(FormContext)
  if (!context) throw new Error("Form components can only be rendered inside a FormRenderer.")
  return context
}

/** The DOM id of a field's control. Its label, help text and error derive from it. */
export function controlId(uid: string, instanceId: string): string {
  return `${uid}-${instanceId}`
}

/** What an input's edit renderer works with (ADR 0004). */
export type FieldApi<V> = {
  /** The id to put on the control, so the label and focus management find it. */
  readonly id: string
  readonly descriptionId: string
  readonly errorId: string
  readonly value: V | null
  /** The error currently shown, if any. */
  readonly error: string | null
  /** Goes up on every reset: drop any text held outside `value`. */
  readonly resets: number
  readonly setValue: (value: V | null) => void
  /** The control holds text it cannot read as a value. Cleared by `setValue`. */
  readonly setUnreadable: (message: string) => void
  /** The person has left the control: validate and show the result. */
  readonly leave: () => void
}

function useFieldState(id: string) {
  const { store } = useFormContext()
  const subscribe = React.useCallback(
    (listener: () => void) => store.subscribe(id, listener),
    [store, id],
  )
  return React.useSyncExternalStore(subscribe, () => store.get(id))
}

/**
 * Subscribes a component to one field, for editing. `guard` is the value
 * type's runtime check, which is what gives `value` its type.
 */
export function useField<V extends FieldValue>(
  id: string,
  guard: (value: FieldValue) => value is V,
): FieldApi<V> {
  const { store, uid } = useFormContext()
  const state = useFieldState(id)

  // Only fields on screen for editing take part in validation.
  React.useEffect(() => store.mount(id), [store, id])

  return React.useMemo(() => {
    const control = controlId(uid, id)
    return {
      id: control,
      descriptionId: `${control}-description`,
      errorId: `${control}-error`,
      value: state.value !== null && guard(state.value) ? state.value : null,
      error: state.error,
      resets: state.resets,
      setValue: (value) => store.setValue(id, value),
      setUnreadable: (message) => store.setUnreadable(id, message),
      leave: () => store.leave(id),
    }
  }, [store, uid, id, state, guard])
}

/** Subscribes a component to one field's value, for display. */
export function useFieldValue<V extends FieldValue>(
  id: string,
  guard: (value: FieldValue) => value is V,
): V | null {
  const { value } = useFieldState(id)
  return value !== null && guard(value) ? value : null
}
