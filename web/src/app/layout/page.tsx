import * as React from "react"

import { APP_NAME } from "@/generated"

/**
 * The frame every page renders inside <main>: the document title, the single
 * <h1>, an optional lead line, then the page content.
 */
export function Page({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <title>{`${title} · ${APP_NAME}`}</title>
      <div className="flex flex-col gap-1">
        <h1
          data-testid="page-title"
          className="font-heading text-2xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  )
}
