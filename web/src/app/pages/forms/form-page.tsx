import * as React from "react"
import { ChevronLeftIcon, CircleCheckIcon, FileQuestionIcon } from "lucide-react"
import { Link, useParams } from "react-router"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { type FormMode, FormRenderer, type NestedValues } from "@/forms/runtime"
import type { FormRecord } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import { useForm } from "../../api/use-forms"
import { Page } from "../../layout/page"
import { FORMS_PAGE } from "../../pages"
import { ModeSwitch } from "./mode-switch"
import { RequestError } from "./request-error"

const FORM_NOT_FOUND = "form_not_found"

/** One form, rendered: fill it in, or view it read-only. */
export function FormPage() {
  const { formId = "" } = useParams()
  const form = useForm(formId)

  if (form.data !== undefined) {
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
    <Page
      title={name}
      description={form.document.description}
      breadcrumb={<BackToForms />}
      actions={<ModeSwitch mode={mode} onChange={setMode} />}
    >
      <div className="flex max-w-2xl flex-col gap-6">
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
        {submitted === null ? null : <Submission values={submitted} />}
      </div>
    </Page>
  )
}

/** What the form handed over on its last valid submit. Nothing is stored. */
function Submission({ values }: { values: NestedValues }) {
  return (
    <>
      {/* <output> is a live region: the message is announced when it appears. */}
      <output
        data-testid="form-submit-success"
        className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 font-medium text-foreground"
      >
        <CircleCheckIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        Form submitted. Every field is valid.
      </output>
      <Card>
        <CardHeader>
          <CardTitle>Submitted data</CardTitle>
          <CardDescription>
            The values the form handed over, nested by data path. Nothing is stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre
            data-testid="form-submitted-data"
            // Scrolls sideways when a value is long, so it must be reachable by keyboard.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed text-foreground"
          >
            {JSON.stringify(values, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </>
  )
}

function BackToForms() {
  return (
    <Link
      to={FORMS_PAGE.path}
      data-testid="form-back-link"
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
