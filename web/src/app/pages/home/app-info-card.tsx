import * as React from "react"
import { RefreshCwIcon, ServerOffIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { AppInfo } from "@/generated"

import { useAppInfo } from "../../api/use-app-info"

/** Name, version and commit of the running app, as reported by /api/info. */
export function AppInfoCard() {
  const info = useAppInfo()

  return (
    <Card>
      <CardHeader>
        <CardTitle>About</CardTitle>
        <CardDescription>What is running, as reported by the server.</CardDescription>
      </CardHeader>
      <CardContent>
        {info.isError ? (
          <ServerError isRetrying={info.isFetching} onRetry={() => void info.refetch()} />
        ) : (
          <AppInfoDetails info={info.data} />
        )}
      </CardContent>
    </Card>
  )
}

function AppInfoDetails({ info }: { info: AppInfo | undefined }) {
  const isLoading = info === undefined

  return (
    <dl aria-busy={isLoading} className="grid gap-4 sm:grid-cols-3">
      <Detail label="Name" isLoading={isLoading}>
        <span data-testid="app-name">{info?.name}</span>
      </Detail>
      <Detail label="Version" isLoading={isLoading}>
        <span data-testid="app-version" className="tabular-nums">
          {info?.version}
        </span>
      </Detail>
      <Detail label="Commit" isLoading={isLoading}>
        <span data-testid="app-commit" className="font-mono">
          {info?.commit}
        </span>
      </Detail>
    </dl>
  )
}

function Detail({
  label,
  isLoading,
  children,
}: {
  label: string
  isLoading: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex h-6 items-center text-base font-medium text-foreground">
        {isLoading ? <Skeleton className="h-4 w-24" /> : children}
      </dd>
    </div>
  )
}

function ServerError({ isRetrying, onRetry }: { isRetrying: boolean; onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-testid="server-error"
      className="flex flex-col items-start gap-3 sm:flex-row sm:items-center"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <ServerOffIcon aria-hidden="true" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium text-foreground">Can&apos;t reach the server</p>
        <p className="text-muted-foreground">
          Check that the app is still running on this computer, then retry.
        </p>
      </div>
      <Button variant="outline" data-testid="server-retry" disabled={isRetrying} onClick={onRetry}>
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
