import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"

import {
  type ComponentInstance,
  FORM_FORMAT_VERSION,
  type FormDocument,
  type SlotStyle,
} from "@/generated"

import {
  type ComponentDefinition,
  createRegistry,
  type FormMode,
  FormRenderer,
  type NestedValues,
} from "../runtime"

/** Helpers for unit tests of components and of the renderer. Test-only. */

type InstanceExtras = {
  /** Data path; defaults to the name. Pass `null` for an instance with no path. */
  bind?: string | null
  styles?: Record<string, SlotStyle>
  regions?: Record<string, ComponentInstance[]>
}

/** An instance with a predictable id (`c_<name>`), bound to its own name. */
export function instance(
  type: string,
  name: string,
  settings: Record<string, unknown> = {},
  { bind = name, styles, regions }: InstanceExtras = {},
): ComponentInstance {
  return {
    id: `c_${name}`,
    type,
    name,
    ...(bind === null ? {} : { bind }),
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
    ...(styles ? { styles } : {}),
    ...(regions ? { regions } : {}),
  }
}

export function formDocument(
  components: ComponentInstance[],
  settings?: Record<string, unknown>,
): FormDocument {
  return {
    formatVersion: FORM_FORMAT_VERSION,
    name: "Test form",
    ...(settings ? { settings } : {}),
    components,
  }
}

/**
 * Renders a form made of `components` using only `definitions`, and returns
 * what a test needs to drive it.
 */
export function renderForm(
  components: ComponentInstance[],
  definitions: readonly ComponentDefinition[],
  options: { mode?: FormMode } = {},
) {
  return renderDocument(formDocument(components), definitions, options)
}

/** The same, for a whole document. */
export function renderDocument(
  document: FormDocument,
  definitions: readonly ComponentDefinition[],
  { mode = "edit" }: { mode?: FormMode } = {},
) {
  const registry = createRegistry(definitions)
  const onSubmit = vi.fn<(values: NestedValues) => void>()
  const onReset = vi.fn<() => void>()
  const element = (current: FormMode) => (
    <FormRenderer
      document={document}
      registry={registry}
      mode={current}
      onSubmit={onSubmit}
      onReset={onReset}
    />
  )
  const view = render(element(mode))

  return {
    user: userEvent.setup(),
    onSubmit,
    onReset,
    /** Switches between edit and read-only, keeping the same form. */
    setMode: (next: FormMode) => view.rerender(element(next)),
    /** Submits the form the way a Submit button or Enter would. */
    submit: () => fireEvent.submit(screen.getByTestId("form")),
    /** The values handed to the host by the most recent valid submit. */
    submitted: () => onSubmit.mock.lastCall?.[0],
  }
}

/** The instance's root element, its error and its read-only value. */
export const fieldRoot = (name: string) => screen.getByTestId(`field-${name}`)
export const fieldError = (name: string) => screen.queryByTestId(`field-${name}-error`)
export const fieldValue = (name: string) => screen.getByTestId(`field-${name}-value`)
