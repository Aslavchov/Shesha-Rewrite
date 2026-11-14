import {
  type FormDocument,
  FORM_FORMAT_VERSION,
  MAX_JSON_DEPTH,
  MAX_REQUEST_BYTES,
} from "@/generated"

import { pathsClash } from "./names"
import { jsonDepth } from "./tree"

/**
 * The server's rules for a form document, in TypeScript (ADR 0008).
 *
 * The server is the judge of what may be stored (`crates/server/src/forms/
 * validate.rs`). The designer keeps this copy so that it can refuse a change
 * the server would refuse, and so that its tests can check every document it
 * produces. The two are held together by one file of cases that both test
 * suites run: `crates/server/tests/fixtures/document-rules.json`.
 */

export type RuleProblem = {
  /** Where in the document, such as `components[1].regions.col2[0].name`. */
  readonly path: string
  readonly message: string
}

const MAX_NAME_CHARS = 200
const MAX_DESCRIPTION_CHARS = 1000
/** Longest id, component name, type id, slot name and region name. */
const MAX_KEY_CHARS = 64
const MAX_PATH_CHARS = 255

const ID = /^[A-Za-z0-9_-]{1,64}$/
const COMPONENT_TYPE = /^[a-z][a-z0-9-]*$/
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/
/** A slot or region name. */
const KEY = /^[A-Za-z][A-Za-z0-9_-]*$/
const TOKEN_NAME = /^[a-z][a-z0-9-]*$/
const HEX_COLOUR = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/
/** Only what Unicode calls white space, which is what the server trims. */
const BLANK = /^[\t\n\v\f\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]*$/

const RADIUS_STEPS = ["none", "sm", "md", "lg", "xl", "2xl", "full"]
const FONT_WEIGHTS = ["normal", "medium", "semibold"]
const SPACE_STEPS = ["none", "xs", "sm", "md", "lg", "xl"]

type Json = Readonly<Record<string, unknown>>

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Every problem the server would report for `document`. None means it would be stored. */
export function checkDocument(document: unknown): RuleProblem[] {
  if (!isObject(document)) return [{ path: "", message: "A form document is a JSON object." }]

  // The version is judged first: a document in another format need not have
  // this format's shape at all.
  if (document.formatVersion !== FORM_FORMAT_VERSION) {
    return [
      {
        path: "formatVersion",
        message: `This build reads format version ${FORM_FORMAT_VERSION}.`,
      },
    ]
  }

  const shape = shapeProblem(document)
  if (shape) return [shape]

  // The shape was just checked, so the document can be read as one.
  const checker = new Checker()
  checker.form(document as FormDocument)
  return checker.problems
}

// --- Shape -------------------------------------------------------------------
//
// Like the server, the shape is checked first and only its first problem is
// reported: a document of the wrong shape cannot be read any further.

type Shape = (value: unknown, path: string) => RuleProblem | null

const join = (path: string, key: string) => (path === "" ? key : `${path}.${key}`)

const text: Shape = (value, path) =>
  typeof value === "string" ? null : { path, message: "This must be text." }

const anyObject: Shape = (value, path) =>
  isObject(value) ? null : { path, message: "This must be an object." }

const optional =
  (shape: Shape): Shape =>
  (value, path) =>
    value === null ? null : shape(value, path)

const oneOf =
  (choices: readonly string[]): Shape =>
  (value, path) =>
    typeof value === "string" && choices.includes(value)
      ? null
      : { path, message: `This must be one of: ${choices.join(", ")}.` }

const listOf =
  (item: Shape): Shape =>
  (value, path) => {
    if (!Array.isArray(value)) return { path, message: "This must be a list." }
    for (const [index, entry] of value.entries()) {
      const problem = item(entry, `${path}[${index}]`)
      if (problem) return problem
    }
    return null
  }

const mapOf =
  (item: Shape): Shape =>
  (value, path) => {
    if (!isObject(value)) return { path, message: "This must be an object." }
    for (const [key, entry] of Object.entries(value)) {
      const problem = item(entry, join(path, key))
      if (problem) return problem
    }
    return null
  }

/** An object with exactly these keys; the ones in `required` must be there. */
const objectOf =
  (keys: Readonly<Record<string, Shape>>, required: readonly string[]): Shape =>
  (value, path) => {
    if (!isObject(value)) return { path, message: "This must be an object." }
    for (const [key, entry] of Object.entries(value)) {
      if (!Object.hasOwn(keys, key)) {
        return { path: join(path, key), message: `"${key}" is not a key of the format.` }
      }
      const problem = keys[key](entry, join(path, key))
      if (problem) return problem
    }
    const missing = required.find((key) => !Object.hasOwn(value, key))
    return missing === undefined ? null : { path, message: `"${missing}" is missing.` }
  }

/** A literal, or a reference to a token: `{ "token": "primary" }`. */
const colour: Shape = (value, path) => {
  if (typeof value === "string") return null
  const isReference =
    isObject(value) && Object.keys(value).length === 1 && typeof value.token === "string"
  return isReference ? null : { path, message: "This must be a colour or a token reference." }
}

const slotStyle = objectOf(
  {
    color: optional(colour),
    background: optional(colour),
    borderColor: optional(colour),
    radius: optional(oneOf(RADIUS_STEPS)),
    fontWeight: optional(oneOf(FONT_WEIGHTS)),
    padding: optional(oneOf(SPACE_STEPS)),
  },
  [],
)

const instanceShape: Shape = (value, path) =>
  objectOf(
    {
      id: text,
      type: text,
      name: text,
      bind: optional(text),
      settings: anyObject,
      styles: mapOf(slotStyle),
      regions: mapOf(listOf(instanceShape)),
    },
    ["id", "type", "name"],
  )(value, path)

