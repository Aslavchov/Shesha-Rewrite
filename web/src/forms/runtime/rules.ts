import { formatDate } from "./dates"
import {
  compilePattern,
  optionalDate,
  optionalNumber,
  optionalPattern,
  toggle,
  type Messages,
} from "./settings"

/**
 * Validation rules (ADR 0005). A rule reads its parameter from the setting
 * of the same name, and returns its default message when the value breaks
 * it. `S` names the settings a rule needs, so a definition that lists a rule
 * without declaring its setting does not compile.
 */
export type Rule<V, S> = {
  /** Also the key of this rule's custom message in the `messages` setting. */
  readonly id: string
  readonly label: string
  /** The default message if `value` breaks the rule, otherwise null. */
  readonly check: (value: V | null, settings: S) => string | null
}

/** The first broken rule's message: the instance's own if it set one. */
export function runRules<V, S>(
  rules: readonly Rule<V, S>[],
  value: V | null,
  settings: S,
  messages: Messages,
): string | null {
  for (const rule of rules) {
    const message = rule.check(value, settings)
    if (message !== null) return messages[rule.id] ?? message
  }
  return null
}

// --- Settings the rules read ---------------------------------------------

export const requiredSetting = toggle({
  label: "Required",
  help: "A value must be given before the form can be submitted.",
  group: "validation",
  default: false,
})

export const minLengthSetting = optionalNumber({
  label: "Minimum length",
  help: "The fewest characters allowed.",
  group: "validation",
  min: 0,
  whole: true,
})

export const maxLengthSetting = optionalNumber({
  label: "Maximum length",
  help: "The most characters allowed.",
  group: "validation",
  min: 0,
  whole: true,
})

export const patternSetting = optionalPattern({
  label: "Pattern",
  help: "A regular expression the whole value must match.",
  group: "validation",
})

export const minSetting = optionalNumber({
  label: "Minimum",
  help: "The smallest number allowed.",
  group: "validation",
})

export const maxSetting = optionalNumber({
  label: "Maximum",
  help: "The largest number allowed.",
  group: "validation",
})

export const wholeNumberSetting = toggle({
  label: "Whole numbers only",
  group: "validation",
  default: false,
})

export const minDateSetting = optionalDate({
  label: "Earliest date",
  group: "validation",
})

export const maxDateSetting = optionalDate({
  label: "Latest date",
  group: "validation",
})

// --- Rules ---------------------------------------------------------------

/** A value must be present. Text made only of spaces does not count. */
export const required: Rule<string | number, { required: boolean }> = {
  id: "required",
  label: "Required",
  check: (value, settings) => {
    const empty = value === null || (typeof value === "string" && value.trim() === "")
    return settings.required && empty ? "This field is required" : null
  },
}

/** For a checkbox, required means it must be checked. */
export const requiredChecked: Rule<boolean, { required: boolean }> = {
  id: "required",
  label: "Required",
  check: (value, settings) =>
    settings.required && value !== true ? "This box must be checked" : null,
}

/** Length as people count it: by character, not by UTF-16 unit. */
const lengthOf = (value: string) => Array.from(value).length

const characters = (count: number) => (count === 1 ? "1 character" : `${count} characters`)

export const minLength: Rule<string, { minLength: number | null }> = {
  id: "minLength",
  label: "Minimum length",
  check: (value, { minLength: limit }) =>
    value !== null && limit !== null && lengthOf(value) < limit
      ? `Enter at least ${characters(limit)}`
      : null,
}

export const maxLength: Rule<string, { maxLength: number | null }> = {
  id: "maxLength",
  label: "Maximum length",
  check: (value, { maxLength: limit }) =>
    value !== null && limit !== null && lengthOf(value) > limit
      ? `Enter no more than ${characters(limit)}`
      : null,
}

export const pattern: Rule<string, { pattern: string | null }> = {
  id: "pattern",
  label: "Pattern",
  check: (value, { pattern: source }) => {
    if (value === null || source === null) return null
    const expression = compilePattern(source)
    return expression && !expression.test(value) ? "Enter a value in the expected format" : null
  },
}

export const min: Rule<number, { min: number | null }> = {
  id: "min",
  label: "Minimum",
  check: (value, { min: limit }) =>
    value !== null && limit !== null && value < limit
      ? `Enter a number that is ${limit} or more`
      : null,
}

export const max: Rule<number, { max: number | null }> = {
  id: "max",
  label: "Maximum",
  check: (value, { max: limit }) =>
    value !== null && limit !== null && value > limit
      ? `Enter a number that is ${limit} or less`
      : null,
}

export const wholeNumber: Rule<number, { wholeNumber: boolean }> = {
  id: "wholeNumber",
  label: "Whole numbers only",
  check: (value, settings) =>
    value !== null && settings.wholeNumber && !Number.isInteger(value)
      ? "Enter a whole number"
      : null,
}

// "YYYY-MM-DD" strings sort in date order, so dates compare as text.
export const minDate: Rule<string, { minDate: string | null }> = {
  id: "minDate",
  label: "Earliest date",
  check: (value, { minDate: limit }) =>
    value !== null && limit !== null && value < limit
      ? `Enter a date on or after ${formatDate(limit)}`
      : null,
}

export const maxDate: Rule<string, { maxDate: string | null }> = {
  id: "maxDate",
  label: "Latest date",
  check: (value, { maxDate: limit }) =>
    value !== null && limit !== null && value > limit
      ? `Enter a date on or before ${formatDate(limit)}`
      : null,
}
