import { isIsoDate } from "./dates"

/** The value types an input can hold, and how each is stored (ADR 0005). */
export type ValueTypes = {
  text: string
  number: number
  boolean: boolean
  /** "YYYY-MM-DD" */
  date: string
  /** The chosen option's value. */
  option: string
}

export type ValueType = keyof ValueTypes

/** Any stored value. `null` means "no value". */
export type FieldValue = string | number | boolean | null

/**
 * Whether a stored value is of a value type. Renderers receive values
 * through these guards, so their types are checked rather than asserted.
 */
export const isValueOfType: { [K in ValueType]: (value: FieldValue) => value is ValueTypes[K] } = {
  text: (value): value is string => typeof value === "string",
  number: (value): value is number => typeof value === "number" && Number.isFinite(value),
  boolean: (value): value is boolean => typeof value === "boolean",
  date: (value): value is string => isIsoDate(value),
  option: (value): value is string => typeof value === "string",
}

/**
 * The stored form of a value: an empty string is no value, a boolean always
 * has one, and anything of the wrong type is dropped.
 */
export function normaliseValue(valueType: ValueType, value: FieldValue): FieldValue {
  if (valueType === "boolean") return value === true
  if (value === "" || value === null) return null
  return isValueOfType[valueType](value) ? value : null
}

/** Nests flat `[path, value]` pairs by their dotted paths. */
export function nestByPath(entries: Iterable<readonly [string, FieldValue]>): NestedValues {
  const root: NestedValues = {}
  for (const [path, value] of entries) {
    const segments = path.split(".")
    let target = root
    for (const segment of segments.slice(0, -1)) {
      const existing = Object.hasOwn(target, segment) ? target[segment] : undefined
      if (isNested(existing)) {
        target = existing
      } else {
        const next: NestedValues = {}
        define(target, segment, next)
        target = next
      }
    }
    define(target, segments[segments.length - 1], value)
  }
  return root
}

export type NestedValues = { [key: string]: FieldValue | NestedValues }

function isNested(value: FieldValue | NestedValues | undefined): value is NestedValues {
  return typeof value === "object" && value !== null
}

/** Sets an own property, even one named `__proto__`. */
function define(target: NestedValues, key: string, value: FieldValue | NestedValues) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  })
}