const shapeProblem = (document: Json) =>
  objectOf(
    {
      // Already known to be this build's version.
      formatVersion: () => null,
      name: text,
      description: text,
      settings: anyObject,
      components: listOf(instanceShape),
    },
    ["formatVersion", "name", "components"],
  )(document, "")

// --- Everything else ---------------------------------------------------------

type Instance = FormDocument["components"][number]

/** Keys in the order the server visits them. */
const sortedEntries = <T>(map: Readonly<Record<string, T>> | undefined): [string, T][] =>
  Object.entries(map ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

const characters = (value: string) => [...value].length

class Checker {
  readonly problems: RuleProblem[] = []
  /** What was seen so far, each with the path it was first seen at. */
  readonly #ids = new Map<string, string>()
  readonly #names = new Map<string, string>()
  /** In document order, for the check that no path is inside another. */
  readonly #binds: [bind: string, path: string][] = []

  #problem(path: string, message: string) {
    this.problems.push({ path, message })
  }

  form(form: FormDocument) {
    const nameLength = characters(form.name)
    if (BLANK.test(form.name)) {
      this.#problem("name", "A form needs a name.")
    } else if (nameLength > MAX_NAME_CHARS) {
      this.#problem(
        "name",
        `The name is ${nameLength} characters long; the limit is ${MAX_NAME_CHARS}.`,
      )
    }
    const descriptionLength = characters(form.description ?? "")
    if (descriptionLength > MAX_DESCRIPTION_CHARS) {
      this.#problem(
        "description",
        `The description is ${descriptionLength} characters long; the limit is ${MAX_DESCRIPTION_CHARS}.`,
      )
    }
    this.#region("components", form.components)
  }

  #region(path: string, instances: readonly Instance[]) {
    for (const [index, child] of instances.entries()) this.#instance(`${path}[${index}]`, child)
  }

  #instance(path: string, instance: Instance) {
    this.#id(path, instance.id)
    if (!COMPONENT_TYPE.test(instance.type) || instance.type.length > MAX_KEY_CHARS) {
      this.#problem(`${path}.type`, `"${instance.type}" is not a valid component type.`)
    }
    this.#name(path, instance.name)
    // A data path of null is read as none.
    if (typeof instance.bind === "string") this.#bind(path, instance.bind)

    for (const [slot, style] of sortedEntries(instance.styles)) {
      const slotPath = `${path}.styles.${slot}`
      if (!isKey(slot)) this.#problem(slotPath, `"${slot}" is not a valid slot name.`)
      for (const property of ["color", "background", "borderColor"] as const) {
        const value: unknown = style[property]
        const valid =
          value === undefined ||
          value === null ||
          (typeof value === "string"
            ? HEX_COLOUR.test(value)
            : isObject(value) && isTokenName(value.token))
        if (!valid) this.#problem(`${slotPath}.${property}`, "This is not a colour.")
      }
    }
    for (const [region, children] of sortedEntries(instance.regions)) {
      const regionPath = `${path}.regions.${region}`
      if (!isKey(region)) this.#problem(regionPath, `"${region}" is not a valid region name.`)
      this.#region(regionPath, children)
    }
  }

  #id(path: string, id: string) {
    const first = this.#ids.get(id)
    if (!ID.test(id)) {
      this.#problem(`${path}.id`, `"${id}" is not a valid id.`)
    } else if (first !== undefined) {
      this.#problem(`${path}.id`, `"${id}" is already the id of ${first}.`)
    } else {
      this.#ids.set(id, path)
    }
  }

  #name(path: string, name: string) {
    const first = this.#names.get(name)
    if (!IDENTIFIER.test(name) || name.length > MAX_KEY_CHARS) {
      this.#problem(`${path}.name`, `"${name}" is not a valid name.`)
    } else if (first !== undefined) {
      this.#problem(`${path}.name`, `"${name}" is already the name of ${first}.`)
    } else {
      this.#names.set(name, path)
    }
  }

  #bind(path: string, bind: string) {
    if (bind.length > MAX_PATH_CHARS || !bind.split(".").every((part) => IDENTIFIER.test(part))) {
      this.#problem(`${path}.bind`, `"${bind}" is not a valid data path.`)
      return
    }
    const clash = this.#binds.find(([other]) => pathsClash(bind, other))
    if (clash) {
      this.#problem(`${path}.bind`, `"${bind}" clashes with "${clash[0]}" (${clash[1]}).`)
    } else {
      this.#binds.push([bind, path])
    }
  }
}

const isKey = (value: string) => KEY.test(value) && value.length <= MAX_KEY_CHARS

const isTokenName = (value: unknown) =>
  typeof value === "string" && TOKEN_NAME.test(value) && value.length <= MAX_KEY_CHARS

// --- The limits on a request -------------------------------------------------

export type LimitProblem = "too-deep" | "too-large"

/**
 * What the server allows a save to be. A save is `{ "revision": n,
 * "document": … }`, so the document sits one level down in a body that also
 * carries the revision.
 */
const WRAPPER_DEPTH = 1
const WRAPPER_BYTES = '{"revision":4294967295,"document":}'.length
/** No character takes more than three bytes of UTF-8 per UTF-16 unit. */
const MAX_BYTES_PER_UNIT = 3

/** Why the server would refuse to read a save of `document`, if it would. */
export function limitProblem(document: FormDocument): LimitProblem | null {
  if (jsonDepth(document) + WRAPPER_DEPTH > MAX_JSON_DEPTH) return "too-deep"

  const json = JSON.stringify(document)
  const room = MAX_REQUEST_BYTES - WRAPPER_BYTES
  if (json.length * MAX_BYTES_PER_UNIT <= room) return null
  return new TextEncoder().encode(json).length > room ? "too-large" : null
}
