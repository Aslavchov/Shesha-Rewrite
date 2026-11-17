import { describe, expect, it } from "vitest"

import { gridTarget } from "./grid-keys"

describe("the keys of a grid that is one Tab stop (Phase 5, section 8)", () => {
  // Eight items in rows of three: the last row holds two.
  const go = (key: string, index: number) => gridTarget(key, index, 8, 3)

  it("moves along the reading order with left and right, and stops at the ends", () => {
    expect(go("ArrowRight", 0)).toBe(1)
    expect(go("ArrowRight", 2)).toBe(3)
    expect(go("ArrowRight", 7)).toBe(7)
    expect(go("ArrowLeft", 3)).toBe(2)
    expect(go("ArrowLeft", 0)).toBe(0)
  })

  it("moves by a row with up and down", () => {
    expect(go("ArrowDown", 1)).toBe(4)
    expect(go("ArrowUp", 4)).toBe(1)
    expect(go("ArrowUp", 1)).toBe(1)
    expect(go("ArrowDown", 6)).toBe(6)
  })

  it("goes to the last item from above the gap in a short last row", () => {
    expect(go("ArrowDown", 5)).toBe(7)
  })

  it("goes to the ends with Home and End", () => {
    expect(go("Home", 5)).toBe(0)
    expect(go("End", 2)).toBe(7)
  })

  it("leaves every other key alone", () => {
    expect(go("Enter", 2)).toBeNull()
    expect(go("Tab", 2)).toBeNull()
    expect(go("a", 2)).toBeNull()
  })
})
