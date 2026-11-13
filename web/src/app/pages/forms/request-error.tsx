import { RefreshCwIcon, ServerOffIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

/** A request to the server failed: say so, and offer to try again. */
export function RequestError({
  testId,
  title,
  isRetrying,
  onRetry,
}: {
  testId: string
  title: string
  isRetrying: boolean
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <ServerOffIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium text-foreground">{title}</p>
        <p className="text-muted-foreground">
          Check that the app is still running on this computer, then retry.
        </p>
      </div>
      <Button
        variant="outline"
        data-testid={`${testId}-retry`}
        disabled={isRetrying}
        onClick={onRetry}
      >
        <RefreshCwIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={isRetrying ? "animate-spin" : undefined}
        />
        Retry
      </Button>
    </div>
  )
}
