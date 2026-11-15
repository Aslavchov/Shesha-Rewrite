import * as React from "react"
import {
  CheckIcon,
  CircleDotIcon,
  LoaderCircleIcon,
  Redo2Icon,
  RefreshCwIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PANEL_POPUP_ATTRIBUTE } from "@/designer/properties/described-by"
import { Autosave } from "@/designer/save"
import type { Registry } from "@/forms/runtime"
import type { ThemeDocument, ThemeRecord, ThemeState } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import type { Mode } from "../variables"
import { ColoursSection } from "./colours-section"
import { ComponentsSection } from "./components-section"
import {
  ThemeEditorContext,
  type ThemeEditorContextValue,
  useThemeEditor,
  useThemeEditorContext,
  useThemeSaveStatus,
} from "./context"
import { EMPTY_THEME, isBuiltIn, sameTheme } from "./model"
import { ThemePreview } from "./preview"
import { ScalesSection } from "./scales-section"
import { ThemeEditorStore } from "./store"

/** What the editor asks of the server (ADR 0010). */
export type ThemeApi = {
  readonly save: (
    revision: number,
    document: ThemeDocument,
    options: { keepalive: boolean },
  ) => Promise<ThemeState>
  readonly publish: (revision: number) => Promise<ThemeState>
  readonly discard: (revision: number) => Promise<ThemeState>
  /** Reads the theme as the server has it now: for a reload after a conflict. */
  readonly load: () => Promise<ThemeState>
}

export type ThemeEditorProps = {
  /** The theme as it was loaded. Changing it later does not reset the editor. */
  state: ThemeState
  /** The component types whose defaults can be set, and that the preview shows. */
  registry: Registry
  api: ThemeApi
  /** The scheme the preview starts in: the one the page uses. */
  initialMode: Mode
  /** Called when another theme is published, so that the app around the editor follows. */
  onPublished: (record: ThemeRecord) => void
}

/**
 * The theme editor (Phase 4, ADR 0010): the app's colours, roundness, text
 * size and density, and a default look for each component, edited as a draft
 * beside a live preview, and published to the whole app.
 */
export function ThemeEditor({ state, registry, api, initialMode, onPublished }: ThemeEditorProps) {
  const [context] = React.useState<ThemeEditorContextValue>(() => {
    const store = new ThemeEditorStore(state.draft.document, state.published, initialMode)
    const autosave = new Autosave({
      record: state.draft,
      send: async (revision, document: ThemeDocument, options) => {
        const saved = await api.save(revision, document, options)
        return { ...saved, revision: saved.draft.revision }
      },
    })
    return { store, autosave, registry }
  })
  const { store, autosave } = context

  // Every change to the draft reaches autosave, which decides when to send it.
  React.useEffect(() => {
    const tell = () => autosave.changed(store.getSnapshot().editor.document)
    tell()
    const unsubscribe = store.subscribe(tell)
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
      autosave.flush()
      autosave.dispose()
    }
  }, [store, autosave])

  return (
    <ThemeEditorContext value={context}>
      <Workspace api={api} onPublished={onPublished} />
    </ThemeEditorContext>
  )
}

const isMac = () => /mac/i.test(navigator.platform)

