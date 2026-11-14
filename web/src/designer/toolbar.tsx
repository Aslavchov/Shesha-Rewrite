import type * as React from "react"
import {
  CheckIcon,
  CopyPlusIcon,
  EyeIcon,
  KeyboardIcon,
  LoaderCircleIcon,
  PencilRulerIcon,
  Redo2Icon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"

import { SegmentedSwitch } from "@/components/segmented-switch"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { useDesigner, useDesignerContext, useSaveStatus } from "./context"
import { shortcutHelp, shortcutText } from "./shortcuts"
import type { DesignerMode } from "./store"

const MODES = [
  { value: "design", label: "Design", icon: PencilRulerIcon, testId: "designer-mode-design" },
  { value: "preview", label: "Preview", icon: EyeIcon, testId: "designer-mode-preview" },
] as const

/** The shortcut of a command as a tooltip shows it. */
function keysOf(label: string): string {
  const [keys] = shortcutHelp().find((help) => help.label === label)?.keys ?? []
  return keys ? shortcutText(keys) : ""
}

/**
 * The designer's commands (spec 3.2, 3.5): undo, redo, duplicate, delete, and
 * Design / Preview. `commands` runs one the way a shortcut would.
 */
export function Toolbar({
  commands,
  isLocked,
}: {
  commands: {
    undo: () => void
    redo: () => void
    duplicate: () => void
    remove: () => void
  }
  /** Nothing can be changed: the form is being previewed, or is in conflict. */
  isLocked: boolean
}) {
  const { store } = useDesignerContext()
  const mode = useDesigner((snapshot) => snapshot.mode)
  const undoLabel = useDesigner((snapshot) => snapshot.editor.past.at(-1)?.label ?? null)
  const redoLabel = useDesigner((snapshot) => snapshot.editor.future.at(-1)?.label ?? null)
  const hasSelection = useDesigner((snapshot) => snapshot.editor.selection !== null)

  return (
    <div role="toolbar" aria-label="Designer" className="flex items-center gap-1">
      <ToolButton
        testId="designer-undo"
        label="Undo"
        hint={undoLabel ? `Undo: ${undoLabel}` : "Undo"}
        keys={keysOf("Undo")}
        disabled={isLocked || undoLabel === null}
        onClick={commands.undo}
      >
        <Undo2Icon aria-hidden="true" />
      </ToolButton>
      <ToolButton
        testId="designer-redo"
        label="Redo"
        hint={redoLabel ? `Redo: ${redoLabel}` : "Redo"}
        keys={keysOf("Redo")}
        disabled={isLocked || redoLabel === null}
        onClick={commands.redo}
      >
        <Redo2Icon aria-hidden="true" />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <ToolButton
        testId="designer-duplicate"
        label="Duplicate"
        keys={keysOf("Duplicate")}
        disabled={isLocked || !hasSelection}
        onClick={commands.duplicate}
      >
        <CopyPlusIcon aria-hidden="true" />
      </ToolButton>
      <ToolButton
        testId="designer-delete"
        label="Delete"
        keys={keysOf("Delete")}
        disabled={isLocked || !hasSelection}
        onClick={commands.remove}
      >
        <Trash2Icon aria-hidden="true" />
      </ToolButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <SegmentedSwitch
        label="Canvas mode"
        options={MODES}
        value={mode}
        onChange={(next: DesignerMode) => store.setMode(next)}
      />
      <ShortcutsHelp />
    </div>
  )
}

function ToolButton({
  testId,
  label,
  hint = label,
  keys,
  disabled,
  onClick,
  children,
}: {
  testId: string
  label: string
  /** What the tooltip says, when it can say more than the label. */
  hint?: string
  keys: string
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
            disabled={disabled}
            // Stays in the tab order while disabled, so that a command which
            // disables its own button does not strand keyboard focus.
            focusableWhenDisabled
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {hint}
        {keys ? <kbd className="font-sans opacity-70">{keys}</kbd> : null}
      </TooltipContent>
    </Tooltip>
  )
}

/** Where people find the shortcuts (spec 3.6). */
function ShortcutsHelp() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            data-testid="designer-shortcuts"
            aria-label="Keyboard shortcuts"
          />
        }
      >
        <KeyboardIcon aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96" data-testid="designer-shortcuts-list">
        <PopoverHeader>
          <PopoverTitle>Keyboard shortcuts</PopoverTitle>
        </PopoverHeader>
        <dl className="flex flex-col gap-1.5">
          {shortcutHelp().map((help) => (
            <div key={help.label} className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">{help.label}</dt>
              <dd className="flex shrink-0 items-center gap-1.5">
                {help.keys.map((keys, index) => (
                  <span key={keys.join("+")} className="flex items-center gap-1">
                    {index > 0 ? <span className="text-xs text-muted-foreground">or</span> : null}
                    {keys.map((key) => (
                      <kbd
                        key={key}
                        className="flex h-5 min-w-5 items-center justify-center rounded-sm border bg-muted px-1 font-sans text-xs text-foreground"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Tab moves between the toolbox, the canvas and the outline. Every move is announced to
          screen readers.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** Whether the form is saved (spec 3.8): saved, saving, or not saved and why. */
export function SaveStatusView() {
  const { autosave } = useDesignerContext()
  const status = useSaveStatus()

  const common = "flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
  if (status.kind === "saved") {
    return (
      <p data-testid="designer-save-status" data-status="saved" className={common}>
        <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
        Saved
      </p>
    )
  }
  if (status.kind === "saving") {
    return (
      <p data-testid="designer-save-status" data-status="saving" className={common}>
        <LoaderCircleIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
        />
        Saving…
      </p>
    )
  }
  const reason = status.kind === "conflict" ? "the form was changed somewhere else." : status.reason
  return (
    <div className="flex min-w-0 items-center gap-2">
      <p
        data-testid="designer-save-status"
        data-status={status.kind === "conflict" ? "conflict" : "error"}
        title={`Not saved: ${reason}`}
        className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-destructive"
      >
        <TriangleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate">Not saved: {reason}</span>
      </p>
      {status.kind === "failed" ? (
        <Button
          variant="outline"
          size="xs"
          data-testid="designer-save-retry"
          onClick={() => autosave.retry()}
        >
          <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
          Retry
        </Button>
      ) : null}
    </div>
  )
}
