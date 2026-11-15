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
 * C2-15 and C3-16: the designer never creates a document the server would
 * reject.
 *
 * Random sequences of add, move, step, delete, duplicate, undo and redo, and
 * since Phase 3 renames, data paths, settings, styles and the form's own name
 * and description, valid and invalid, some of them merged into runs, are
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
const START_TYPES = [
  "columns",
  "container",
  "tabs",
  "card",
  "text-field",
  "select",
  "radio-group",
  "button",
  "mystery",
]

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
    if (
      type === "text-field" ||
      type === "select" ||
      type === "radio-group" ||
      type === "mystery"
    ) {
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
      (type === "columns" ||
        type === "container" ||
        type === "tabs" ||
        type === "card" ||
        type === "mystery")
    ) {
      const regionNames =
        type === "container" || type === "card"
          ? ["content"]
          : type === "tabs"
            ? ["tab1", "tab2", "tab3"]
            : ["col1", "col2", "col3", "col4", "content"]
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
    "rename",
    "bind",
    "setting",
    "run",
    "reset",
    "style",
    "resetSlot",
    "formName",
    "formDescription",
    "endRun",
    "revertRun",
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

/** Names to try: valid, taken, too long, not identifiers. */
const NEW_NAMES = ["firstName", "a", "textField1", "first name", "1st", "", "$ok", "x".repeat(65)]
/** Data paths to try, valid and not. */
const NEW_PATHS = ["person.firstName", "person", "a", "x.y.z", "x..y", "1st", "", "textField1"]
/** Setting keys every kind of component has, some have, and none has. */
const KEYS = [
  "label",
  "required",
  "maxLength",
  "minLength",
  "placeholder",
  "columns",
  "gap",
  "tabs",
  "defaultTab",
  "options",
  "title",
  "variant",
  "messages",
  "nonsense",
]
/** Values to try for them, of every shape. */
const VALUES: unknown[] = [
  "Text",
  "",
  true,
  false,
  -3,
  0,
  2,
  3,
  5,
  4.5,
  null,
  "lg",
  "huge",
  [{ key: "tab1", label: "One" }],
  [
    { key: "tab1", label: "One" },
    { key: "tabX", label: "New" },
  ],
  [{ key: "1st", label: "Bad" }],
  [{ label: "A", value: "a" }],
  [
    { label: "A", value: "a" },
    { label: "B", value: "a" },
  ],
  { required: "Say something" },
  { nested: { deeper: [1, [2, [3]]] } },
]
const SLOTS = ["root", "label", "control", "item", "tab", "popup", "nowhere"]
const STYLE_VALUES: [string, unknown][] = [
  ["color", "#003BB2"],
  ["color", { token: "primary" }],
  ["color", { token: "brand" }],
  ["color", "red"],
  ["background", { token: "muted" }],
  ["borderColor", "#00000080"],
  ["radius", "full"],
  ["radius", "huge"],
  ["fontWeight", "semibold"],
  ["padding", "lg"],
  ["padding", undefined],
]

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
    case "rename":
      return { type: "rename", id, name: NEW_NAMES[b % NEW_NAMES.length] }
    case "bind":
      return { type: "bind", id, path: NEW_PATHS[b % NEW_PATHS.length] }
    case "setting":
    case "run":
      return {
        type: "set-setting",
        // Now and then the form's own settings.
        id: c % 7 === 0 ? null : id,
        key: KEYS[b % KEYS.length],
        value: VALUES[c % VALUES.length],
        // A run: these merge with the ones before them that share it.
        ...(kind === "run" ? { merge: `run${a % 2}` } : {}),
      }
    case "reset":
      return { type: "reset-setting", id: c % 7 === 0 ? null : id, key: KEYS[b % KEYS.length] }
    case "style": {
      const [property, value] = STYLE_VALUES[c % STYLE_VALUES.length]
      return {
        type: "set-style",
        id,
        slot: SLOTS[b % SLOTS.length],
        property: property as "color",
        value: value as "#000000",
        ...(a % 3 === 0 ? { merge: "styleRun" } : {}),
      }
    }
    case "resetSlot":
      return { type: "reset-slot", id, slot: SLOTS[b % SLOTS.length] }
    case "formName":
      return {
        type: "rename-form",
        name: ["Contact", "", "   ", "x".repeat(201), "Ünïcödé"][b % 5],
        merge: "formName",
      }
    case "endRun":
    case "revertRun":
      return { type: kind === "endRun" ? "end-run" : "revert-run", merge: `run${a % 2}` }
    case "formDescription":
      return {
        type: "describe-form",
        description: ["Who you are.", "", "x".repeat(1001)][b % 3],
      }
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
            // A run taken back gives back the very document from before the run.
            if (command.type === "revert-run") {
              expect(state.document, context).toBe(before.past.at(-1)?.document)
              continue
            }
            if (command.type === "undo" || command.type === "redo") continue

            // Undo gives back the very document from before, and redo this
            // one. A change merged into the run before it is undone with that
            // run: undo gives back the document from before the whole run.
            const merged = state.past.length === before.past.length
            const undone = runCommand(state, { type: "undo" }, environment).state
            if (merged) {
              expect(state.past.at(-1)?.merge, context).toBeDefined()
              expect(undone.document, context).toBe(state.past.at(-1)?.document)
              continue
            }
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