function Workspace({ api, onPublished }: Pick<ThemeEditorProps, "api" | "onPublished">) {
  const { store, autosave } = useThemeEditorContext()
  const status = useThemeSaveStatus()
  const isConflict = status.kind === "conflict"
  const [busy, setBusy] = React.useState<"publish" | "discard" | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)

  // A save that did not happen is said aloud, once.
  React.useEffect(() => {
    if (status.kind === "failed") store.announce(`Not saved: ${status.reason}`)
    if (status.kind === "conflict") {
      store.announce("Not saved: the theme was changed somewhere else. Saving has stopped.")
    }
  }, [status, store])

  /**
   * Publishing and discarding act on the draft the server has, so what is
   * on screen is saved first. A conflict found on the way stops autosave,
   * like any other.
   */
  const act = async (kind: "publish" | "discard") => {
    setBusy(kind)
    setFailure(null)
    try {
      const settled = await autosave.settle()
      if (settled.kind !== "saved") return
      if (kind === "publish") {
        const next = await api.publish(autosave.revision)
        store.setPublished(next.published)
        onPublished(next.published)
        store.announce("Published. The whole app uses this theme now.")
      } else {
        const next = await api.discard(autosave.revision)
        // The server's draft is the published theme again. Here it is one
        // more step, so it can be undone like any other change.
        const document = next.draft.document
        autosave.restart({ revision: next.draft.revision, document })
        store.run({ type: "replace", document, label: "Discard the unpublished changes" })
        store.setPublished(next.published)
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "revision_conflict") {
        // Someone else changed the draft: the next save finds the same, and says so.
        autosave.changed({ ...store.getSnapshot().editor.document })
        autosave.flush()
      } else {
        const reason = error instanceof ApiRequestError ? error.message : "Something went wrong."
        setFailure(`${kind === "publish" ? "Not published" : "Not discarded"}: ${reason}`)
        store.announce(`${kind === "publish" ? "Not published" : "Not discarded"}: ${reason}`)
      }
    } finally {
      setBusy(null)
    }
  }

  const editorRef = React.useRef<HTMLDivElement>(null)

  // Undo and redo, heard on the window like the designer's shortcuts: a
  // popup of the editor is drawn outside it, and an event that comes through
  // a portal can reach a React handler more than once.
  React.useEffect(() => {
    if (isConflict) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(isMac() ? event.metaKey : event.ctrlKey) || event.altKey) {
        return
      }
      const key = event.key.toLowerCase()
      const command =
        key === "z" && !event.shiftKey ? "undo" : key === "y" || key === "z" ? "redo" : null
      if (command === null) return
      // In the editor and its popups, undo and redo are the theme's, a run of
      // typing at a time, never the browser's own undo of some field (ADR 0009).
      const target = event.target instanceof Element ? event.target : null
      const inEditor =
        target !== null &&
        (editorRef.current?.contains(target) === true ||
          target.closest(`[${PANEL_POPUP_ATTRIBUTE}]`) !== null)
      if (!inEditor) return
      event.preventDefault()
      store.run({ type: command })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isConflict, store])

  return (
    <div ref={editorRef} data-testid="theme-editor" className="flex min-w-0 flex-col gap-6">
      <ActionBar
        busy={busy}
        isConflict={isConflict}
        failure={failure}
        onPublish={() => void act("publish")}
        onDiscard={() => void act("discard")}
      />
      {isConflict ? (
        <ConflictBanner
          onReload={async () => {
            const latest = await api.load()
            store.reset(latest.draft.document, latest.published)
            autosave.restart(latest.draft)
            onPublished(latest.published)
            store.announce("Reloaded the theme as it is now.")
          }}
        />
      ) : null}
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div inert={isConflict} className="flex min-w-0 flex-col gap-6 inert:opacity-50">
          <ColoursSection />
          <ScalesSection />
          <ComponentsSection />
        </div>
        <ThemePreview />
      </div>
      <Announcer />
    </div>
  )
}

