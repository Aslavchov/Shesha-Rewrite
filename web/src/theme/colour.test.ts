import { describe, expect, it } from "vitest"

import { contrast, isHex, luminance, mix, toHex, toOklch } from "./colour"

describe("colour arithmetic", () => {
  it("reads and writes hex through OKLCH without drift", () => {
    for (const hex of ["#003bb2", "#0f766e", "#ffe600", "#ffffff", "#000000", "#e40017"]) {
      expect(toHex(toOklch(hex))).toBe(hex)
    }
  })

  it("finds the brand blue's hue, as ADR 0002 records it", () => {
    expect(toOklch("#003BB2").h).toBeCloseTo(262.4, 0)
  })

  it("measures contrast as WCAG does", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5)
    expect(contrast("#003bb2", "#ffffff")).toBeCloseTo(9.26, 1)
    expect(contrast("#777777", "#777777")).toBe(1)
    expect(luminance("#ffffff")).toBe(1)
  })

  it("keeps lightness and hue when a colour is outside what a screen shows", () => {
    const hex = toHex({ l: 0.7, c: 0.4, h: 150 })
    expect(isHex(hex)).toBe(true)
    expect(toOklch(hex).l).toBeCloseTo(0.7, 1)
    expect(toOklch(hex).h).toBeCloseTo(150, -1)
  })

  it("mixes through OKLab", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000")
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff")
    const middle = toOklch(mix("#000000", "#ffffff", 0.5)).l
    expect(middle).toBeCloseTo(0.5, 2)
  })

  it("accepts only #RRGGBB as a theme colour", () => {
    expect(isHex("#0F766E")).toBe(true)
    expect(isHex("#0F766E80")).toBe(false)
    expect(isHex("teal")).toBe(false)
    expect(isHex(null)).toBe(false)
  })
})
