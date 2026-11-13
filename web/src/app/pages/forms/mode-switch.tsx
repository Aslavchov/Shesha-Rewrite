import { EyeIcon, PencilIcon } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import type { FormMode } from "@/forms/runtime"

const MODES = [
  { mode: "edit", label: "Edit", icon: PencilIcon },
  { mode: "read-only", label: "Read-only", icon: EyeIcon },
] as const

/** Switches the form between edit and read-only. Two toggle buttons; one is always pressed. */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: FormMode
  onChange: (mode: FormMode) => void
}) {
  return (
    <fieldset
      aria-label="Form mode"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {MODES.map((option) => {
        const isCurrent = option.mode === mode
        return (
          <Button
            key={option.mode}
            variant="ghost"
            size="sm"
            data-testid={`form-mode-${option.mode}`}
            aria-pressed={isCurrent}
            className={cn(
              "text-muted-foreground hover:bg-transparent",
              isCurrent && "bg-background text-foreground shadow-xs hover:bg-background",
            )}
            onClick={() => onChange(option.mode)}
          >
            <option.icon aria-hidden="true" data-icon="inline-start" />
            {option.label}
          </Button>
        )
      })}
    </fieldset>
  )
}
