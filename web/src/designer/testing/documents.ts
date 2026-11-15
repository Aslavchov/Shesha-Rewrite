import { registry } from "@/forms/registry"
import { type ComponentInstance, FORM_FORMAT_VERSION, type FormDocument } from "@/generated"

// The server's own files, so the tests run against what it really stores and
// really checks.
import documentRules from "../../../../crates/server/tests/fixtures/document-rules.json"
import personDetailsSeed from "../../../../crates/server/seed/person-details.json"
import { createSchema } from "../model/schema"

/** Helpers for the designer's unit tests. Test-only. */

/** The cases the server's validation tests and the designer's rule tests both run. */
export const ruleCases: { name: string; document: unknown; problems: string[] }[] =
  documentRules.cases

/** The form `--demo` seeds, exactly as the server stores it. A fresh copy each time. */
export const personDetails = () => structuredClone(personDetailsSeed) as FormDocument

/** The real components, as the designer reads documents against them. */
export const schema = createSchema(registry)

export function form(components: ComponentInstance[] = []): FormDocument {
  return { formatVersion: FORM_FORMAT_VERSION, name: "Test form", components }
}

/** An input with the id `c_<name>`, bound to its name. */
export const field = (name: string, type = "text-field"): ComponentInstance => ({
  id: `c_${name}`,
  type,
  name,
  bind: name,
})

/** A Columns with the id `c_<name>`. Pass `count` to store a column count. */
export function columns(
  name: string,
  regions: Record<string, ComponentInstance[]> = {},
  count?: number,
): ComponentInstance {
  return {
    id: `c_${name}`,
    type: "columns",
    name,
    ...(count === undefined ? {} : { settings: { columns: count } }),
    ...(Object.keys(regions).length > 0 ? { regions } : {}),
  }
}

export function container(name: string, content: ComponentInstance[] = []): ComponentInstance {
  return {
    id: `c_${name}`,
    type: "container",
    name,
    ...(content.length > 0 ? { regions: { content } } : {}),
  }
}

/** The names of a document's instances as nested lists, to compare layouts at a glance. */
export function layout(document: FormDocument): unknown[] {
  const list = (instances: readonly ComponentInstance[]): unknown[] =>
    instances.map((instance) => {
      const regions = Object.entries(instance.regions ?? {})
      if (regions.length === 0) return instance.name
      return {
        [instance.name]: Object.fromEntries(
          regions.map(([name, children]) => [name, list(children)]),
        ),
      }
    })
  return list(document.components)
}

/** A source of "random" indexes that repeats for a given seed. */
export function seededRandom(seed: number) {
  let state = seed >>> 0 || 1
  return (below: number) => {
    // xorshift32
    state ^= state << 13
    state >>>= 0
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state % below
  }
}
