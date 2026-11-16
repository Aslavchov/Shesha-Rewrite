import { formSettings, type Registry, resolveSettings } from "@/forms/runtime"
import { type ComponentInstance, FORM_FORMAT_VERSION, type FormRecord } from "@/generated"

/**
 * Which forms use an entity, or one of its properties (spec 3.3), so a
 * delete can name them first. Read from the forms as the registry reads
 * them: a form bound to the entity, an input bound to the property, and any
 * setting that names the entity or lists the property as a column.
 */
export function formsUsing(
  forms: readonly FormRecord[],
  registry: Registry,
  entity: string,
  property?: string,
): string[] {
  const names: string[] = []
  for (const form of forms) {
    const document = form.document
    if (document.formatVersion !== FORM_FORMAT_VERSION) continue
    const bound = resolveSettings(formSettings, document.settings).settings.entity === entity
    let uses = bound && property === undefined

    const visit = (instances: readonly ComponentInstance[]) => {
      for (const instance of instances) {
        const definition = registry.get(instance.type)
        if (definition) {
          if (bound && definition.kind === "input" && instance.bind === property) uses = true
          const { messages: _, ...stored } = instance.settings ?? {}
          const resolved: Readonly<Record<string, unknown>> = resolveSettings(
            definition.settings,
            stored,
          ).settings
          for (const [key, setting] of Object.entries(definition.settings)) {
            if (setting.kind === "entity" && resolved[key] === entity && property === undefined) {
              uses = true
            }
            if (setting.kind === "columns" && setting.entityFrom?.(resolved) === entity) {
              const columns = resolved[key]
              const listed =
                Array.isArray(columns) &&
                columns.some(
                  (column: unknown) =>
                    typeof column === "object" &&
                    column !== null &&
                    (column as { property?: unknown }).property === property,
                )
              // No columns chosen means every property is shown.
              if (
                property === undefined ||
                listed ||
                (Array.isArray(columns) && columns.length === 0)
              ) {
                uses = true
              }
            }
          }
        }
        for (const children of Object.values(instance.regions ?? {})) visit(children)
      }
    }
    visit(document.components)
    if (uses) names.push(document.name)
  }
  return names.sort((a, b) => a.localeCompare(b))
}
