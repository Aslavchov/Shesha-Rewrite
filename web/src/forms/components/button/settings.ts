import type { VariantProps } from "class-variance-authority"

import type { buttonVariants } from "@/components/ui/button"

import { labelSetting } from "../../parts/settings"
import { choice, type Choice } from "../../runtime/settings"

/** The variants `ui/button.tsx` has, so a name it does not know cannot be offered. */
type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>

/** shadcn's variants under their own names. `default` is the primary look. */
const VARIANT_CHOICES: readonly Choice<ButtonVariant>[] = [
  { value: "default", label: "Primary" },
  { value: "outline", label: "Outline" },
  { value: "secondary", label: "Secondary" },
  { value: "ghost", label: "Ghost" },
  { value: "destructive", label: "Destructive" },
  { value: "link", label: "Link" },
]

export const settings = {
  label: labelSetting("Button"),
  action: choice({
    label: "Action",
    help: "What the button does when it is pressed.",
    group: "general",
    choices: [
      { value: "submit", label: "Submit the form" },
      { value: "reset", label: "Reset the form" },
    ],
    default: "submit",
  }),
  variant: choice({
    label: "Variant",
    help: "How much the button stands out.",
    group: "general",
    choices: VARIANT_CHOICES,
    default: "default",
  }),
}

export const slots = ["root"] as const

export type Slot = (typeof slots)[number]
