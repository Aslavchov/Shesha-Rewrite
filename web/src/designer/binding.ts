import { useCatalog } from "@/data/client"
import { formSettings, resolveSettings } from "@/forms/runtime"
import type { EntityDefinition } from "@/generated"

import { useDesigner } from "./context"

/**
 * The entity the form being designed is bound to (spec 5.1), from the
 * form's own `entity` setting and the definitions as they are now.
 */
export type FormBinding =
  /** The form is not bound. */
  | { readonly status: "none" }
  | { readonly status: "loading"; readonly name: string }
  /** The form names an entity that does not exist. */
  | { readonly status: "missing"; readonly name: string }
  | { readonly status: "ready"; readonly name: string; readonly entity: EntityDefinition }

export function useFormBinding(): FormBinding {
  const settings = useDesigner((snapshot) => snapshot.editor.document.settings)
  const name = resolveSettings(formSettings, settings).settings.entity
  // An unbound form needs no definitions.
  const catalog = useCatalog(name !== null)
  if (name === null) return { status: "none" }
  const entity = catalog.entity(name)
  if (entity) return { status: "ready", name, entity }
  return { status: catalog.status === "ready" ? "missing" : "loading", name }
}

/** The bound entity, or null while there is none to check against. */
export function useBoundEntity(): EntityDefinition | null {
  const binding = useFormBinding()
  return binding.status === "ready" ? binding.entity : null
}
