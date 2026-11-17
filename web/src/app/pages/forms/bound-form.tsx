import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  ChevronLeftIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  FileQuestionIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router"

import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { INVALID_ROW, REVISION_CONFLICT, ROW_NOT_FOUND } from "@/data/api"
import { DATA_KEYS, useCatalog, useDataClient } from "@/data/client"
import { registry } from "@/forms/registry"
import {
  type FormMode,
  FormRenderer,
  type NestedValues,
  type PathProblem,
  type SubmittedForm,
} from "@/forms/runtime"
import type { DataRow, DataValues, EntityDefinition, FormRecord } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import type { BackTarget } from "../../layout/app-shell"
import { Page } from "../../layout/page"
import { formPath, FORMS_PAGE } from "../../pages"
import { ModeSwitch } from "./mode-switch"
import { RequestError } from "./request-error"

/**
 * A form bound to an entity (spec 5.3): opened for a row, whose id is in the
 * address, it loads the row's values and Save updates it; opened without
 * one, Save creates a row and the address then carries its id.
 */

type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved"; readonly created: boolean }
  | { readonly kind: "failed"; readonly message: string; readonly problems: readonly PathProblem[] }
  | { readonly kind: "conflict" }

const FORMS_BACK: BackTarget = { to: FORMS_PAGE.path, label: FORMS_PAGE.title }

/** What the page was told when it was opened: where from, and whether a row was just created. */
function useArrival(): { back: BackTarget; created: boolean } {
  const state: unknown = useLocation().state
  const read = (value: unknown): BackTarget | null => {
    if (typeof value !== "object" || value === null) return null
    const { to, label } = value as { to?: unknown; label?: unknown }
    return typeof to === "string" && typeof label === "string" && to.startsWith("/")
      ? { to, label }
      : null
  }
  const record =
    typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {}
  return { back: read(record.back) ?? FORMS_BACK, created: record.created === true }
}

function Back({ target }: { target: BackTarget }) {
  return (
    <Link
      to={target.to}
      data-testid="form-back"
      className="-ml-0.5 flex w-fit items-center gap-0.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {target.label}
    </Link>
  )
}

export function BoundForm({
  form,
  entityName,
  rowId,
}: {
  form: FormRecord
  entityName: string
  rowId: string | null
}) {
  const catalog = useCatalog()
  const { api, queries } = useDataClient()
  const { back } = useArrival()
  const entity = catalog.entity(entityName)

  // Read once per visit and never refreshed behind the form's back: what a
  // person has typed must not be replaced, and a newer row on the server is
  // a conflict the save reports.
  const row = useQuery(
    {
      queryKey: ["form-row", entityName, rowId],
      queryFn: ({ signal }) => api.row(entityName, rowId ?? "", signal),
      enabled: rowId !== null && entity !== undefined,
      staleTime: Infinity,
      gcTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    queries,
  )

  const name = form.document.name
  if (!entity) {
    return (
      <Page title={name} breadcrumb={<Back target={back} />}>
        {catalog.status === "loading" ? (
          <Loading />
        ) : catalog.status === "error" ? (
          <RequestError
            testId="form-error"
            title="Can't load this form's entity"
            isRetrying={false}
            onRetry={catalog.refetch}
          />
        ) : (
          <p
            role="alert"
            data-testid="form-entity-missing"
            className="rounded-xl border border-dashed border-input bg-muted/50 p-4 text-muted-foreground"
          >
            This form is bound to “{entityName}”, which is not an entity. Open the form in the
            designer and choose another.
          </p>
        )}
      </Page>
    )
  }
  if (rowId !== null && row.data === undefined) {
    const missing = row.error instanceof ApiRequestError && row.error.code === ROW_NOT_FOUND
    return (
      <Page
        title={missing ? `${entity.displayName} not found` : name}
        breadcrumb={<Back target={back} />}
      >
        {missing ? (
          <Empty data-testid="form-row-not-found" className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileQuestionIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>
                There is no {entity.displayName.toLowerCase()} at this address
              </EmptyTitle>
              <EmptyDescription>
                It may have been deleted, or the link may be out of date.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Link to={back.to} className={buttonVariants({ variant: "outline" })}>
                Back to {back.label}
              </Link>
            </EmptyContent>
          </Empty>
        ) : row.isError ? (
          <RequestError
            testId="form-error"
            title={`Can't load this ${entity.displayName.toLowerCase()}`}
            isRetrying={row.isFetching}
            onRetry={() => void row.refetch()}
          />
        ) : (
          <Loading />
        )}
      </Page>
    )
  }
  return (
    <Editor
      // Another row is another form: its values and its status start afresh.
      key={rowId ?? "new"}
      form={form}
      entity={entity}
      loaded={row.data ?? null}
      back={back}
      reload={async () => (await row.refetch({ throwOnError: true })).data ?? null}
    />
  )
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex max-w-2xl flex-col gap-4">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-2/3" />
    </div>
  )
}

