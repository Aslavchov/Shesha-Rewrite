import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  type LucideIcon,
  TriangleAlertIcon,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import type { StaticProps } from "../../runtime"
import type { settings, Slot } from "./settings"

type Variant = StaticProps<typeof settings, Slot>["settings"]["variant"]

const ICON: Record<Variant, LucideIcon> = {
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  destructive: CircleAlertIcon,
}

/**
 * A message that is part of the form: shown the same way when the form is
 * filled in and when it is read. It is a note, not a live alert: it is there
 * from the start, so announcing it as it appears would only interrupt.
 */
export function AlertRender({
  settings: { variant, title, description },
  slots,
}: StaticProps<typeof settings, Slot>) {
  const Icon = ICON[variant]
  return (
    <Alert role="note" variant={variant} data-variant={variant} {...slots.root}>
      <Icon aria-hidden="true" {...slots.icon} />
      <AlertTitle className="wrap-break-word" {...slots.title}>
        {title}
      </AlertTitle>
      {description === null ? null : (
        <AlertDescription className="wrap-break-word whitespace-pre-line" {...slots.description}>
          {description}
        </AlertDescription>
      )}
    </Alert>
  )
}
