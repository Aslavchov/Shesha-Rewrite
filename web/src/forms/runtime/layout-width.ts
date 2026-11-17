import type { ComponentInstance, FormDocument } from "@/generated"

import type { Registry } from "./definition"

/**
 * Whether a form holds a component that lists data (a table), and so wants
 * the width of the page rather than the width of a column of fields. Read
 * from the components' categories, so no page names a component type.
 */
export function wantsWidth(document: FormDocument, registry: Registry): boolean {
  const visit = (instances: readonly ComponentInstance[]): boolean =>
    instances.some(
      (instance) =>
        registry.get(instance.type)?.category === "data" ||
        Object.values(instance.regions ?? {}).some(visit),
    )
  return Array.isArray(document.components) && visit(document.components)
}
