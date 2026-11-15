import type * as React from "react"

import type { ComponentInstance } from "@/generated"

import type { ComponentDefinition } from "./definition"

/**
 * The seam the designer plugs into (ADR 0008).
 *
 * In design mode the renderer shows the same components it always does, in
 * edit mode. The only difference is that it hands every instance and every
 * region to the surface it was given, which wraps them: to select and drag an
 * instance, and to show a drop target in a region with nothing in it. The
 * renderer knows nothing about selection or dragging, and the designer never
 * renders a component itself.
 */
export type DesignSurface = {
  /** Wraps one rendered instance. Must render `children`. */
  readonly Instance: React.ComponentType<DesignInstanceProps>
  /**
   * Stands where a region's children go. Must render `children`, and must
   * not wrap them in an element: they are laid out by the element the
   * component put them in.
   */
  readonly Region: React.ComponentType<DesignRegionProps>
  /**
   * The region the author chose to see in a container that shows one region
   * at a time (Tabs), or null. Optional; added in Phase 3 (ADR 0009).
   */
  readonly shownRegion?: (instanceId: string) => string | null
}

export type DesignInstanceProps = {
  readonly instance: ComponentInstance
  /** Null when this build has no component of the instance's type. */
  readonly definition: ComponentDefinition | null
  /** The component as the form shows it, or the placeholder that stands in for it. */
  readonly children: React.ReactNode
}

export type DesignRegionProps = {
  /** The instance whose region this is, or null for the form's own top-level list. */
  readonly parent: ComponentInstance | null
  /** The region's name. For the form's own list, `components`. */
  readonly name: string
  readonly isEmpty: boolean
  /** The region's instances, each already wrapped by `Instance`. */
  readonly children: React.ReactNode
}
