import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { registry } from "@/forms/registry"
import type { ComponentInstance, FormDocument } from "@/generated"

import { form, personDetails, schema, seededRandom } from "../testing/documents"
import { type Command, createEditorState, type EditorState, runCommand } from "./editor"
import { nameBase } from "./names"
import { checkDocument, limitProblem } from "./rules"
import { allInstances, type Position, ROOT_REGION } from "./tree"

/**
 * C2-15: the designer never creates a document the server would reject.
 *
 * Random sequences of add, move, step, delete, duplicate, undo and redo are
 * run through the same `runCommand` the designer uses, from starting
 * documents of every awkward kind the server stores. After every command the
 * document is checked against the server's rules (`checkDocument`, which the
 * shared cases hold equal to the server's own) and its limits on a save.
 */

const TYPES = [...registry.keys()]

// --- Starting documents ------------------------------------------------------

/** Names a person might have given, including ones the generator would pick. */
const NAMES = ["textField1", "textField2", "columns1", "container1", "button1", "select1", "a", "b"]
/** Data paths that are not the instance's name, and can clash with a new one. */
const PATHS = ["person.first", "person.last", "textField3.inner", "datePicker1", "x.y.z"]
/** Types to build with: containers, inputs, a static one, and one this build does not have. */
const START_TYPES = ["columns", "container", "text-field", "select", "button", "mystery"]

/**
 * Builds a valid document from a list of numbers: each number decides the
 * next choice. Whatever the numbers, the server would store the result.
 */
function buildDocument(choices: readonly number[]): FormDocument {
  let next = 0
  const pick = (below: number) => (choices[next++ % Math.max(choices.length, 1)] ?? 0) % below
  let count = 0
  const names = new Set<string>()
  const paths = new Set<string>()

  function instance(depth: number): ComponentInstance {
    const type = START_TYPES[pick(START_TYPES.length)]
    const id = `x${count++}`
    const wanted = NAMES[pick(NAMES.length)]
    const name = names.has(wanted) ? `n${count}` : wanted
    names.add(name)

    const made: ComponentInstance = { id, type, name }
    if (type === "text-field" || type === "select" || type === "mystery") {
      // Bound to its name, to another path, or (wrongly, but storably) to nothing.
      const choice = pick(4)
      const path = choice === 0 ? null : choice === 1 ? PATHS[pick(PATHS.length)] : name
      const clashes =
        path !== null &&
        [...paths].some(
          (taken) => taken === path || taken.startsWith(`${path}.`) || path.startsWith(`${taken}.`),
        )
      if (path !== null && !clashes) {
        made.bind = path
        paths.add(path)
      }
    }
    if (type === "select") {
      made.settings = { label: "Choice", options: [{ label: "One", value: "1" }] }
    }
    if (
      depth < 4 &&
      count < 14 &&
      (type === "columns" || type === "container" || type === "mystery")
    ) {
      const regionNames =
        type === "container" ? ["content"] : ["col1", "col2", "col3", "col4", "content"]
      const regions: Record<string, ComponentInstance[]> = {}
      for (const regionName of regionNames) {
        const children = pick(3)
        if (children > 0) {
          regions[regionName] = Array.from({ length: children }, () => instance(depth + 1))
        }
      }
      if (Object.keys(regions).length > 0) made.regions = regions
      if (type === "columns" && pick(2) === 0) made.settings = { columns: 2 + pick(3) }
    }
    return made
  }

  const top = pick(5)
  return form(Array.from({ length: top }, () => instance(1)))
}

/** Containers nested as deep as the server reads, so that depth is tested at its edge. */
function deepDocument(levels: number): FormDocument {
  let chain: ComponentInstance = { id: "d0", type: "container", name: "deep0" }
  for (let level = 1; level < levels; level++) {
    chain = {
      id: `d${level}`,
      type: "container",
      name: `deep${level}`,
      regions: { content: [chain] },
    }
  }
  return form([chain, { id: "loose", type: "container", name: "loose" }])
}

/**
 * Inputs whose data paths are exactly the ones new instances would be given
 * (`textField1`), or sit under them (`select2.inner`), under other names.
 */
function clashingDocument(choices: readonly boolean[]): FormDocument {
  const inputs = [...registry.values()].filter((definition) => definition.kind === "input")
  const components: ComponentInstance[] = []
  let next = 0
  for (const definition of inputs) {
    const base = nameBase(definition.type)
    for (const number of [1, 2, 3]) {
      for (const path of [`${base}${number}`, `${base}${number}.inner`]) {
        if (choices[next++ % choices.length]) {
          components.push({ id: `k${next}`, type: "text-field", name: `taken${next}`, bind: path })
          break
        }
      }
    }
  }
  return form(components)
}

const startingDocument = fc.oneof(
  fc.constant(form()),
  fc.constant(personDetails()),
  fc.array(fc.nat(1000), { minLength: 1, maxLength: 60 }).map(buildDocument),
  fc.integer({ min: 36, max: 42 }).map(deepDocument),
  fc.array(fc.boolean(), { minLength: 1, maxLength: 50 }).map(clashingDocument),
)

// --- Commands ----------------------------------------------------------------

/** A command as numbers; what they mean is decided against the document at that moment. */
const step = fc.record({
  kind: fc.constantFrom(
    "add",
    "addAt",
    "move",
    "up",
    "down",
    "remove",
    "duplicate",
    "undo",
    "redo",
  ),
  a: fc.nat(10_000),
  b: fc.nat(10_000),
  c: fc.nat(10_000),
})