function ActionBar({
  busy,
  isConflict,
  failure,
  onPublish,
  onDiscard,
}: {
  busy: "publish" | "discard" | null
  isConflict: boolean
  failure: string | null
  onPublish: () => void
  onDiscard: () => void
}) {
  const { store } = useThemeEditorContext()
  const draft = useThemeEditor((snapshot) => snapshot.editor.document)
  const published = useThemeEditor((snapshot) => snapshot.published)
  const undo = useThemeEditor((snapshot) => snapshot.editor.past.at(-1)?.label)
  const redo = useThemeEditor((snapshot) => snapshot.editor.future.at(-1)?.label)
  const unpublished = !sameTheme(draft, published.document)
  const locked = isConflict || busy !== null

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p
          data-testid="theme-status"
          data-status={unpublished ? "unpublished" : "published"}
          className="flex items-center gap-1.5 font-medium text-foreground"
        >
          {unpublished ? (
            <CircleDotIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
          ) : (
            <CheckIcon aria-hidden="true" className="size-4 shrink-0 text-success" />
          )}
          {unpublished ? "Unpublished changes" : "Published"}
        </p>
        <p className="text-xs text-muted-foreground">
          {unpublished
            ? "Only the preview shows this draft. Publish it to restyle the whole app."
            : "The whole app uses this theme. Changes are a draft until you publish them."}
        </p>
        {failure ? (
          <p role="alert" data-testid="theme-failure" className="text-xs text-destructive">
            {failure}
          </p>
        ) : null}
      </div>
      <SaveStatusView />
      <div className="flex flex-wrap items-center gap-1">
        <IconButton
          testId="theme-undo"
          label={undo ? `Undo: ${undo}` : "Undo"}
          disabled={locked || undo === undefined}
          onClick={() => store.run({ type: "undo" })}
        >
          <Undo2Icon aria-hidden="true" />
        </IconButton>
        <IconButton
          testId="theme-redo"
          label={redo ? `Redo: ${redo}` : "Redo"}
          disabled={locked || redo === undefined}
          onClick={() => store.run({ type: "redo" })}
        >
          <Redo2Icon aria-hidden="true" />
        </IconButton>
        <Button
          variant="ghost"
          data-testid="theme-reset-default"
          disabled={locked || isBuiltIn(draft)}
          onClick={() =>
            store.run({
              type: "replace",
              document: EMPTY_THEME,
              label: "Reset to the default look",
            })
          }
        >
          <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
          Reset to default
        </Button>
        <Button
          variant="outline"
          data-testid="theme-discard"
          disabled={locked || !unpublished}
          onClick={onDiscard}
        >
          Discard
        </Button>
        <Button data-testid="theme-publish" disabled={locked || !unpublished} onClick={onPublish}>
          {busy === "publish" ? (
            <LoaderCircleIcon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
            />
          ) : (
            <UploadIcon aria-hidden="true" data-icon="inline-start" />
          )}
          Publish
        </Button>
      </div>
    </div>
  )
}

function IconButton({
  testId,
  label,
  disabled,
  onClick,
  children,
}: {
  testId: string
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            data-testid={testId}
            aria-label={label}
            // Focusable while disabled, so that focus is not lost when the last step is undone.
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Whether the draft is saved on the server. */
function SaveStatusView() {
  const { autosave } = useThemeEditorContext()
  const status = useThemeSaveStatus()
  const common = "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"

  if (status.kind === "saved") {
    return (
      <p data-testid="theme-save-status" data-status="saved" className={common}>
        <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
        Draft saved
      </p>
    )
  }
  if (status.kind === "saving") {
    return (
      <p data-testid="theme-save-status" data-status="saving" className={common}>
        <LoaderCircleIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
        />
        Saving the draft…
      </p>
    )
  }
  const reason =
    status.kind === "conflict" ? "the theme was changed somewhere else." : status.reason
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p
        data-testid="theme-save-status"
        data-status={status.kind === "conflict" ? "conflict" : "error"}
        className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-destructive"
      >
        <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>Not saved: {reason}</span>
      </p>
      {status.kind === "failed" ? (
        <Button
          variant="outline"
          size="xs"
          data-testid="theme-save-retry"
          onClick={() => autosave.retry()}
        >
          <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
          Retry
        </Button>
      ) : null}
    </div>
  )
}

/** What changed, said to screen readers. */
function Announcer() {
  const announcement = useThemeEditor((snapshot) => snapshot.announcement)
  return (
    // oxlint-disable-next-line jsx-a11y/no-redundant-roles -- as in the designer: not every screen reader treats <output> as live
    <output role="status" data-testid="theme-live" className="sr-only">
      <span key={announcement.count}>{announcement.text}</span>
    </output>
  )
}

/** The draft was changed elsewhere: say so plainly, and offer the way out (spec 4.1). */
function ConflictBanner({ onReload }: { onReload: () => Promise<void> }) {
  const [state, setState] = React.useState<"idle" | "loading" | "failed">("idle")
  return (
    <div
      role="alert"
      data-testid="theme-conflict"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
    >
      <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="font-medium text-foreground">The theme was changed somewhere else</p>
        <p className="text-muted-foreground">
          Your last changes here were not saved, and saving has stopped so that nothing is
          overwritten. Reload to continue from the theme as it is now; the changes you made here
          since the last save will be lost.
          {state === "failed" ? " The theme could not be reloaded. Try again." : ""}
        </p>
      </div>
      <Button
        variant="outline"
        data-testid="theme-conflict-reload"
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
        Reload the theme
      </Button>
    </div>
  )
}
