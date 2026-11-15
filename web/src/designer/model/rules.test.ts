import { describe, expect, it } from "vitest"

import { MAX_JSON_DEPTH, MAX_REQUEST_BYTES } from "@/generated"

import { container, field, form, personDetails, ruleCases } from "../testing/documents"
import { checkDocument, limitProblem } from "./rules"
import { jsonDepth } from "./tree"

describe("the designer's copy of the server's rules", () => {
  it("has the shared cases to run", () => {
    expect(ruleCases.length).toBeGreaterThan(50)
  })

  // The server runs the same file: crates/server/tests/document_rules.rs.
  it.each(ruleCases)("agrees with the server on: $name", ({ document, problems }) => {
    const found = checkDocument(document).map((problem) => problem.path)
    expect(found.sort()).toEqual([...problems].sort())
  })

  it("accepts the seeded demo form", () => {
    expect(checkDocument(personDetails())).toEqual([])
  })

  it("gives every problem a message for a person", () => {
    for (const { document } of ruleCases) {
      for (const problem of checkDocument(document)) expect(problem.message).toMatch(/\S/)
    }
  })
})

describe("the limits on a save", () => {
  /** A chain of containers `levels` deep. */
  function nested(levels: number) {
    let instance = container("box0")
    for (let level = 1; level < levels; level++) instance = container(`box${level}`, [instance])
    return form([instance])
  }

  it("allows JSON nested to the server's limit and no deeper", () => {
    // The save wraps the document in one more object.
    const deepest = Array.from({ length: 60 }, (_, index) => nested(index + 1)).filter(
      (document) => jsonDepth(document) + 1 <= MAX_JSON_DEPTH,
    )
    const levels = deepest.length
    expect(limitProblem(nested(levels))).toBeNull()
    expect(limitProblem(nested(levels + 1))).toBe("too-deep")
    // A top-level instance is level 4 of a save; each container adds 3.
    expect(levels).toBe(Math.floor((MAX_JSON_DEPTH - 4) / 3) + 1)
  })

  it("counts what is inside settings too", () => {
    const levels = Math.floor((MAX_JSON_DEPTH - 4) / 3) + 1
    const document = nested(levels)
    let innermost = document.components[0]
    while (innermost.regions) innermost = innermost.regions.content[0]
    const deepSetting = { ...innermost, settings: { options: [{ label: "A", value: "a" }] } }
    const withSetting = JSON.parse(
      JSON.stringify(document).replace(JSON.stringify(innermost), JSON.stringify(deepSetting)),
    )
    expect(limitProblem(withSetting)).toBe("too-deep")
  })

  it("allows a save of exactly the server's size limit and not a byte more", () => {
    const sized = (labelLength: number) =>
      form([{ ...field("a"), settings: { label: "x".repeat(labelLength) } }])
    const overhead = JSON.stringify({ revision: 4294967295, document: sized(0) }).length
    const room = MAX_REQUEST_BYTES - overhead

    expect(limitProblem(sized(room))).toBeNull()
    expect(limitProblem(sized(room + 1))).toBe("too-large")
  })

  it("measures size in bytes, not characters", () => {
    // "é" is one character and two bytes.
    const document = form([
      { ...field("a"), settings: { label: "é".repeat(MAX_REQUEST_BYTES / 2) } },
    ])
    expect(JSON.stringify(document).length).toBeLessThan(MAX_REQUEST_BYTES)
    expect(limitProblem(document)).toBe("too-large")
  })
})
