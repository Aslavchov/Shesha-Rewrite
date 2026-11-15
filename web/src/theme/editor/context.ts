import * as React from "react"

import type { Autosave, SaveStatus } from "@/designer/save"
import type { Registry } from "@/forms/runtime"
import type { ThemeDocument, ThemeState } from "@/generated"

import type { ThemeEditorSnapshot, ThemeEditorStore } from "./store"

export type ThemeAutosave = Autosave<ThemeDocument, ThemeState & { revision: number }>

/** What every part of the open theme editor shares. */
export type ThemeEditorContextValue = {
  readonly store: ThemeEditorStore
  readonly autosave: ThemeAutosave
  readonly registry: Registry
}

export const ThemeEditorContext = React.createContext<ThemeEditorContextValue | null>(null)

export function useThemeEditorContext(): ThemeEditorContextValue {
  const context = React.useContext(ThemeEditorContext)
  if (!context) throw new Error("Theme editor parts can only be rendered inside the theme editor.")
  return context
}

/** Subscribes to one part of the editor's state. `select` must return the same value for the same snapshot. */
export function useThemeEditor<T>(select: (snapshot: ThemeEditorSnapshot) => T): T {
  const { store } = useThemeEditorContext()
  return React.useSyncExternalStore(store.subscribe, () => select(store.getSnapshot()))
}

export function useThemeSaveStatus(): SaveStatus {
  const { autosave } = useThemeEditorContext()
  return React.useSyncExternalStore(autosave.subscribe, autosave.getStatus)
}

/** A field's run of edits: kept and said aloud when it ends valid, taken back when not (ADR 0009). */
export function useEndRun() {
  const { store } = useThemeEditorContext()
  return React.useCallback(
    (run: string, keep: boolean) => {
      store.run(keep ? { type: "end-run", merge: run } : { type: "revert-run", merge: run })
    },
    [store],
  )
}