type Step = typeof step extends fc.Arbitrary<infer T> ? T : never

/** Any position at all: real ones, hidden ones, and ones that do not exist. */
function anyPosition(state: EditorState, a: number, b: number): Position {
  const instances = [...allInstances(state.document)]
  const regions = ["content", "col1", "col2", "col3", "col4", "nowhere"]
  const choice = a % (instances.length + 2)
  if (choice === instances.length) return { parent: null, region: ROOT_REGION, index: b % 6 }
  if (choice === instances.length + 1) return { parent: "missing", region: "content", index: 0 }
  return { parent: instances[choice].id, region: regions[b % regions.length], index: (a + b) % 5 }
}

function toCommand(state: EditorState, { kind, a, b, c }: Step): Command {
  const instances = [...allInstances(state.document)]
  const id = instances.length > 0 ? instances[a % instances.length].id : "missing"
  switch (kind) {
    case "add":
      return { type: "add", component: TYPES[b % TYPES.length] }
    case "addAt":
      return { type: "add", component: TYPES[b % TYPES.length], at: anyPosition(state, a, c) }
    case "move":
      return { type: "move", id, to: anyPosition(state, b, c) }
    case "up":
    case "down":
      return { type: "step", id, direction: kind }
    case "remove":
    case "duplicate":
    case "undo":
    case "redo":
      return kind === "undo" || kind === "redo" ? { type: kind } : { type: kind, id }
  }
}

// --- The property -------------------------------------------------------------

function expectStorable(document: FormDocument, context: string) {
  expect(checkDocument(document), context).toEqual([])
  expect(limitProblem(document), context).toBeNull()
  // What is sent is the JSON: nothing may be lost or change on the way.
  expect(JSON.parse(JSON.stringify(document)), context).toEqual(document)
}

describe("C2-15 the designer never creates a document the server would reject", () => {
  it("the starting documents are themselves storable", () => {
    fc.assert(
      fc.property(startingDocument, (document) => {
        expectStorable(document, "start")
      }),
      { numRuns: 300 },
    )
  })

  it("whatever commands are run, in whatever order", () => {
    fc.assert(
      fc.property(
        startingDocument,
        fc.array(step, { maxLength: 40 }),
        fc.nat(),
        (start, steps, seed) => {
          const environment = { schema, random: seededRandom(seed) }
          let state = createEditorState(start)
          // Sometimes something is selected, so "add" lands in different places.
          const first = [...allInstances(start)][seed % 7]
          if (first) state = runCommand(state, { type: "select", id: first.id }, environment).state

          for (const [index, numbers] of steps.entries()) {
            const command = toCommand(state, numbers)
            const before = state
            const result = runCommand(state, command, environment)
            const context = `step ${index}: ${JSON.stringify(command)}`
            state = result.state

            expectStorable(state.document, context)

            // The selection is always an instance of the document, or nothing.
            if (state.selection !== null) {
              const ids = [...allInstances(state.document)].map((instance) => instance.id)
              expect(ids, context).toContain(state.selection)
            }

            if (!result.changed) {
              // A refused command changes nothing at all.
              expect(state.document, context).toBe(before.document)
              expect(state.past, context).toBe(before.past)
              continue
            }
            if (command.type === "undo" || command.type === "redo") continue

            // Undo gives back the very document from before, and redo this one.
            const undone = runCommand(state, { type: "undo" }, environment).state
            expect(undone.document, context).toBe(before.document)
            expect(undone.selection, context).toBe(before.selection)
            const redone = runCommand(undone, { type: "redo" }, environment).state
            expect(redone.document, context).toBe(state.document)
          }
        },
      ),
      { numRuns: 400 },
    )
  })

  it("new instances follow the id, name, data path and settings rules", () => {
    fc.assert(
      fc.property(
        startingDocument,
        fc.array(fc.record({ type: fc.constantFrom(...TYPES), duplicate: fc.boolean() }), {
          minLength: 1,
          maxLength: 12,
        }),
        fc.nat(),
        (start, additions, seed) => {
          const environment = { schema, random: seededRandom(seed) }
          let state = createEditorState(start)
          const existing = new Set([...allInstances(start)].map((instance) => instance.id))

          for (const { type, duplicate } of additions) {
            const added = runCommand(state, { type: "add", component: type }, environment)
            if (!added.changed) continue
            state = added.state
            const instance = [...allInstances(state.document)].find(
              (candidate) => candidate.id === state.selection,
            )!
            const definition = registry.get(type)!

            expect(instance.id).toMatch(/^c_[0-9a-hjkmnp-tv-z]{10}$/)
            expect(existing.has(instance.id)).toBe(false)
            expect(instance.name).toMatch(/^[a-z][A-Za-z0-9]*[1-9][0-9]*$/)
            expect(instance.bind).toBe(definition.kind === "input" ? instance.name : undefined)
            expect(instance).not.toHaveProperty("settings")
            expect(instance).not.toHaveProperty("styles")
            expect(instance).not.toHaveProperty("regions")

            if (duplicate) {
              state = runCommand(state, { type: "duplicate", id: instance.id }, environment).state
            }
          }

          const all = [...allInstances(state.document)]
          expect(new Set(all.map((instance) => instance.id)).size).toBe(all.length)
          expect(new Set(all.map((instance) => instance.name)).size).toBe(all.length)
        },
      ),
      { numRuns: 200 },
    )
  })
})
