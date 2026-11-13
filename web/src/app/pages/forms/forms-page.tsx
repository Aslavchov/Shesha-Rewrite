import { ChevronRightIcon, FileTextIcon } from "lucide-react"
import { Link } from "react-router"

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { FormSummary } from "@/generated"

import { useForms } from "../../api/use-forms"
import { Page } from "../../layout/page"
import { FORMS_PAGE, formPath } from "../../pages"
import { RequestError } from "./request-error"

/** Every form in the app. Each opens at /forms/<id>. */
export function FormsPage() {
  const forms = useForms()

  return (
    <Page title={FORMS_PAGE.title} description="Every form in this app. Open one to fill it in.">
      {forms.isError ? (
        <RequestError
          testId="forms-error"
          title="Can't load the forms"
          isRetrying={forms.isFetching}
          onRetry={() => void forms.refetch()}
        />
      ) : forms.data === undefined ? (
        <FormsLoading />
      ) : forms.data.forms.length === 0 ? (
        <FormsEmpty />
      ) : (
        <FormsList forms={forms.data.forms} />
      )}
    </Page>
  )
}

function FormsList({ forms }: { forms: FormSummary[] }) {
  return (
    <ul
      data-testid="forms-list"
      className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      {forms.map((form) => (
        <li key={form.id}>
          <Link
            to={formPath(form.id)}
            data-testid="forms-item"
            className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:-outline-offset-2"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileTextIcon aria-hidden="true" className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span data-testid="forms-item-name" className="truncate font-medium text-foreground">
                {form.name}
              </span>
              {form.description ? (
                <span data-testid="forms-item-description" className="text-muted-foreground">
                  {form.description}
                </span>
              ) : null}
              <span data-testid="forms-item-updated" className="text-xs text-muted-foreground">
                Updated <time dateTime={form.updatedAt}>{formatUpdated(form.updatedAt)}</time>
              </span>
            </span>
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}

const UPDATED_FORMAT = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" })

/** A moment in time, shown in the reader's own time zone: "13 Nov 2026, 09:15". */
function formatUpdated(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : UPDATED_FORMAT.format(date)
}

function FormsEmpty() {
  return (
    <Empty data-testid="forms-empty" className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileTextIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No forms yet</EmptyTitle>
        <EmptyDescription>
          Forms are created through the API for now. Start the app with --demo to add a sample form.
          The designer arrives in Phase 2.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function FormsLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading forms"
      className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 shadow-xs"
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-80 max-w-full" />
    </div>
  )
}
