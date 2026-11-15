import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

import { useDesignerContext } from "../context"
import type { Problem } from "../model/problems"

/** What is wrong with the selected instance, in plain words, each with its fix (spec 3.5). */
export function ProblemsList({ problems }: { problems: readonly Problem[] }) {
  const { store } = useDesignerContext()
  if (problems.length === 0) return null
  return (
    <section
      data-testid="props-problems"
      aria-labelledby="props-problems-title"
      className="mx-4 mb-3 flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/5 p-3"
    >
      <h3
        id="props-problems-title"
        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
      >
        <TriangleAlertIcon aria-hidden="true" className="size-3.5 text-warning" />
        {problems.length === 1 ? "1 problem" : `${problems.length} problems`}
      </h3>
      <ul className="flex flex-col gap-2">
        {problems.map((problem, index) => (
          // A problem has no identity of its own; the list is rebuilt from the instance.
          // oxlint-disable-next-line react/no-array-index-key
          <li key={index} data-testid="props-problem" className="flex flex-col items-start gap-1.5">
            <p className="text-xs text-foreground">{problem.message}</p>
            {problem.fix ? (
              <Button
                variant="outline"
                size="xs"
                data-testid={`props-problem-fix-${index}`}
                onClick={() => store.run(problem.fix!.command)}
              >
                {problem.fix.label}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
