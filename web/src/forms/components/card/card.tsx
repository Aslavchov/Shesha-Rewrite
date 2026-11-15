import * as React from "react"
import { cn } from "cn"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { type ContainerProps, GAP_CLASS } from "../../runtime"
import { CONTENT_REGION, type settings, type Slot } from "./settings"

/**
 * A card: a raised surface with an optional title and description over its
 * contents. With a title it is a named group, so assistive technology
 * announces where a person is.
 */
export function CardRender({
  settings: { title, description, gap },
  slots,
  region,
}: ContainerProps<typeof settings, Slot>) {
  const titleId = React.useId()
  const hasTitle = title !== ""
  const hasHeader = hasTitle || description !== null
  return (
    <Card
      role={hasTitle ? "group" : undefined}
      aria-labelledby={hasTitle ? titleId : undefined}
      className="min-w-0"
      {...slots.root}
    >
      {hasHeader ? (
        <CardHeader {...slots.header}>
          {hasTitle ? (
            <CardTitle id={titleId} className="wrap-break-word" {...slots.title}>
              {title}
            </CardTitle>
          ) : null}
          {description === null ? null : (
            <CardDescription className="wrap-break-word whitespace-pre-line" {...slots.description}>
              {description}
            </CardDescription>
          )}
        </CardHeader>
      ) : null}
      <CardContent className={cn("flex min-w-0 flex-col", GAP_CLASS[gap])} {...slots.content}>
        {region(CONTENT_REGION)}
      </CardContent>
    </Card>
  )
}