function Editor({
  form,
  entity,
  loaded,
  back,
  reload,
}: {
  form: FormRecord
  entity: EntityDefinition
  loaded: DataRow | null
  back: BackTarget
  reload: () => Promise<DataRow | null>
}) {
  const { api, queries } = useDataClient()
  const navigate = useNavigate()
  const location = useLocation()
  const arrival = useArrival()
  const [mode, setMode] = React.useState<FormMode>("edit")
  /** The row as the server last gave it: what Save is based on. Null until one exists. */
  const [row, setRow] = React.useState(loaded)
  const [save, setSave] = React.useState<SaveState>({ kind: "idle" })
  // A row just created arrives here at its new address, as a new form. What
  // a live region holds when it appears is not read out, so the result is
  // put there a moment after, to be heard.
  const created = arrival.created
  React.useEffect(() => {
    if (!created) return
    const timer = window.setTimeout(() => setSave({ kind: "saved", created: true }), 100)
    return () => window.clearTimeout(timer)
  }, [created])
  const [isReloading, setIsReloading] = React.useState(false)

  const readOnlyPaths = React.useMemo(
    () => new Set(entity.properties.filter((property) => property.readOnly).map((p) => p.name)),
    [entity],
  )
  // The same object until the row changes: the form starts again only then.
  const values = React.useMemo<NestedValues | undefined>(() => row?.values, [row])

  const submit = (submitted: NestedValues, shown: SubmittedForm) => {
    if (save.kind === "saving" || save.kind === "conflict") return
    // Only the entity's own properties, and none a form may not change.
    const payload: DataValues = {}
    for (const property of entity.properties) {
      const value = submitted[property.name]
      if (
        property.readOnly ||
        value === undefined ||
        (typeof value === "object" && value !== null)
      ) {
        continue
      }
      payload[property.name] = value
    }
    setSave({ kind: "saving" })
    const request = row
      ? api.updateRow(entity.name, row.id, row.revision, payload)
      : api.createRow(entity.name, payload)
    request.then(
      (stored) => {
        void queries.invalidateQueries({ queryKey: DATA_KEYS.rows(entity.name) })
        queries.setQueryData(["form-row", entity.name, stored.id], stored)
        if (row) {
          setRow(stored)
          setSave({ kind: "saved", created: false })
        } else {
          // The address now carries the new row's id, so a reload shows it.
          void navigate(formPath(form.id, stored.id), {
            replace: true,
            state: { ...(location.state as object | null), created: true },
          })
        }
      },
      (error: unknown) => {
        if (error instanceof ApiRequestError && error.code === REVISION_CONFLICT) {
          setSave({ kind: "conflict" })
        } else if (error instanceof ApiRequestError && error.code === INVALID_ROW) {
          // The server's problems go onto the fields; the rest are listed.
          const problems = shown.showProblems(error.details)
          setSave({
            kind: "failed",
            message:
              error.details.length === 1
                ? "Not saved: one value was not accepted."
                : `Not saved: ${error.details.length} values were not accepted.`,
            problems,
          })
        } else {
          setSave({
            kind: "failed",
            message: `Not saved. ${error instanceof Error ? error.message : "Try again."}`,
            problems: [],
          })
        }
      },
    )
  }

  const title = row ? row.display : `New ${entity.displayName.toLowerCase()}`
  return (
    <Page title={title} description={form.document.name} breadcrumb={<Back target={back} />}>
      <div className="flex max-w-2xl flex-col gap-4">
        {save.kind === "conflict" ? (
          <div
            role="alert"
            data-testid="form-conflict"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3"
          >
            <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="font-medium text-foreground">
                This {entity.displayName.toLowerCase()} was changed somewhere else
              </p>
              <p className="text-muted-foreground">
                Your changes were not saved, so that nothing is overwritten. Reload to see it as it
                is now; what you changed here will be lost.
              </p>
            </div>
            <Button
              variant="outline"
              data-testid="form-conflict-reload"
              disabled={isReloading}
              onClick={() => {
                setIsReloading(true)
                reload().then(
                  (latest) => {
                    setIsReloading(false)
                    if (latest) setRow(latest)
                    setSave({ kind: "idle" })
                  },
                  () => setIsReloading(false),
                )
              }}
            >
              <RefreshCwIcon
                aria-hidden="true"
                data-icon="inline-start"
                className={isReloading ? "animate-spin" : undefined}
              />
              Reload
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ModeSwitch mode={mode} onChange={setMode} />
            <SaveStatus state={save} isNew={row === null} />
          </div>
          <Card>
            <CardContent>
              <FormRenderer
                document={form.document}
                registry={registry}
                mode={mode}
                values={values}
                readOnlyPaths={readOnlyPaths}
                onSave={submit}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </Page>
  )
}

/** Progress, success and failure of a save, said aloud as they happen (spec 5.3). */
function SaveStatus({ state, isNew }: { state: SaveState; isNew: boolean }) {
  const failed = state.kind === "failed" || state.kind === "conflict"
  return (
    <div
      // A failure interrupts; progress and success wait their turn.
      role={failed ? "alert" : "status"}
      data-testid="form-save-status"
      data-state={state.kind}
      className="flex min-h-6 min-w-0 flex-col items-end text-sm text-muted-foreground"
    >
      {state.kind === "saving" ? (
        <span className="flex items-center gap-1.5">
          <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
          Saving…
        </span>
      ) : state.kind === "saved" ? (
        <span className="flex items-center gap-1.5 text-foreground">
          <CircleCheckIcon aria-hidden="true" className="size-4 text-success" />
          {state.created ? "Created and saved" : "Saved"}
        </span>
      ) : state.kind === "failed" ? (
        <span className="flex flex-col items-end gap-0.5 text-right text-foreground">
          <span className="flex items-center gap-1.5">
            <CircleAlertIcon aria-hidden="true" className="size-4 shrink-0 text-destructive" />
            {state.message}
          </span>
          {state.problems.map((problem) => (
            <span key={problem.path} className="text-muted-foreground">
              {problem.path}: {problem.message}
            </span>
          ))}
        </span>
      ) : state.kind === "conflict" ? (
        <span className="flex items-center gap-1.5 text-foreground">
          <CircleAlertIcon aria-hidden="true" className="size-4 text-destructive" />
          Not saved: changed somewhere else
        </span>
      ) : isNew ? (
        "Not saved yet"
      ) : null}
    </div>
  )
}
