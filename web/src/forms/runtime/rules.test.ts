import { describe, expect, it } from "vitest"

import {
  max,
  maxDate,
  maxLength,
  min,
  minDate,
  minLength,
  pattern,
  required,
  requiredChecked,
  runRules,
  wholeNumber,
} from "./rules"

describe("rules", () => {
  it("required: no value or only spaces", () => {
    expect(required.check(null, { required: true })).toBe("This field is required")
    expect(required.check("  ", { required: true })).toBe("This field is required")
    expect(required.check("a", { required: true })).toBeNull()
    expect(required.check(0, { required: true })).toBeNull()
    expect(required.check(null, { required: false })).toBeNull()
  })

  it("required on a checkbox means checked", () => {
    expect(requiredChecked.check(false, { required: true })).toBe("This box must be checked")
    expect(requiredChecked.check(null, { required: true })).toBe("This box must be checked")
    expect(requiredChecked.check(true, { required: true })).toBeNull()
    expect(requiredChecked.check(false, { required: false })).toBeNull()
  })

  it("minimum and maximum length count characters", () => {
    expect(minLength.check("ab", { minLength: 3 })).toBe("Enter at least 3 characters")
    expect(minLength.check("abc", { minLength: 3 })).toBeNull()
    expect(minLength.check("", { minLength: 1 })).toBe("Enter at least 1 character")
    expect(minLength.check(null, { minLength: 3 })).toBeNull()
    expect(minLength.check("ab", { minLength: null })).toBeNull()

    expect(maxLength.check("abcd", { maxLength: 3 })).toBe("Enter no more than 3 characters")
    expect(maxLength.check("abc", { maxLength: 3 })).toBeNull()
    // Two emoji are two characters, though four UTF-16 units.
    expect(maxLength.check("😀😀", { maxLength: 2 })).toBeNull()
    expect(maxLength.check(null, { maxLength: 0 })).toBeNull()
  })

  it("pattern matches the whole value", () => {
    expect(pattern.check("abc", { pattern: "[a-z]+" })).toBeNull()
    expect(pattern.check("abc1", { pattern: "[a-z]+" })).toBe(
      "Enter a value in the expected format",
    )
    expect(pattern.check("b", { pattern: "a|b" })).toBeNull()
    expect(pattern.check("ab", { pattern: "a|b" })).not.toBeNull()
    expect(pattern.check(null, { pattern: "[a-z]+" })).toBeNull()
    expect(pattern.check("abc", { pattern: null })).toBeNull()
  })

  it("minimum, maximum and whole number", () => {
    expect(min.check(-1, { min: 0 })).toBe("Enter a number that is 0 or more")
    expect(min.check(0, { min: 0 })).toBeNull()
    expect(max.check(25, { max: 20 })).toBe("Enter a number that is 20 or less")
    expect(max.check(20, { max: 20 })).toBeNull()
    expect(wholeNumber.check(1.5, { wholeNumber: true })).toBe("Enter a whole number")
    expect(wholeNumber.check(2, { wholeNumber: true })).toBeNull()
    expect(wholeNumber.check(1.5, { wholeNumber: false })).toBeNull()
    for (const rule of [min, max]) {
      expect(rule.check(null, { min: 0, max: 0 })).toBeNull()
    }
  })

  it("earliest and latest date", () => {
    expect(minDate.check("1899-12-31", { minDate: "1900-01-01" })).toBe(
      "Enter a date on or after 1 January 1900",
    )
    expect(minDate.check("1900-01-01", { minDate: "1900-01-01" })).toBeNull()
    expect(maxDate.check("2027-01-01", { maxDate: "2026-12-31" })).toBe(
      "Enter a date on or before 31 December 2026",
    )
    expect(maxDate.check("2026-12-31", { maxDate: "2026-12-31" })).toBeNull()
    expect(minDate.check(null, { minDate: "1900-01-01" })).toBeNull()
  })
})

describe("runRules", () => {
  const settings = { required: true, minLength: 3, maxLength: 5 }
  const rules = [required, minLength, maxLength]

  it("returns the first broken rule's message, in the order listed", () => {
    expect(runRules(rules, null, settings, {})).toBe("This field is required")
    expect(runRules(rules, "ab", settings, {})).toBe("Enter at least 3 characters")
    expect(runRules(rules, "abcdef", settings, {})).toBe("Enter no more than 5 characters")
    expect(runRules(rules, "abcd", settings, {})).toBeNull()
  })

  it("prefers the instance's own message for the broken rule", () => {
    const messages = { minLength: "Too short" }
    expect(runRules(rules, "ab", settings, messages)).toBe("Too short")
    expect(runRules(rules, null, settings, messages)).toBe("This field is required")
  })
})
