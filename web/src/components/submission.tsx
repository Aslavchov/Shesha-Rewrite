import { CircleCheckIcon } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { NestedValues } from "@/forms/runtime"

/** What a form handed over on its last valid submit. Nothing is stored. */
export function Submission({ values }: { values: NestedValues }) {
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
