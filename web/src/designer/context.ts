import * as React from "react"

import type { DragController, DragState } from "./drag/controller"
import type { Autosave, SaveStatus } from "./save"
import type { DesignerSnapshot, DesignerStore } from "./store"

/** What every part of an open designer shares. */
export type DesignerContextValue = {
  readonly store: DesignerStore
  readonly drag: DragController
  readonly autosave: Autosave
}

export const DesignerContext = React.createContext<DesignerContextValue | null>(null)

export function useDesignerContext(): DesignerContextValue {
  const context = React.useContext(DesignerContext)
  if (!context) throw new Error("Designer components can only be rendered inside a designer.")
  return context
}

/**
 * Subscribes a component to one part of the designer's state. `select` must
 * return the same value for the same snapshot: a primitive, or an object that
 * is already in the snapshot.
 */
export function useDesigner<T>(select: (snapshot: DesignerSnapshot) => T): T {
  const { store } = useDesignerContext()
  return React.useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))
}

/** Subscribes a component to one part of the drag in progress. `select` as for `useDesigner`. */
export function useDrag<T>(select: (state: DragState | null) => T): T {
  const { drag } = useDesignerContext()
  return React.useSyncExternalStore(drag.subscribe, () => select(drag.getState()))
}

export function useSaveStatus(): SaveStatus {
  const { autosave } = useDesignerContext()
  return React.useSyncExternalStore(autosave.subscribe, autosave.getStatus)
}
