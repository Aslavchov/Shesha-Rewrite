import { describe, expect, it } from "vitest"

import tokens from "@/styles/tokens.css?raw"

import {
  COLOR_TOKENS,
  FONT_WEIGHTS,
  RADIUS_STEPS,
  resolveSlots,
  slotStyle,
  SPACE_STEPS,
} from "./styles"

describe("slotStyle", () => {
  it("writes each typed property as a token reference or the literal colour", () => {
    const { style, problems } = slotStyle("label", {
      color: "#003BB2",
      background: { token: "muted" },
      borderColor: "#003bb280",
      radius: "2xl",
      fontWeight: "semibold",
      padding: "sm",
    })

    expect(style).toEqual({
      color: "#003BB2",
      backgroundColor: "var(--sys-color-muted)",
      borderColor: "#003bb280",
      borderRadius: "var(--sys-radius-2xl)",
      fontWeight: "var(--sys-font-weight-semibold)",
      padding: "var(--sys-space-sm)",
    })
    expect(problems).toEqual([])
  })

  it("holds only what was overridden", () => {
    expect(slotStyle("label", { color: "#000000" }).style).toEqual({ color: "#000000" })
    expect(slotStyle("label", {}).style).toBeUndefined()
  })

  it("ignores and reports anything that is not a typed value", () => {
    const { style, problems } = slotStyle("control", {
      color: "red",
      background: "url(javascript:alert(1))",
      borderColor: { token: "no-such-token" },
      radius: "12px",
      fontWeight: 700,
      padding: "1rem",
      margin: "md",
    })

    expect(style).toBeUndefined()
    expect(problems).toHaveLength(7)
    expect(problems.every((problem) => problem.slot === "control")).toBe(true)
  })

  it("accepts #RRGGBB and #RRGGBBAA and nothing shorter or longer", () => {
    const colourOf = (value: string) => slotStyle("label", { color: value }).style?.color
    expect(colourOf("#abcdef")).toBe("#abcdef")
    expect(colourOf("#ABCDEF80")).toBe("#ABCDEF80")
    expect(colourOf("#abc")).toBeUndefined()
    expect(colourOf("#abcde")).toBeUndefined()
    expect(colourOf("abcdef")).toBeUndefined()
    expect(colourOf("#abcdef; color: red")).toBeUndefined()
  })
})

describe("resolveSlots", () => {
  const slots = ["root", "label", "control"] as const

  it("gives every declared slot its props, and the root the instance's test id", () => {
    const resolved = resolveSlots(slots, "email", { label: { color: "#003BB2" } })

    expect(resolved.slots).toEqual({
      root: { "data-testid": "field-email" },
      label: { style: { color: "#003BB2" } },
      control: {},
    })
    expect(resolved.problems).toEqual([])
  })

  it("works with no styles at all", () => {
    expect(resolveSlots(slots, "email", undefined).slots).toEqual({
      root: { "data-testid": "field-email" },
      label: {},
      control: {},
    })
  })

  it("styles the root like any other slot", () => {
    const { slots: resolved } = resolveSlots(slots, "box", { root: { padding: "md" } })

    expect(resolved.root).toEqual({
      style: { padding: "var(--sys-space-md)" },
      "data-testid": "field-box",
    })
  })

  it("ignores and reports a slot the component does not have", () => {
    const resolved = resolveSlots(slots, "email", { popup: { color: "#000000" } })

    expect(resolved.slots).not.toHaveProperty("popup")
    expect(resolved.problems).toEqual([{ slot: "popup", message: expect.any(String) }])
  })
})

describe("the scales match tokens.css", () => {
  const defined = (prefix: string) =>
    new Set([...tokens.matchAll(new RegExp(`--sys-${prefix}-([a-z0-9-]+):`, "g"))].map((m) => m[1]))

  it("every colour token a document may name exists, and none is missing from the list", () => {
    expect([...COLOR_TOKENS].sort()).toEqual([...defined("color")].sort())
  })

  it("every radius, weight and space step exists", () => {
    const radius = defined("radius")
    const weight = defined("font-weight")
    const space = defined("space")
    for (const step of RADIUS_STEPS) expect(radius, step).toContain(step)
    for (const step of FONT_WEIGHTS) expect(weight, step).toContain(step)
    for (const step of SPACE_STEPS) expect(space, step).toContain(step)
  })
})
