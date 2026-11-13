import { describe, expect, it } from "vitest"

import {
  choice,
  messagesSetting,
  number,
  optionalDate,
  optionalNumber,
  optionalPattern,
  optionalProportions,
  optionalText,
  options,
  resolveSettings,
  space,
  text,
  toggle,
} from "./settings"

const meta = { label: "Thing", group: "general" } as const

describe("setting parsers", () => {
  it("text takes strings only", () => {
    const setting = text({ ...meta, default: "x" })
    expect(setting.parse("hello")).toBe("hello")
    expect(setting.parse("")).toBe("")
    expect(setting.parse(1)).toBeUndefined()
    expect(setting.parse(null)).toBeUndefined()
  })

  it("optional text treats empty as not set", () => {
    const setting = optionalText(meta)
    expect(setting.default).toBeNull()
    expect(setting.parse("hello")).toBe("hello")
    expect(setting.parse("")).toBeNull()
    expect(setting.parse(null)).toBeNull()
    expect(setting.parse(false)).toBeUndefined()
  })

  it("toggle takes booleans only", () => {
    const setting = toggle({ ...meta, default: false })
    expect(setting.parse(true)).toBe(true)
    expect(setting.parse("true")).toBeUndefined()
    expect(setting.parse(1)).toBeUndefined()
  })

  it("numbers respect whole, min and max", () => {
    const setting = number({ ...meta, default: 2, min: 2, max: 4, whole: true })
    expect(setting.parse(3)).toBe(3)
    expect(setting.parse(1)).toBeUndefined()
    expect(setting.parse(5)).toBeUndefined()
    expect(setting.parse(2.5)).toBeUndefined()
    expect(setting.parse("3")).toBeUndefined()
    expect(setting.parse(Number.NaN)).toBeUndefined()

    const optional = optionalNumber({ ...meta, min: 0 })
    expect(optional.default).toBeNull()
    expect(optional.parse(null)).toBeNull()
    expect(optional.parse(0)).toBe(0)
    expect(optional.parse(1.5)).toBe(1.5)
    expect(optional.parse(-1)).toBeUndefined()
  })

  it("choice takes one of its values", () => {
    const setting = choice({
      ...meta,
      default: "vertical",
      choices: [
        { value: "vertical", label: "Vertical" },
        { value: "horizontal", label: "Horizontal" },
      ],
    })
    expect(setting.parse("horizontal")).toBe("horizontal")
    expect(setting.parse("diagonal")).toBeUndefined()
    expect(setting.choices?.map((option) => option.value)).toEqual(["vertical", "horizontal"])
  })

  it("space takes a step of the space scale", () => {
    const setting = space({ ...meta, default: "md" })
    expect(setting.parse("xl")).toBe("xl")
    expect(setting.parse("2xl")).toBeUndefined()
    expect(setting.parse(16)).toBeUndefined()
  })

  it("dates are real calendar dates", () => {
    const setting = optionalDate(meta)
    expect(setting.parse("1900-01-01")).toBe("1900-01-01")
    expect(setting.parse(null)).toBeNull()
    expect(setting.parse("1900-02-30")).toBeUndefined()
    expect(setting.parse("01/01/1900")).toBeUndefined()
  })

  it("a pattern must compile", () => {
    const setting = optionalPattern(meta)
    expect(setting.parse("[a-z]+")).toBe("[a-z]+")
    expect(setting.parse("")).toBeNull()
    expect(setting.parse("(")).toBeUndefined()
    expect(setting.parse(5)).toBeUndefined()
  })

  it("options are label and value pairs with distinct, non-empty values", () => {
    const setting = options(meta)
    const good = [
      { label: "Email", value: "email" },
      { label: "Phone", value: "phone" },
    ]
    expect(setting.default).toEqual([])
    expect(setting.parse(good)).toEqual(good)
    expect(setting.parse([])).toEqual([])
    expect(setting.parse([{ label: "Email" }])).toBeUndefined()
    expect(setting.parse([{ label: "Email", value: "" }])).toBeUndefined()
    expect(setting.parse([good[0], good[0]])).toBeUndefined()
    expect(setting.parse("email")).toBeUndefined()
  })

  it("proportions are whole numbers of at least 1", () => {
    const setting = optionalProportions(meta)
    expect(setting.parse([1, 2])).toEqual([1, 2])
    expect(setting.parse(null)).toBeNull()
    expect(setting.parse([])).toBeUndefined()
    expect(setting.parse([1, 0])).toBeUndefined()
    expect(setting.parse([1, 1.5])).toBeUndefined()
    expect(setting.parse("1 2")).toBeUndefined()
  })

  it("messages are text keyed by rule", () => {
    expect(messagesSetting.parse({ required: "Enter a title" })).toEqual({
      required: "Enter a title",
    })
    expect(messagesSetting.parse({ required: 5 })).toBeUndefined()
    expect(messagesSetting.parse(["Enter a title"])).toBeUndefined()
  })
})

describe("resolveSettings", () => {
  const schema = {
    label: text({ label: "Label", group: "general", default: "Untitled" }),
    required: toggle({ label: "Required", group: "validation", default: false }),
    maxLength: optionalNumber({ label: "Maximum length", group: "validation", min: 0 }),
  }

  it("uses the default for everything an instance does not set", () => {
    expect(resolveSettings(schema, undefined)).toEqual({
      settings: { label: "Untitled", required: false, maxLength: null },
      problems: [],
    })
  })

  it("uses the stored value where it is valid", () => {
    const { settings, problems } = resolveSettings(schema, { label: "Name", maxLength: 50 })

    expect(settings).toEqual({ label: "Name", required: false, maxLength: 50 })
    expect(problems).toEqual([])
  })

  it("falls back to the default for an invalid value, and says so", () => {
    const { settings, problems } = resolveSettings(schema, { label: 7, required: "yes" })

    expect(settings).toEqual({ label: "Untitled", required: false, maxLength: null })
    expect(problems.map((problem) => problem.setting)).toEqual(["label", "required"])
    expect(problems[0].message).toContain("7")
  })

  it("reports a stored setting the component does not have", () => {
    const { settings, problems } = resolveSettings(schema, { colour: "red" })

    expect(settings).not.toHaveProperty("colour")
    expect(problems).toEqual([{ setting: "colour", message: expect.any(String) }])
  })

  it("never reads inherited keys", () => {
    const { settings, problems } = resolveSettings(schema, JSON.parse('{"__proto__": {"x": 1}}'))

    expect(settings.label).toBe("Untitled")
    expect(problems.map((problem) => problem.setting)).toEqual(["__proto__"])
  })
})
