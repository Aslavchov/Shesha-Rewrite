import {
  type FieldValue,
  nestByPath,
  type NestedValues,
  normaliseValue,
  valueAtPath,
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

/** A problem the host found with a submitted value, by data path: a server's validation. */
export type PathProblem = { readonly path: string; readonly message: string }

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
  /** While held, fields that are left wait here instead of being validated. */
  readonly #left = new Set<string>()
  /** Problems shown by `showProblems`, until the field changes. */
  readonly #foreign = new Map<string, string>()
  #held = false
  /**
   * The values the form was opened with, by data path: a loaded row
   * (Phase 5, ADR 0011). A field starts from, and resets to, the value here,
   * or its default when there is none.
   */
  #loaded: NestedValues | undefined

  constructor(fields: readonly FieldSpec[], loaded?: NestedValues) {
    this.#fields = fields
    this.#loaded = loaded
    for (const field of fields) {
      this.#specs.set(field.id, field)
      this.#states.set(field.id, { value: this.#initial(field), error: null, resets: 0 })
    }
  }

  /**
   * Starts again from other loaded values: after a save, the row as the
   * server stored it; after a reload, the row as it is now. Errors go, and
   * controls drop any text they were holding.
   */
  load(loaded: NestedValues | undefined): void {
    this.#loaded = loaded
    this.reset()
  }

  /**
   * Shows problems found outside the form (a server's validation) on the
   * fields bound to their paths. Each goes when its field next changes to a
   * value the form's own rules accept. Returns the id of the first field, in
   * document order, that got one, and the problems no mounted field took.
   */
  showProblems(problems: readonly PathProblem[]): {
    readonly first: string | null
    readonly unplaced: readonly PathProblem[]
  } {
    const byPath = new Map(problems.map((problem) => [problem.path, problem]))
    let first: string | null = null
    for (const spec of this.#fields) {
      const problem = byPath.get(spec.path)
      if (!problem || !this.#mounted.has(spec.id)) continue
      byPath.delete(spec.path)
      this.#foreign.set(spec.id, problem.message)
      this.#update(spec.id, { value: this.get(spec.id).value, error: problem.message })
      first ??= spec.id
    }
    return { first, unplaced: [...byPath.values()] }
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
    this.#foreign.delete(id)
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
    this.#foreign.delete(id)
    const current = this.get(id)
    const value = normaliseValue(spec.valueType, null)
    this.#update(id, { value, error: current.error === null ? null : this.#check(spec, value) })
  }

  /** The person has left the field: validate it and show the result. */
  leave(id: string): void {
    const spec = this.#specs.get(id)
    if (!spec) return
    if (this.#held) {
      this.#left.add(id)
      return
    }
    const { value } = this.get(id)
    this.#update(id, { value, error: this.#check(spec, value) })
  }

  /**
   * Puts off the validation of fields that are left, until `release`. The
   * renderer holds while a pointer is pressed inside the form: pressing a
   * button takes focus from the field being edited, and an error appearing
   * under that field at that moment would move the button out from under the
   * pointer before the press is finished.
   */
  hold(): void {
    this.#held = true
  }

  /** Ends a `hold` and validates the fields that were left meanwhile. */
  release(): void {
    this.#held = false
    const left = [...this.#left]
    this.#left.clear()
    for (const id of left) this.leave(id)
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
    // Whoever found a problem outside the form is asked again.
    this.#foreign.clear()
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
    this.#foreign.clear()
    this.#left.clear()
    for (const spec of this.#fields) {
      const resets = this.get(spec.id).resets + 1
      this.#states.set(spec.id, { value: this.#initial(spec), error: null, resets })
      this.#notify(spec.id)
    }
  }

  /** The current values, nested by data path. */
  values(): NestedValues {
    return nestByPath(this.#fields.map((spec) => [spec.path, this.get(spec.id).value] as const))
  }

  #check(spec: FieldSpec, value: FieldValue): string | null {
    // A problem from outside stays until the value changes: leaving the
    // field, or pressing Save again, must not make it vanish unfixed.
    return (
      this.#unreadable.get(spec.id) ?? spec.validate(value) ?? this.#foreign.get(spec.id) ?? null
    )
  }

  #initial(spec: FieldSpec): FieldValue {
    const loaded = this.#loaded === undefined ? undefined : valueAtPath(this.#loaded, spec.path)
    return normaliseValue(spec.valueType, loaded === undefined ? spec.defaultValue : loaded)
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
