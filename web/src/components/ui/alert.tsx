import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/**
 * shadcn/ui's Alert with the four message tones a form needs. Each tone tints
 * the border and the fill, and colours the icon and the title; the
 * description stays in the ordinary text colour, so it reads well in every
 * tone and both schemes.
 */
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        info: "border-info/40 bg-info/5 *:data-[slot=alert-title]:text-info *:[svg]:text-info",
        success:
          "border-success/40 bg-success/5 *:data-[slot=alert-title]:text-success *:[svg]:text-success",
        warning:
          "border-warning/50 bg-warning/5 *:data-[slot=alert-title]:text-warning *:[svg]:text-warning",
        destructive:
          "border-destructive/40 bg-destructive/5 *:data-[slot=alert-title]:text-destructive *:[svg]:text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-medium group-has-[>svg]/alert:col-start-2", className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-pretty text-foreground/80 group-has-[>svg]/alert:col-start-2 [&_p:not(:last-child)]:mb-4",
        className,
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
