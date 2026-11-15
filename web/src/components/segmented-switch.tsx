import type { LucideIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"

export type SegmentedOption<T extends string> = {
  readonly value: T
  readonly label: string
  readonly icon: LucideIcon
  readonly testId: string
}

/**
 * Switches between a few views of the same thing. Toggle buttons side by
 * side; exactly one is pressed.
 */
export function SegmentedSwitch<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  /** What is being switched, for assistive technology: "Form mode". */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <fieldset
      aria-label={label}
      disabled={disabled}
      className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-lg bg-muted p-0.5"
    >
      {options.map((option) => {
        const isCurrent = option.value === value
        return (
          <Button
            key={option.value}
            variant="ghost"
            size="sm"
            data-testid={option.testId}
            aria-pressed={isCurrent}
            className={cn(
              "text-muted-foreground hover:bg-transparent",
              isCurrent && "bg-background text-foreground shadow-xs hover:bg-background",
            )}
            onClick={() => onChange(option.value)}
          >
            <option.icon aria-hidden="true" data-icon="inline-start" />
            {option.label}
          </Button>
        )
      })}
    </fieldset>
  )
}
