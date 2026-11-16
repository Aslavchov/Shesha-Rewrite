import { describe, expect, it } from "vitest"

import { nameProblem, toName, unique, withArticle } from "./names"

describe("names on the Entities page", () => {
  it("makes an identifier from a display name", () => {
    expect(toName("Date of birth")).toBe("dateOfBirth")
    expect(toName("  Fuel type ")).toBe("fuelType")
    expect(toName("2nd line")).toBe("n2ndLine")
    expect(toName("Café")).toBe("cafe")
  })

  it("finds a name that is free, and says why one cannot be used", () => {
    expect(unique("item", ["item", "item2"])).toBe("item3")
    expect(nameProblem("", [])).toBe("Give it a name.")
    expect(nameProblem("first name", [])).toMatch(/letters, digits and _/)
    expect(nameProblem("Email", ["email"])).toBe("That name is already used.")
    expect(nameProblem("email", [])).toBeNull()
  })

  it("puts a or an before a noun", () => {
    expect(withArticle("organisation")).toBe("an organisation")
    expect(withArticle("person")).toBe("a person")
    expect(withArticle("entity")).toBe("an entity")
  })
})
