import * as React from "react"
import { ChevronLeftIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { Link } from "react-router"

import { Button, buttonVariants } from "@/components/ui/button"
import type { Registry } from "@/forms/runtime"
import { APP_NAME, type FormRecord } from "@/generated"

import { Canvas } from "./canvas"
import {
  DesignerContext,
  type DesignerContextValue,
  useDesigner,
  useDesignerContext,
  useSaveStatus,
} from "./context"
import { DragController } from "./drag/controller"
import { DragLayer } from "./drag/drag-layer"
import type { Command } from "./model/editor"
import { createSchema } from "./model/schema"
import { OutlinePanel } from "./outline-panel"
import { PropertiesPanel } from "./properties/properties-panel"
import { Autosave, type SendSave } from "./save"
import { matchShortcut } from "./shortcuts"
import { DesignerStore, type Surface } from "./store"
import { SaveStatusView, Toolbar } from "./toolbar"
import { Toolbox } from "./toolbox"

export type DesignerProps = {
  /** The form as it was loaded. Changing it later does not reset the designer. */
  record: FormRecord
  /** The component types the form may use, and the toolbox offers. */
  registry: Registry
  /** Sends a save to the server. */
  save: SendSave
  /** Reads the form as the server has it now: for a reload after a conflict. */
  load: () => Promise<FormRecord>
  /** Called with what the server stored after each save. */
  onSaved?: (record: FormRecord) => void
  /** The id to give the designer's <main>, so that a skip link can point at it. */
  mainId: string
  /** Where the back link goes, and what it is called. */
  back: { to: string; label: string }
  /** Rendered at the right-hand end of the top bar. */
  actions?: React.ReactNode
}

/**
 * The form designer (Phase 2): toolbox, canvas, outline and properties, with
 * undo, autosave and a keyboard for everything. It fills the window; the page
 * that hosts it supplies the form and the way to save it.
 */
export function Designer({
  record,
  registry,
  mainId,
  save,
  load,
  onSaved,
  back,
  actions,
}: DesignerProps) {
  // Made once for the life of this designer. Later saves change the record
  // the page holds; the designer already has what it sent.
  const [context] = React.useState<DesignerContextValue>(() => {
    const store = new DesignerStore(record.document, createSchema(registry))
    const drag = new DragController({
      accept(source, position) {
        if (source.kind === "new") {
          const added = store.dryRun({ type: "add", component: source.component, at: position })
          return added.changed ? position : null
        }
        const { editor } = store.getSnapshot()
        const from = store.schema.outline(editor.document).byId.get(source.id)?.position
        if (!from) return null
        // The editor counts a region without the instance being moved.
        const sameRegion =
          from.parent === position.parent &&
          (from.parent === null || from.region === position.region)
        const index =
          sameRegion && position.index > from.index ? position.index - 1 : position.index
        const to = { ...position, index }
        return store.dryRun({ type: "move", id: source.id, to }).changed ? to : null
      },
      drop(source, to, surface) {
        store.run(
          source.kind === "new"
            ? { type: "add", component: source.component, at: to }
            : { type: "move", id: source.id, to },
        )
        store.focusSelection(surface)
      },
    })
    const autosave = new Autosave({ record, send: save, onSaved })
    return { store, drag, autosave }
  })
  const { store, drag, autosave } = context

  // Every change to the document reaches autosave, which decides when to send it.
  React.useEffect(() => {
    const tell = () => autosave.changed(store.getSnapshot().editor.document)
    tell()
    const unsubscribe = store.subscribe(tell)
    // Leaving the designer, or the page: send what is waiting, now.
    const leaving = () => autosave.flush({ keepalive: true })
    const hidden = () => {
      if (document.visibilityState === "hidden") leaving()
    }
    window.addEventListener("pagehide", leaving)
    document.addEventListener("visibilitychange", hidden)
    return () => {
      unsubscribe()
      window.removeEventListener("pagehide", leaving)
      document.removeEventListener("visibilitychange", hidden)
      drag.cancel()
      autosave.flush()
      autosave.dispose()
    }
  }, [store, drag, autosave])

  return (
    <DesignerContext value={context}>
      <Workspace
        mainId={mainId}
        back={back}
        actions={actions}
        onReload={async () => {
          const latest = await load()
          store.reset(latest.document)
          autosave.restart(latest)
          store.announce("Reloaded the form as it is now.")
        }}
      />
    </DesignerContext>
  )
}

/** Which view of the tree an element is in, if any. */
function surfaceOf(element: Element | null): Surface | null {
  if (!element) return null
  if (element.closest('[data-testid="designer-outline"]')) return "outline"
  if (element.closest('[data-testid="designer-canvas"]')) return "canvas"
  return null
}

const isEditable = (element: Element) =>
  element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
  null

/** Whether an element is inside the properties panel, where typing edits the form. */
const inPanel = (element: Element) =>
  element.closest('[data-testid="designer-properties"]') !== null

function Workspace({
  mainId,
  back,
  actions,
  onReload,
}: {
  mainId: string
  back: DesignerProps["back"]
  actions: React.ReactNode
  onReload: () => Promise<void>
}) {
  const { store, drag } = useDesignerContext()
  const mode = useDesigner((snapshot) => snapshot.mode)
  // The form's name as it is now: renaming it in the panel renames the page.
  const name = useDesigner((snapshot) => snapshot.editor.document.name)
  const status = useSaveStatus()
  const isConflict = status.kind === "conflict"
  const isLocked = mode === "preview" || isConflict

  /**
   * Runs a command on the selection. Afterwards keyboard focus follows the
   * selection in the view it was in, so that deleting an instance does not
   * leave focus nowhere.
   */
  const run = React.useCallback(
    (command: Command | ((selection: string) => Command)) => {
      const { selection } = store.getSnapshot().editor
      if (typeof command === "function" && selection === null) return
      const active = document.activeElement
      const surface =
        surfaceOf(active) ?? (active === null || active === document.body ? "canvas" : null)
      store.run(typeof command === "function" ? command(selection!) : command)
      if (surface) store.focusSelection(surface)
    },
    [store],
  )

  const commands = React.useMemo(
    () => ({
      undo: () => run({ type: "undo" }),
      redo: () => run({ type: "redo" }),
      duplicate: () => run((id) => ({ type: "duplicate", id })),
      remove: () => run((id) => ({ type: "remove", id })),
    }),
    [run],
  )

  // Shortcuts work wherever focus is, so they are heard on the window.
  React.useEffect(() => {
    if (isLocked) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : document.body
      if (event.defaultPrevented || drag.getState()) return
      if (target.closest('[role="dialog"]')) return
      const shortcut = matchShortcut(event)
      if (shortcut === null) return
      // Typing in a field is not a shortcut, with one exception: in the
      // properties panel, undo and redo undo the edits made there, a run of
      // typing at a time (ADR 0009), rather than the field's own keystrokes.
      if (
        isEditable(target) &&
        !(inPanel(target) && (shortcut === "undo" || shortcut === "redo"))
      ) {
        return
      }
      const { selection } = store.getSnapshot().editor
      // Delete acts only from where the selection is shown, never from a
      // button that happens to have focus.
      if (shortcut === "delete" && target !== document.body && !surfaceOf(target)) return
      if (shortcut === "clear-selection" && selection === null) return

      event.preventDefault()
      switch (shortcut) {
        case "undo":
          return commands.undo()
        case "redo":
          return commands.redo()
        case "duplicate":
          return commands.duplicate()
        case "delete":
          return commands.remove()
        case "move-up":
          return run((id) => ({ type: "step", id, direction: "up" }))
        case "move-down":
          return run((id) => ({ type: "step", id, direction: "down" }))
        case "clear-selection":
          return store.select(null)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isLocked, store, drag, commands, run])

  // A save that did not happen is said aloud, once.
  React.useEffect(() => {
    if (status.kind === "failed") store.announce(`Not saved: ${status.reason}`)
    if (status.kind === "conflict") {
      store.announce("Not saved: the form was changed somewhere else. Saving has stopped.")
    }
  }, [status, store])

  return (
    <div data-testid="designer-page" className="flex h-svh min-w-0 flex-col bg-background">
      <title>{`${name} · Designer · ${APP_NAME}`}</title>
      <header className="flex min-h-header shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5">
        <Link
          to={back.to}
          data-testid="designer-back"
          aria-label={`Back to ${back.label}`}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1
            data-testid="page-title"
            className="truncate font-heading text-base font-semibold tracking-tight text-foreground"
          >
            {name}
          </h1>
          <SaveStatusView />
        </div>
        <Toolbar commands={commands} isLocked={isLocked} />
        {actions}
      </header>

      {isConflict ? <ConflictBanner onReload={onReload} /> : null}

      <main
        id={mainId}
        tabIndex={-1}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto outline-none lg:flex-row lg:overflow-hidden"
      >
        <aside
          inert={isLocked}
          className="shrink-0 border-b bg-sidebar transition-opacity lg:w-designer-toolbox lg:overflow-y-auto lg:border-r lg:border-b-0 inert:opacity-50"
        >
          <Toolbox />
        </aside>
        <div inert={isConflict} className="flex min-h-96 min-w-0 flex-1 flex-col inert:opacity-50">
          <Canvas />
        </div>
        <aside
          inert={isLocked}
          className="flex shrink-0 flex-col border-t bg-sidebar transition-opacity lg:w-designer-panel lg:overflow-hidden lg:border-t-0 lg:border-l inert:opacity-50"
        >
          <OutlinePanel />
          <PropertiesPanel />
        </aside>
      </main>

      <Announcer />
      <DragLayer />
    </div>
  )
}

/** What changed, said to screen readers: every add, move, delete, undo and refusal (spec 3.6). */
function Announcer() {
  const announcement = useDesigner((snapshot) => snapshot.announcement)
  return (
    // A status live region: what is put in it is announced, politely. The
    // role is <output>'s own, and stated as well: not every screen reader
    // treats <output> as live without it (Phase 3, section 5).
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles
    <output role="status" data-testid="designer-live" className="sr-only">
      {/* A new element each time, so that the same words said twice are announced twice. */}
      <span key={announcement.count}>{announcement.text}</span>
    </output>
  )
}

/** The form was changed elsewhere: say so plainly, and offer the way out (spec 3.8). */
function ConflictBanner({ onReload }: { onReload: () => Promise<void> }) {
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle")
  return (
    <div
      role="alert"
      data-testid="designer-conflict"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-medium text-foreground">This form was changed somewhere else</p>
        <p className="text-muted-foreground">
          Your last changes here were not saved, and saving has stopped so that nothing is
          overwritten. Reload to continue from the form as it is now; the changes you made here
          since the last save will be lost.
          {state === "failed" ? " The form could not be reloaded. Try again." : ""}
        </p>
      </div>
      <Button
        variant="outline"
        data-testid="designer-conflict-reload"
        disabled={state === "loading"}
        onClick={() => {
          setState("loading")
          onReload().then(
            () => setState("idle"),
            () => setState("failed"),
          )
        }}
      >
        <RefreshCwIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={state === "loading" ? "animate-spin" : undefined}
        />
        Reload the form
      </Button>
    </div>
  )
}
