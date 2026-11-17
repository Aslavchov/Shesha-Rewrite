import { resolveSettings } from "@/forms/runtime"
import type { ValueType } from "@/forms/runtime"
import type { ComponentInstance, EntityDefinition, PropertyDefinition } from "@/generated"

import type { Problem } from "./problems"
import type { OutlineNode, Schema } from "./schema"

/**
 * What is wrong with how an instance is bound, in a form bound to an entity
 * (spec 5.1, ADR 0011): a data path that is not a property, a component
 * whose value does not fit the property's type, and a component that names
 * another reference list or entity than its property does. Pure, like the
 * rest of the model: the entity is handed in.
 */

/** The value type (ADR 0005, with `reference`) each property type holds. */
const VALUE_TYPES: Record<PropertyDefinition["type"], ValueType> = {
  text: "text",
  number: "number",
  boolean: "boolean",
  date: "date",
  referenceList: "option",
  reference: "reference",
}

const HOLDS: Record<ValueType, string> = {
  text: "text",
  number: "a number",
  boolean: "yes or no",
  date: "a date",
  option: "one of a list of options",
  reference: "a reference to a row",
}

const IS: Record<PropertyDefinition["type"], string> = {
  text: "text",
  number: "a number",
  boolean: "yes/no",
  date: "a date",
  referenceList: "a reference list value",
  reference: "a reference to a row",
}

type Remembered = { readonly entity: EntityDefinition; readonly problems: readonly Problem[] }

/** Per instance object and entity definition: neither ever changes in place. */
const remembered = new WeakMap<ComponentInstance, Remembered>()

const NONE: readonly Problem[] = []

export function bindingProblemsOf(
  node: OutlineNode,
  entity: EntityDefinition | null,
  schema: Schema,
): readonly Problem[] {
  if (entity === null) return NONE
  const known = remembered.get(node.instance)
  if (known?.entity === entity) return known.problems
  const problems = find(node, entity, schema)
  remembered.set(node.instance, { entity, problems })
  return problems
}

function find(node: OutlineNode, entity: EntityDefinition, schema: Schema): readonly Problem[] {
  const { instance, definition } = node
  if (!definition || definition.kind !== "input" || !instance.bind) return NONE
  const { id, name } = instance
  const path = instance.bind

  const property = entity.properties.find((candidate) => candidate.name === path)
  if (!property) {
    return [
      {
        message: `${entity.displayName} has no property called “${path}”, so the value of ${name} would not be saved. Set its data path to one of ${entity.displayName}’s properties.`,
      },
    ]
  }

  const expected = VALUE_TYPES[property.type]
  if (definition.valueType !== expected) {
    const fitting = schema.componentFor(property)
    const holds = definition.valueType ? HOLDS[definition.valueType] : "no value"
    return [
      {
        message: `${definition.displayName} holds ${holds}, but ${property.displayName} is ${IS[property.type]}.${fitting ? ` Use a ${fitting.displayName} for it.` : ""}`,
      },
    ]
  }

  // A setting that names a list or an entity must name the property's own.
  const problems: Problem[] = []
  const resolved: Readonly<Record<string, unknown>> = resolveSettings(
    definition.settings,
    instance.settings,
  ).settings
  for (const [key, setting] of Object.entries(definition.settings)) {
    const target =
      setting.kind === "reference-list" && property.type === "referenceList"
        ? { wanted: property.referenceList, what: "reference list" }
        : setting.kind === "entity" && property.type === "reference"
          ? { wanted: property.entity, what: "entity" }
          : null
    if (!target || target.wanted === undefined || resolved[key] === target.wanted) continue
    const current = resolved[key]
    problems.push({
      message:
        typeof current === "string"
          ? `${name} offers the ${target.what} “${current}”, but ${property.displayName} takes its values from “${target.wanted}”.`
          : `${name} has no ${target.what} yet. ${property.displayName} takes its values from “${target.wanted}”.`,
      fix: {
        label: `Use “${target.wanted}”`,
        command: { type: "set-setting", id, key, value: target.wanted },
      },
    })
  }
  return problems
}
