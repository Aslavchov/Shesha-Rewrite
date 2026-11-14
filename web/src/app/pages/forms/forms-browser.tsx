import { ChevronRightIcon, FileTextIcon, PencilRulerIcon } from "lucide-react"
import { Link } from "react-router"

import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { FormSummary } from "@/generated"

import { useForms } from "../../api/use-forms"
import { designerPath, formPath } from "../../pages"
import { NewForm } from "./new-form"
import { RequestError } from "./request-error"

/**
 * Every form in the app, as a list. On the Forms page a form opens to be
 * filled in, with a second action to open it in the designer; on the Designer
 * page it opens in the designer.
 */
export function FormsBrowser({ opens }: { opens: "form" | "designer" }) {
  const forms = useForms()

  if (forms.isError) {
    return (
      <RequestError
        testId="forms-error"
        title="Can't load the forms"
        isRetrying={forms.isFetching}
        onRetry={() => void forms.refetch()}
      />
    )
  }
  if (forms.data === undefined) return <FormsLoading />
  if (forms.data.forms.length === 0) return <FormsEmpty />
  return <FormsList forms={forms.data.forms} opens={opens} />
}

function FormsList({ forms, opens }: { forms: FormSummary[]; opens: "form" | "designer" }) {
  return (
    <ul
      data-testid="forms-list"
      className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      {forms.map((form) => (
        <li key={form.id} className="flex items-center transition-colors hover:bg-muted/50">
          <Link
            to={opens === "form" ? formPath(form.id) : designerPath(form.id)}
            data-testid="forms-item"
            className="group flex min-w-0 flex-1 items-center gap-4 py-4 pr-3 pl-5 focus-visible:-outline-offset-2"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {opens === "form" ? (
                <FileTextIcon aria-hidden="true" className="size-4" />
              ) : (
                <PencilRulerIcon aria-hidden="true" className="size-4" />
              )}
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
            {opens === "designer" ? (
              <ChevronRightIcon
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            ) : null}
          </Link>
          {opens === "form" ? (
            <Link
              to={designerPath(form.id)}
              data-testid="forms-open-designer"
              aria-label={`Open ${form.name} in designer`}
              className={buttonVariants({ variant: "outline", size: "sm", className: "mr-4" })}
            >
              <PencilRulerIcon aria-hidden="true" data-icon="inline-start" />
              Open in designer
            </Link>
          ) : null}
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
          Create a form to start designing it. Starting the app with --demo adds a sample form.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <NewForm />
      </EmptyContent>
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
