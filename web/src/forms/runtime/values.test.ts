import { describe, expect, it } from "vitest"

import { isValueOfType, nestByPath, normaliseValue } from "./values"

describe("normaliseValue", () => {
  it("stores an empty string as null", () => {
    expect(normaliseValue("text", "")).toBeNull()
    expect(normaliseValue("option", "")).toBeNull()
    expect(normaliseValue("text", " ")).toBe(" ")
  })

  it("gives a boolean a value even when there is none", () => {
    expect(normaliseValue("boolean", null)).toBe(false)
    expect(normaliseValue("boolean", true)).toBe(true)
    expect(normaliseValue("boolean", "true")).toBe(false)
  })

  it("keeps numbers as numbers and drops what is not one", () => {
    expect(normaliseValue("number", 0)).toBe(0)
    expect(normaliseValue("number", 1.5)).toBe(1.5)
    expect(normaliseValue("number", "3")).toBeNull()
    expect(normaliseValue("number", Number.NaN)).toBeNull()
    expect(normaliseValue("number", Number.POSITIVE_INFINITY)).toBeNull()
  })

  it("keeps a date only as YYYY-MM-DD", () => {
    expect(normaliseValue("date", "1990-03-14")).toBe("1990-03-14")
    expect(normaliseValue("date", "14/03/1990")).toBeNull()
    expect(normaliseValue("date", "2023-02-30")).toBeNull()
  })
})

describe("isValueOfType", () => {
  it("tells each value type apart", () => {
    expect(isValueOfType.text("a")).toBe(true)
    expect(isValueOfType.text(1)).toBe(false)
    expect(isValueOfType.number(1)).toBe(true)
    expect(isValueOfType.number("1")).toBe(false)
    expect(isValueOfType.boolean(false)).toBe(true)
    expect(isValueOfType.date("2024-02-29")).toBe(true)
    expect(isValueOfType.date("2024-02-30")).toBe(false)
    expect(isValueOfType.option("email")).toBe(true)
  })
})

describe("nestByPath", () => {
  it("nests values by their dotted paths, keeping order", () => {
    const nested = nestByPath([
      ["firstName", "Ada"],
      ["contact.preferredMethod", "email"],
      ["dependants", 2],
      ["contact.address.city", null],
      ["preferences.subscribe", true],
    ])

    expect(nested).toEqual({
      firstName: "Ada",
      contact: { preferredMethod: "email", address: { city: null } },
      dependants: 2,
      preferences: { subscribe: true },
    })
    expect(Object.keys(nested)).toEqual(["firstName", "contact", "dependants", "preferences"])
  })

  it("treats names like __proto__ as plain keys", () => {
    const nested = nestByPath([
      ["__proto__.polluted", "yes"],
      ["constructor", "mine"],
    ])

    expect(Object.keys(nested)).toEqual(["__proto__", "constructor"])
    expect(JSON.parse(JSON.stringify(nested))).toEqual({
      ["__proto__"]: { polluted: "yes" },
      constructor: "mine",
    })
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined()
  })
})
