import type { ComponentInstance, FormDocument } from "@/generated"

/**
 * Reading and changing the tree of instances in a form document (ADR 0003).
 * Everything here is pure: a change returns a new document that shares every
 * untouched instance with the old one, which is what keeps undo history cheap.
 */

/** What `Position.region` holds for the form's own top-level list. */
export const ROOT_REGION = "components"

/** A place in a document: one index of one region. */
export type Position = {
  /** The id of the instance whose region it is, or null for the form's own list. */
  readonly parent: string | null
  /** The region's name. `ROOT_REGION` when `parent` is null. */
  readonly region: string
  readonly index: number
}

export const rootPosition = (index: number): Position => ({
  parent: null,
  region: ROOT_REGION,
  index,
})

export const samePosition = (a: Position, b: Position): boolean =>
  a.parent === b.parent && a.index === b.index && (a.parent === null || a.region === b.region)

export type Found = {
  readonly instance: ComponentInstance
  readonly position: Position
  /** The instances it is inside, outermost first. */
  readonly ancestors: readonly ComponentInstance[]
}

export function findInstance(document: FormDocument, id: string): Found | null {
  function search(
    list: readonly ComponentInstance[],
    parent: string | null,
    region: string,
    ancestors: readonly ComponentInstance[],
  ): Found | null {
    for (const [index, instance] of list.entries()) {
      if (instance.id === id) return { instance, position: { parent, region, index }, ancestors }
      for (const [name, children] of Object.entries(instance.regions ?? {})) {
        const found = search(children, instance.id, name, [...ancestors, instance])
        if (found) return found
      }
    }
    return null
  }
  return search(document.components, null, ROOT_REGION, [])
}

/** Every instance of a list and everything inside them, in document order. */
export function* instancesIn(list: readonly ComponentInstance[]): Generator<ComponentInstance> {
  for (const instance of list) {
    yield instance
    for (const children of Object.values(instance.regions ?? {})) yield* instancesIn(children)
  }
}

export const allInstances = (document: FormDocument) => instancesIn(document.components)

/** Whether `id` is `instance` itself or anything inside it. */
export function contains(instance: ComponentInstance, id: string): boolean {
  for (const inner of instancesIn([instance])) if (inner.id === id) return true
  return false
}

/** The children of a region, or null if the parent does not exist. An absent region is empty. */
export function childrenAt(
  document: FormDocument,
  parent: string | null,
  region: string,
): readonly ComponentInstance[] | null {
  if (parent === null) return document.components
  const found = findInstance(document, parent)
  return found ? (found.instance.regions?.[region] ?? []) : null
}

/**
 * Replaces the children of one region. Returns null if the parent does not
 * exist. A region left empty is removed from its instance, and `regions` with
 * it when it was the last: a document only states what was decided (ADR 0003).
 */
function changeRegion(
  document: FormDocument,
  parent: string | null,
  region: string,
  change: (children: readonly ComponentInstance[]) => ComponentInstance[],
): FormDocument | null {
  if (parent === null) return { ...document, components: change(document.components) }

  /** The list with the parent replaced somewhere inside it, or null if it is not there. */
  function inList(list: readonly ComponentInstance[]): ComponentInstance[] | null {
    for (const [index, instance] of list.entries()) {
      const replaced = instance.id === parent ? withRegion(instance) : inInstance(instance)
      if (replaced) return list.with(index, replaced)
    }
    return null
  }

  function inInstance(instance: ComponentInstance): ComponentInstance | null {
    for (const [name, children] of Object.entries(instance.regions ?? {})) {
      const replaced = inList(children)
      if (replaced) return { ...instance, regions: { ...instance.regions, [name]: replaced } }
    }
    return null
  }

  function withRegion(instance: ComponentInstance): ComponentInstance {
    const { [region]: current = [], ...others } = instance.regions ?? {}
    const children = change(current)
    const regions = children.length > 0 ? { ...others, [region]: children } : others
    const { regions: _, ...rest } = instance
    return Object.keys(regions).length > 0 ? { ...rest, regions } : rest
  }

  const components = inList(document.components)
  return components ? { ...document, components } : null
}

/**
 * Puts `instance` at `position`. An index past the end means the end. Returns
 * null if the parent does not exist.
 */
export function insertInstance(
  document: FormDocument,
  instance: ComponentInstance,
  position: Position,
): FormDocument | null {
  return changeRegion(document, position.parent, position.region, (children) =>
    children.toSpliced(Math.max(0, Math.min(position.index, children.length)), 0, instance),
  )
}

/** Takes the instance with this id, and everything inside it, out of the document. */
export function removeInstance(
  document: FormDocument,
  id: string,
): { document: FormDocument; removed: Found } | null {
  const removed = findInstance(document, id)
  if (!removed) return null
  const { parent, region, index } = removed.position
  const without = changeRegion(document, parent, region, (children) => children.toSpliced(index, 1))
  return without ? { document: without, removed } : null
}

/** How deep a JSON value nests: a scalar is 0, `[]` and `{}` are 1. */
export function jsonDepth(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0
  let deepest = 0
  for (const inner of Object.values(value)) deepest = Math.max(deepest, jsonDepth(inner))
  return deepest + 1
}
