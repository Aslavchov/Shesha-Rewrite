import { afterEach, beforeEach, expect, vi } from "vitest"

/**
 * "Zero console errors or warnings" (CLAUDE.md) applies to unit tests too:
 * every test fails if anything is written to console.error or console.warn,
 * unless the test says it expects that by calling `expectConsoleProblems()`.
 */

let problems: string[] = []
let expected = false

export function installConsoleGuard() {
  beforeEach(() => {
    problems = []
    expected = false
    for (const level of ["error", "warn"] as const) {
      vi.spyOn(console, level).mockImplementation((...parts: unknown[]) => {
        problems.push(`console.${level}: ${parts.map(String).join(" ")}`)
      })
    }
  })

  afterEach(() => {
    if (!expected) expect(problems).toEqual([])
  })
}

/**
 * Call at the start of a test that is meant to cause console output.
 * Returns the messages seen so far, as a live list.
 */
export function expectConsoleProblems(): readonly string[] {
  expected = true
  return problems
}
