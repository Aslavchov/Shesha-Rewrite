import type * as React from "react"
import { ChevronLeftIcon, ExternalLinkIcon, FileQuestionIcon } from "lucide-react"
import { Link, useParams } from "react-router"

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Designer } from "@/designer/designer"
import { registry } from "@/forms/registry"
import { FormRenderer } from "@/forms/runtime"
import { APP_NAME, FORM_FORMAT_VERSION } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import { fetchForm, useFormToDesign, useSaveForm } from "../../api/use-forms"
import { MAIN_CONTENT_ID, SkipLink } from "../../layout/skip-link"
import { DESIGNER_PAGE, formPath } from "../../pages"
import { ThemeToggle } from "../../theme/theme-toggle"
import { RequestError } from "../forms/request-error"

const FORM_NOT_FOUND = "form_not_found"
const BACK = { to: DESIGNER_PAGE.path, label: DESIGNER_PAGE.title }

/**
 * The designer for one form, at /designer/<id>. It takes the whole window:
 * the app's sidebar gives way to the toolbox, the canvas and the outline, and
 * the back link returns to the list.
 */
export function DesignerPage() {
  const { formId = "" } = useParams()
  const form = useFormToDesign(formId)
  const { save, saved } = useSaveForm(formId)

  if (form.data !== undefined) {
    // A document in a format this build cannot read is not opened for editing.
    if (form.data.document.formatVersion !== FORM_FORMAT_VERSION) {
      return (
        <Frame title="Designer">
          <FormRenderer document={form.data.document} registry={registry} mode="read-only" />
        </Frame>
      )
    }
    return (
      <>
        <SkipLink />
        <Designer
          // Another form is another designer, with its own history.
          key={form.data.id}
          record={form.data}
          registry={registry}
          mainId={MAIN_CONTENT_ID}
          save={save}
          load={() => fetchForm(formId)}
          onSaved={saved}
          back={BACK}
          actions={
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      to={formPath(formId)}
                      data-testid="designer-open-form"
                      aria-label="Open the form"
                      className={buttonVariants({ variant: "ghost", size: "icon" })}
                    />
                  }
                >
                  <ExternalLinkIcon aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>Open the form to fill it in</TooltipContent>
              </Tooltip>
              <ThemeToggle />
            </>
          }
        />
      </>
    )
  }

  if (form.error instanceof ApiRequestError && form.error.code === FORM_NOT_FOUND) {
    return (
      <Frame title="Form not found">
        <Empty data-testid="designer-not-found" className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestionIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>There is no form at this address</EmptyTitle>
            <EmptyDescription>
              It may have been deleted, or the link may be out of date.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              to={DESIGNER_PAGE.path}
              data-testid="designer-not-found-link"
              className={buttonVariants({ variant: "outline" })}
            >
              Back to Designer
            </Link>
          </EmptyContent>
        </Empty>
      </Frame>
    )
  }

  return (
    <Frame title="Designer">
      {form.isError ? (
        <RequestError
          testId="designer-error"
          title="Can't load this form"
          isRetrying={form.isFetching}
          onRetry={() => void form.refetch()}
        />
      ) : (
        <div aria-busy="true" aria-label="Loading form" className="flex flex-col gap-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      )}
    </Frame>
  )
}

/** The same top bar as the designer, around whatever is shown instead of it. */
function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SkipLink />
      <div className="flex min-h-svh flex-col bg-background">
        <title>{`${title} · ${APP_NAME}`}</title>
        <header className="flex h-header shrink-0 items-center gap-3 border-b px-3">
          <Link
            to={BACK.to}
            data-testid="designer-back"
            aria-label={`Back to ${BACK.label}`}
            className={buttonVariants({ variant: "ghost", size: "icon" })}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Link>
          <h1
            data-testid="page-title"
            className="min-w-0 flex-1 truncate font-heading text-base font-semibold tracking-tight text-foreground"
          >
            {title}
          </h1>
          <ThemeToggle />
        </header>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 outline-none"
        >
          {children}
        </main>
      </div>
    </>
  )
}
