import type * as React from "react"

/** A titled group of controls in the theme editor. */
export function EditorSection({
  title,
  description,
  testId,
  children,
}: {
  title: string
  description: string
  testId: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="font-heading text-base font-medium text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  )
}
