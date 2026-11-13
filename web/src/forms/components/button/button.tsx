import { Button } from "@/components/ui/button"

import type { StaticProps } from "../../runtime"
import type { settings, Slot } from "./settings"

/**
 * Keeps the button at its own width where a container would stretch it: the
 * form and a vertical Container lay their children out as a column.
 */
const NATURAL_WIDTH = "self-start"

export function ButtonEdit({
  settings: { label, action, variant },
  slots,
  form,
}: StaticProps<typeof settings, Slot>) {
  if (action === "reset") {
    // Never a native reset: the values live in the form's store, not the DOM.
    return (
      <Button
        type="button"
        variant={variant}
        className={NATURAL_WIDTH}
        onClick={form.reset}
        {...slots.root}
      >
        {label}
      </Button>
    )
  }
  // A native submit button: the form's own submit handler validates, so a
  // click, Enter on the button and Enter in a text input all take one path.
  return (
    <Button type="submit" variant={variant} className={NATURAL_WIDTH} {...slots.root}>
      {label}
    </Button>
  )
}

/** Submit and Reset are not available in read-only mode (spec section 6). */
export function ButtonReadOnly() {
  return null
}
