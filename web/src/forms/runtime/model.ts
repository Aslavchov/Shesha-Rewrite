import type { ComponentInstance, FormDocument, Space } from "@/generated"

import type { ComponentDefinition, PreparedComponent, Registry } from "./definition"
import { resolveSettings, space } from "./settings"
import type { FieldSpec } from "./store"

/**
 * A form document checked against the registry and made ready to render.
 * This is where the client's share of validation happens (ADR 0003): types,
 * regions and settings. Nothing here throws on a bad document; every problem
 * is recorded and the rest of the form carries on.
 */

/** The form's own settings. Stored sparsely, like a component's. */
export const formSettings = {
  gap: space({
    label: "Gap",
    help: "The space between the form's top-level components.",
    group: "layout",
    default: "md",
  }),
}

export type FormNode =
  | {
      readonly kind: "component"
      readonly instance: ComponentInstance
      readonly definition: ComponentDefinition
      readonly prepared: PreparedComponent
      /** Region name to children, for the regions this instance really has. */
      readonly regions: ReadonlyMap<string, readonly FormNode[]>
    }
  /** No such component type in the registry. */
  | { readonly kind: "unknown"; readonly instance: ComponentInstance }
  /** The type is known but this instance cannot work. */
  | {
      readonly kind: "broken"
      readonly instance: ComponentInstance
      readonly definition: ComponentDefinition
      readonly message: string
    }

export type FormProblem = {
  /** Where in the document, such as `components[2].settings.label`. */
  readonly path: string
  readonly message: string
}

export type FormModel = {
  readonly gap: Space
  readonly nodes: readonly FormNode[]
  /** Every input that can hold a value, in document order. */
  readonly fields: readonly FieldSpec[]
  readonly problems: readonly FormProblem[]
}

export function buildModel(document: FormDocument, registry: Registry): FormModel {
  const fields: FieldSpec[] = []
  const problems: FormProblem[] = []

  const settings = resolveSettings(formSettings, document.settings)
  for (const problem of settings.problems) {
    problems.push({ path: `settings.${problem.setting}`, message: problem.message })
  }

  function region(path: string, instances: readonly ComponentInstance[]): FormNode[] {
    return instances.map((instance, index) => node(`${path}[${index}]`, instance))
  }

  function node(path: string, instance: ComponentInstance): FormNode {
    const definition = registry.get(instance.type)
    if (!definition) {
      // Children are not built either: without the type, nothing says where
      // they would go, and fields that cannot be seen must not be validated.
      problems.push({
        path: `${path}.type`,
        message: `There is no component type "${instance.type}".`,
      })
      return { kind: "unknown", instance }
    }

    const prepared = definition.prepare(instance)
    for (const problem of prepared.problems) {
      problems.push({ path: `${path}.${problem.where}`, message: problem.message })
    }

    if (prepared.field) {
      if (!instance.bind) {
        const message = `${definition.displayName} needs a data path to store its value under.`
        problems.push({ path: `${path}.bind`, message })
        return { kind: "broken", instance, definition, message }
      }
      fields.push({ id: instance.id, path: instance.bind, ...prepared.field })
    }

    const regions = new Map<string, readonly FormNode[]>()
    for (const name of prepared.regions) {
      regions.set(name, region(`${path}.regions.${name}`, instance.regions?.[name] ?? []))
    }
    for (const name of Object.keys(instance.regions ?? {})) {
      if (!regions.has(name)) {
        problems.push({
          path: `${path}.regions.${name}`,
          message: `${definition.displayName} has no region "${name}"; its contents are not shown.`,
        })
      }
    }
    return { kind: "component", instance, definition, prepared, regions }
  }

  const nodes = region("components", document.components)
  return { gap: settings.settings.gap, nodes, fields, problems }
}
