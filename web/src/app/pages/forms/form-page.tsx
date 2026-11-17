import * as React from "react"
import { cn } from "cn"
import { ChevronLeftIcon, FileQuestionIcon } from "lucide-react"
import { Link, useParams } from "react-router"

import { Submission } from "@/components/submission"
import { buttonVariants } from "@/components/ui/button"
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
import { registry } from "@/forms/registry"
import {
  type FormMode,
  FormRenderer,
  formSettings,
  wantsWidth,
  type NestedValues,
  resolveSettings,
} from "@/forms/runtime"
import { FORM_FORMAT_VERSION, type FormRecord } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import { useForm } from "../../api/use-forms"
import { Page } from "../../layout/page"
import { FORMS_PAGE } from "../../pages"
import { BoundForm } from "./bound-form"
import { ModeSwitch } from "./mode-switch"
import { RequestError } from "./request-error"

const FORM_NOT_FOUND = "form_not_found"

/** One form, rendered: fill it in, or view it read-only. */
export function FormPage() {
  const { formId = "", rowId } = useParams()
  const form = useForm(formId)

  if (form.data !== undefined) {
    // A form bound to an entity loads and saves a row of it (Phase 5).
    const entity =
      form.data.document.formatVersion === FORM_FORMAT_VERSION
        ? resolveSettings(formSettings, form.data.document.settings).settings.entity
        : null
    if (entity !== null) {
      return (
        <BoundForm
          // Another form, another revision of it, or another row starts afresh.
          key={`${form.data.id}@${form.data.revision}`}
          form={form.data}
          entityName={entity}
          rowId={rowId ?? null}
        />
      )
    }
    // Keyed by id and revision, so another form, or a newer revision of this
    // one, starts from its own defaults.
    return <LoadedForm key={`${form.data.id}@${form.data.revision}`} form={form.data} />
  }
  if (form.error instanceof ApiRequestError && form.error.code === FORM_NOT_FOUND) {
    return <FormNotFound />
  }
  return (
    <Page title="Form" breadcrumb={<BackToForms />}>
      {form.isError ? (
        <RequestError
          testId="form-error"
          title="Can't load this form"
          isRetrying={form.isFetching}
          onRetry={() => void form.refetch()}
        />
      ) : (
        <div aria-busy="true" aria-label="Loading form" className="flex max-w-2xl flex-col gap-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      )}
    </Page>
  )
}

function LoadedForm({ form }: { form: FormRecord }) {
  const [mode, setMode] = React.useState<FormMode>("edit")
  const [submitted, setSubmitted] = React.useState<NestedValues | null>(null)
  // A document in a format this build cannot read may not have a name.
  const name = typeof form.document.name === "string" ? form.document.name : "Form"

  return (
    <Page title={name} description={form.document.description} breadcrumb={<BackToForms />}>
      {/* A form that lists data takes the page's width; fields read best in a column. */}
      <div
        className={cn(
          "flex min-w-0 flex-col gap-6",
          wantsWidth(form.document, registry) ? "max-w-full" : "max-w-2xl",
        )}
      >
        {/* The switch sits on the form it controls. */}
        <div className="flex flex-col gap-2">
          <ModeSwitch mode={mode} onChange={setMode} />
          <Card>
            <CardContent>
              <FormRenderer
                document={form.document}
                registry={registry}
                mode={mode}
                onSubmit={setSubmitted}
                onReset={() => setSubmitted(null)}
              />
            </CardContent>
          </Card>
        </div>
        {submitted === null ? null : <Submission values={submitted} />}
      </div>
    </Page>
  )
}

export function BackToForms() {
  return (
    <Link
      to={FORMS_PAGE.path}
      data-testid="form-back"
      className="-ml-0.5 flex w-fit items-center gap-0.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {FORMS_PAGE.title}
    </Link>
  )
}

function FormNotFound() {
  return (
    <Page title="Form not found">
      <Empty data-testid="form-not-found" className="border">
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
            to={FORMS_PAGE.path}
            data-testid="form-not-found-link"
            className={buttonVariants({ variant: "outline" })}
          >
            Back to Forms
          </Link>
        </EmptyContent>
      </Empty>
    </Page>
  )
}
