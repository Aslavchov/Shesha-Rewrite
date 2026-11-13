import * as React from "react"

import { APP_NAME } from "@/generated"

/**
 * The frame every page renders inside <main>: the document title, the single
 * <h1>, an optional lead line, then the page content.
 */
export function Page({
  title,
  description,
  breadcrumb,
  actions,
  children,
}: {
  title: string
  description?: string
  /** Shown above the title: where this page sits. */
  breadcrumb?: React.ReactNode
  /** Controls for the whole page, shown beside the title. */
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <title>{`${title} · ${APP_NAME}`}</title>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {breadcrumb}
          <h1
            data-testid="page-title"
            className="font-heading text-2xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h1>
          {description ? (
            <p data-testid="page-description" className="max-w-prose text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}
