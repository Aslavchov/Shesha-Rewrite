import { nameBase } from "@/designer/model/names"
import type { Registry } from "@/forms/runtime"
import { type ComponentInstance, FORM_FORMAT_VERSION, type FormDocument } from "@/generated"

/**
 * The form the theme preview renders: one instance of every registered
 * component, with its default settings, so the preview shows real components
 * and a new component shows up in it by being registered. Containers hold one
 * input, so that there is something inside them to look at.
 */
export function sampleForm(registry: Registry): FormDocument {
  const definitions = [...registry.values()]
  const filler = definitions.find((definition) => definition.kind === "input")

  const instanceOf = (type: string, kind: string, suffix: string): ComponentInstance => {
    const name = `${nameBase(type)}${suffix}`
    return { id: `sample_${name}`, type, name, ...(kind === "input" ? { bind: name } : {}) }
  }

  const components = definitions.map((definition): ComponentInstance => {
    const instance = instanceOf(definition.type, definition.kind, "1")
    if (definition.kind !== "container" || !filler) return instance
    const [region] = definition.prepare(instance).regions
    if (region === undefined) return instance
    const child = instanceOf(filler.type, filler.kind, `In${sampleName(definition.type)}`)
    return { ...instance, regions: { [region]: [child] } }
  })

  return { formatVersion: FORM_FORMAT_VERSION, name: "Theme preview", components }
}

/** The name of the sample instance of a component type: how the preview finds it. */
export const sampleInstanceName = (type: string) => `${nameBase(type)}1`

const sampleName = (type: string) => {
  const base = nameBase(type)
  return base[0].toUpperCase() + base.slice(1)
}
