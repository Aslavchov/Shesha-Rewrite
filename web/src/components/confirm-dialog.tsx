import * as React from "react"
import { AlertDialog } from "@base-ui/react/alert-dialog"

import { Button } from "@/components/ui/button"

/**
 * Asks before something that cannot be undone (spec 3.3, section 6): an
 * in-app dialog that names what will go, never the browser's own. Focus
 * starts on Cancel, Escape cancels, and a press outside does nothing.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  isBusy = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  /** What will happen, in a sentence or two. */
  children: React.ReactNode
  /** What the confirming button says, such as "Delete". */
  confirmLabel: string
  /** The action is on its way: the buttons wait. */
  isBusy?: boolean
  /** Why the action could not be done. The dialog stays open to show it. */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !isBusy) onCancel()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-overlay transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <AlertDialog.Popup
          data-testid="confirm-dialog"
          initialFocus={cancelRef}
          className="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%_-_--spacing(8))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-5 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition duration-150 ease-standard motion-reduce:transition-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:max-w-md"
        >
          <div className="flex flex-col gap-1.5">
            <AlertDialog.Title className="font-heading text-base leading-snug font-semibold">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description
              render={<div />}
              className="flex flex-col gap-2 text-muted-foreground"
            >
              {children}
            </AlertDialog.Description>
          </div>
          {error === null ? null : (
            <p
              role="alert"
              data-testid="confirm-error"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-foreground"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              ref={cancelRef}
              variant="outline"
              data-testid="confirm-cancel"
              disabled={isBusy}
              onClick={onCancel}
            >
              {error === null ? "Cancel" : "Close"}
            </Button>
            {error === null ? (
              <Button
                variant="destructive"
                data-testid="confirm-ok"
                disabled={isBusy}
                onClick={onConfirm}
              >
                {confirmLabel}
              </Button>
            ) : null}
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
