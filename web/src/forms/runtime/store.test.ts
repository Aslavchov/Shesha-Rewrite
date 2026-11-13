import { describe, expect, it, vi } from "vitest"

import { type FieldSpec, FormStore } from "./store"
import type { FieldValue } from "./values"

const requiredText = (value: FieldValue) => (value === null ? "Required" : null)

function spec(overrides: Partial<FieldSpec> & Pick<FieldSpec, "id">): FieldSpec {
  return {
    path: overrides.id,
    valueType: "text",
    defaultValue: null,
    validate: () => null,
    ...overrides,
  }
}

/** A store whose fields are all on screen, as they are once a form has rendered. */
function mounted(fields: FieldSpec[]) {
  const store = new FormStore(fields)
  for (const field of fields) store.mount(field.id)
  return store
}

describe("FormStore: values", () => {
  it("starts every field at its default, normalised", () => {
    const store = new FormStore([
      spec({ id: "a" }),
      spec({ id: "b", defaultValue: "hello" }),
      spec({ id: "c", defaultValue: "" }),
      spec({ id: "d", valueType: "boolean" }),
      spec({ id: "e", valueType: "boolean", defaultValue: true }),
      spec({ id: "f", valueType: "number", defaultValue: 3 }),
    ])

    expect(store.values()).toEqual({ a: null, b: "hello", c: null, d: false, e: true, f: 3 })
  })

  it("stores an empty text as null and never as an empty string", () => {
    const store = new FormStore([spec({ id: "a", defaultValue: "x" })])

    store.setValue("a", "")

    expect(store.get("a").value).toBeNull()
  })

  it("nests values by data path", () => {
    const store = new FormStore([
      spec({ id: "1", path: "firstName", defaultValue: "Ada" }),
      spec({
        id: "2",
        path: "contact.preferredMethod",
        valueType: "option",
        defaultValue: "email",
      }),
      spec({ id: "3", path: "preferences.subscribe", valueType: "boolean", defaultValue: true }),
      spec({ id: "4", path: "preferences.acceptTerms", valueType: "boolean" }),
    ])

    expect(store.values()).toEqual({
      firstName: "Ada",
      contact: { preferredMethod: "email" },
      preferences: { subscribe: true, acceptTerms: false },
    })
  })

  it("ignores a field it does not have", () => {
    const store = new FormStore([spec({ id: "a" })])

    store.setValue("nope", "x")
    store.leave("nope")

    expect(store.get("nope")).toEqual({ value: null, error: null, resets: 0 })
    expect(store.values()).toEqual({ a: null })
  })
})

