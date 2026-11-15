import type { ComponentDefinition, Registry } from "@/forms/runtime"
import type { ComponentInstance, FormDocument } from "@/generated"

import { type Position, ROOT_REGION } from "./tree"

/**
 * A form document read against the component registry: for every instance,
 * its definition, where it is, and which of its regions are real. The outline
 * panel shows this tree; drops and keyboard moves are checked against it.
 */

export type OutlineNode = {
  readonly instance: ComponentInstance
  /** Null when this build has no component of the instance's type. */
  readonly definition: ComponentDefinition | null
  readonly position: Position
  readonly parent: OutlineNode | null
  /** 1 for a top-level instance. */
  readonly depth: number
  /**
   * False when the form does not show it: it is stored in a region its
   * container does not have (a third column of a two-column Columns), or
   * inside an instance that is itself not shown.
   */
  readonly shown: boolean
  /** The regions its type gives it now, in order, then any others it has stored. */
  readonly regions: readonly OutlineRegion[]
}

export type OutlineRegion = {
  readonly name: string
  /** Whether the form shows this region. Nothing can be dropped into one it does not. */
  readonly shown: boolean
  readonly children: readonly OutlineNode[]
}

export type Outline = {
  readonly roots: readonly OutlineNode[]
  readonly byId: ReadonlyMap<string, OutlineNode>
  /** Every instance in document order. */
  readonly order: readonly OutlineNode[]
}

export type Schema = {
  readonly registry: Registry
  /** The outline of a document. Remembered per document, so asking again is free. */
  readonly outline: (document: FormDocument) => Outline
}

export function createSchema(registry: Registry): Schema {
  const outlines = new WeakMap<FormDocument, Outline>()
  // An instance object never changes, so neither do the regions it has.
  const regionNames = new WeakMap<ComponentInstance, readonly string[]>()

  function regionsOf(instance: ComponentInstance, definition: ComponentDefinition | null) {
    let names = regionNames.get(instance)
    if (!names) {
      names = definition?.prepare(instance).regions ?? []
      regionNames.set(instance, names)
    }
    return names
  }

  function build(document: FormDocument): Outline {
    const byId = new Map<string, OutlineNode>()
    const order: OutlineNode[] = []

    function list(
      instances: readonly ComponentInstance[],
      parent: OutlineNode | null,
      region: string,
      shown: boolean,
    ): OutlineNode[] {
      return instances.map((instance, index) => {
        const definition = registry.get(instance.type) ?? null
        const regions: OutlineRegion[] = []
        const node: OutlineNode = {
          instance,
          definition,
          position: { parent: parent?.instance.id ?? null, region, index },
          parent,
          depth: (parent?.depth ?? 0) + 1,
          shown,
          regions,
        }
        byId.set(instance.id, node)
        order.push(node)

        const real = regionsOf(instance, definition)
        const stored = Object.keys(instance.regions ?? {}).filter((name) => !real.includes(name))
        for (const name of [...real, ...stored]) {
          const regionShown = shown && real.includes(name)
          const children = list(instance.regions?.[name] ?? [], node, name, regionShown)
          regions.push({ name, shown: regionShown, children })
        }
        return node
      })
    }

    const roots = list(document.components, null, ROOT_REGION, true)
    return { roots, byId, order }
  }

  return {
    registry,
    outline(document) {
      let outline = outlines.get(document)
      if (!outline) {
        outline = build(document)
        outlines.set(document, outline)
      }
      return outline
    },
  }
}

/** The children of the region a position is in, or null if there is no such region. */
export function regionAt(outline: Outline, position: Position): OutlineRegion | null {
  if (position.parent === null) return { name: ROOT_REGION, shown: true, children: outline.roots }
  const parent = outline.byId.get(position.parent)
  return parent?.regions.find((region) => region.name === position.region) ?? null
}

/** The instances a node holds, at any depth, not counting itself. */
export function countInside(node: OutlineNode): number {
  let count = 0
  for (const region of node.regions) {
    for (const child of region.children) count += 1 + countInside(child)
  }
  return count
}
