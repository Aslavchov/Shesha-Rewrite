import {
  type FieldValue,
  nestByPath,
  type NestedValues,
  normaliseValue,
  type ValueType,
} from "./values"

/**
 * The state of one rendered form (ADR 0005). Plain TypeScript, no React:
 * each field has an immutable snapshot and its own subscribers, so a change
 * to one field notifies only the components showing that field.
 */

/** What the store needs to know about one input. */
export type FieldSpec = {
  /** The instance id. State is keyed by it. */
  readonly id: string
  /** The data path the value is submitted under. */
  readonly path: string
  readonly valueType: ValueType
  readonly defaultValue: FieldValue
  /** The message of the first broken rule, or null. */
  readonly validate: (value: FieldValue) => string | null
}

export type FieldState = {
  readonly value: FieldValue
  /** The error currently shown, if any. */
  readonly error: string | null
  /** Goes up on every reset, so controls know to drop any text they hold. */
  readonly resets: number
}

export type SubmitResult =
  | { readonly valid: true; readonly values: NestedValues }
  /** `firstInvalid` is the id of the first failing field in document order. */
  | { readonly valid: false; readonly firstInvalid: string }

const UNKNOWN_FIELD: FieldState = { value: null, error: null, resets: 0 }

export class FormStore {
  /** In document order, which is visual order. */
  readonly #fields: readonly FieldSpec[]
  readonly #specs = new Map<string, FieldSpec>()
  readonly #states = new Map<string, FieldState>()
  readonly #listeners = new Map<string, Set<() => void>>()
  /** Fields whose control holds text that cannot be read as a value. */
  readonly #unreadable = new Map<string, string>()
  /** How many components are showing each field for editing. */
  readonly #mounted = new Map<string, number>()

  constructor(fields: readonly FieldSpec[]) {
    this.#fields = fields
    for (const field of fields) {
      this.#specs.set(field.id, field)
      this.#states.set(field.id, { value: initialValue(field), error: null, resets: 0 })
    }
  }

  /** The current snapshot of a field. The same object until the field changes. */
  get(id: string): FieldState {
    return this.#states.get(id) ?? UNKNOWN_FIELD
  }

  /** Calls `listener` whenever that one field changes. Returns the unsubscribe. */
  subscribe(id: string, listener: () => void): () => void {
    let listeners = this.#listeners.get(id)
    if (!listeners) {
      listeners = new Set()
      this.#listeners.set(id, listeners)
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  /**
   * Sets a value. Nothing new is shown while a person types; a field that is
   * already showing an error is re-checked, so the error goes as soon as the
   * value is valid.
   */
  setValue(id: string, value: FieldValue): void {
    const spec = this.#specs.get(id)
    if (!spec) return
    this.#unreadable.delete(id)
    const current = this.get(id)
    const next = normaliseValue(spec.valueType, value)
    this.#update(id, {
      value: next,
      error: current.error === null ? null : this.#check(spec, next),
    })
  }

  /**
   * Records that the control holds text it cannot read as a value (letters
   * in a number field). The field then has no value and fails validation
   * with `message` until `setValue` is called.
   */
  setUnreadable(id: string, message: string): void {
    const spec = this.#specs.get(id)
    if (!spec) return
    this.#unreadable.set(id, message)
    const current = this.get(id)
    const value = normaliseValue(spec.valueType, null)
    this.#update(id, { value, error: current.error === null ? null : this.#check(spec, value) })
  }

  /** The person has left the field: validate it and show the result. */
  leave(id: string): void {
    const spec = this.#specs.get(id)
    if (!spec) return
    const { value } = this.get(id)
    this.#update(id, { value, error: this.#check(spec, value) })
  }

  /**
   * Marks a field as on screen for editing. Only mounted fields are
   * validated on submit, so a field that could not be rendered never blocks
   * the form. Returns the function that unmounts it.
   */
  mount(id: string): () => void {
    this.#mounted.set(id, (this.#mounted.get(id) ?? 0) + 1)
    return () => {
      const count = (this.#mounted.get(id) ?? 1) - 1
      if (count > 0) this.#mounted.set(id, count)
      else this.#mounted.delete(id)
    }
  }

  /** Validates every mounted field and shows every error. */
  submit(): SubmitResult {
    let firstInvalid: string | null = null
    for (const spec of this.#fields) {
      if (!this.#mounted.has(spec.id)) continue
      const { value } = this.get(spec.id)
      const error = this.#check(spec, value)
      this.#update(spec.id, { value, error })
      if (error !== null) firstInvalid ??= spec.id
    }
    return firstInvalid === null
      ? { valid: true, values: this.values() }
      : { valid: false, firstInvalid }
  }

  /** Every value back to its default, every error cleared. */
  reset(): void {
    this.#unreadable.clear()
    for (const spec of this.#fields) {
      const resets = this.get(spec.id).resets + 1
      this.#states.set(spec.id, { value: initialValue(spec), error: null, resets })
      this.#notify(spec.id)
    }
  }

  /** The current values, nested by data path. */
  values(): NestedValues {
    return nestByPath(this.#fields.map((spec) => [spec.path, this.get(spec.id).value] as const))
  }

  #check(spec: FieldSpec, value: FieldValue): string | null {
    return this.#unreadable.get(spec.id) ?? spec.validate(value)
  }

  #update(id: string, next: Pick<FieldState, "value" | "error">): void {
    const current = this.get(id)
    if (current.value === next.value && current.error === next.error) return
    this.#states.set(id, { ...next, resets: current.resets })
    this.#notify(id)
  }

  #notify(id: string): void {
    for (const listener of this.#listeners.get(id) ?? []) listener()
  }
}

function initialValue(spec: FieldSpec): FieldValue {
  return normaliseValue(spec.valueType, spec.defaultValue)
}