describe("FormStore: subscriptions", () => {
  it("notifies only the subscribers of the field that changed", () => {
    const store = new FormStore([spec({ id: "a" }), spec({ id: "b" })])
    const onA = vi.fn()
    const onB = vi.fn()
    store.subscribe("a", onA)
    store.subscribe("b", onB)

    store.setValue("a", "x")

    expect(onA).toHaveBeenCalledTimes(1)
    expect(onB).not.toHaveBeenCalled()
  })

  it("keeps the same snapshot until the field changes", () => {
    const store = new FormStore([spec({ id: "a" }), spec({ id: "b" })])
    const before = store.get("a")
    const listener = vi.fn()
    store.subscribe("a", listener)

    store.setValue("b", "x")
    store.setValue("a", null)

    expect(store.get("a")).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  it("stops notifying after unsubscribe", () => {
    const store = new FormStore([spec({ id: "a" })])
    const listener = vi.fn()
    const unsubscribe = store.subscribe("a", listener)

    unsubscribe()
    store.setValue("a", "x")

    expect(listener).not.toHaveBeenCalled()
  })
})

describe("FormStore: when errors appear", () => {
  const fields = [spec({ id: "a", validate: requiredText })]

  it("shows nothing while a value is first typed", () => {
    const store = mounted(fields)

    store.setValue("a", "x")
    store.setValue("a", "")

    expect(store.get("a").error).toBeNull()
  })

  it("shows the error when the field is left", () => {
    const store = mounted(fields)

    store.leave("a")

    expect(store.get("a").error).toBe("Required")
  })

  it("clears a shown error as soon as the value is valid", () => {
    const store = mounted(fields)
    store.leave("a")

    store.setValue("a", "x")

    expect(store.get("a").error).toBeNull()
  })

  it("keeps a shown error's text current while the value stays invalid", () => {
    const validate = (value: FieldValue) =>
      value === null ? "Required" : String(value).length < 3 ? "Too short" : null
    const store = mounted([spec({ id: "a", validate })])
    store.leave("a")

    store.setValue("a", "x")
    expect(store.get("a").error).toBe("Too short")

    store.setValue("a", "xyz")
    expect(store.get("a").error).toBeNull()
  })
})

describe("FormStore: unreadable text", () => {
  const fields = [spec({ id: "n", valueType: "number", defaultValue: 4 })]

  it("has no value and fails validation until a value is set", () => {
    const store = mounted(fields)

    store.setUnreadable("n", "Enter a number")
    expect(store.get("n")).toMatchObject({ value: null, error: null })

    store.leave("n")
    expect(store.get("n").error).toBe("Enter a number")
    expect(store.submit()).toEqual({ valid: false, firstInvalid: "n" })

    store.setValue("n", 7)
    expect(store.get("n")).toMatchObject({ value: 7, error: null })
    expect(store.submit()).toEqual({ valid: true, values: { n: 7 } })
  })

  it("is forgotten on reset", () => {
    const store = mounted(fields)
    store.setUnreadable("n", "Enter a number")

    store.reset()

    expect(store.submit()).toEqual({ valid: true, values: { n: 4 } })
  })
})

describe("FormStore: submit", () => {
  const fields = [
    spec({ id: "a" }),
    spec({ id: "b", validate: requiredText }),
    spec({ id: "c", validate: requiredText }),
  ]

  it("shows every error and names the first invalid field in document order", () => {
    const store = mounted(fields)

    expect(store.submit()).toEqual({ valid: false, firstInvalid: "b" })
    expect(store.get("a").error).toBeNull()
    expect(store.get("b").error).toBe("Required")
    expect(store.get("c").error).toBe("Required")
  })

  it("hands back the nested values when everything is valid", () => {
    const store = mounted(fields)
    store.setValue("b", "x")
    store.setValue("c", "y")

    expect(store.submit()).toEqual({ valid: true, values: { a: null, b: "x", c: "y" } })
  })

  it("validates only fields that are on screen", () => {
    const store = new FormStore(fields)
    const unmountC = store.mount("c")

    expect(store.submit()).toEqual({ valid: false, firstInvalid: "c" })
    expect(store.get("b").error).toBeNull()

    unmountC()
    expect(store.submit()).toEqual({ valid: true, values: { a: null, b: null, c: null } })
  })

  it("counts mounts, so a field shown twice stays mounted until both are gone", () => {
    const store = new FormStore(fields)
    const first = store.mount("b")
    const second = store.mount("b")

    first()
    expect(store.submit().valid).toBe(false)

    second()
    store.setValue("b", null)
    expect(store.submit().valid).toBe(true)
  })
})

describe("FormStore: reset", () => {
  it("returns every value to its default, clears every error and counts the reset", () => {
    const store = mounted([
      spec({ id: "a", defaultValue: "start", validate: requiredText }),
      spec({ id: "b", valueType: "boolean", defaultValue: true }),
      spec({ id: "c", validate: requiredText }),
    ])
    const listener = vi.fn()
    store.subscribe("c", listener)
    store.setValue("a", "")
    store.setValue("b", false)
    store.submit()
    expect(store.get("a").error).toBe("Required")
    listener.mockClear()

    store.reset()

    expect(store.values()).toEqual({ a: "start", b: true, c: null })
    for (const id of ["a", "b", "c"]) {
      expect(store.get(id)).toMatchObject({ error: null, resets: 1 })
    }
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
