import * as React from "react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"

import type { FieldApi, SlotProps, Slots } from "../runtime"

/**
 * The parts every input shares: label, required marker, help text, error,
 * and the ARIA attributes that tie them to the control (spec sections 5, 6).
 */

type FieldSlots = Slots<"label" | "description"> & { readonly error?: SlotProps }

/** The attributes for the control itself. */
export type ControlProps = {
  id: string
  "aria-invalid": true | undefined
  "aria-required": true | undefined
  "aria-describedby": string | undefined
}

type SharedProps = {
  /** The instance name: the suffix of the `field-<name>-error` test id. */
  name: string
  /** The ids and the current error; the shared parts never touch the value. */
  field: Pick<FieldApi<unknown>, "id" | "descriptionId" | "errorId" | "error">
  label: string
  required?: boolean
  helpText: string | null
  slots: FieldSlots
  /** Renders the control, given the attributes that connect it to its label and messages. */
  children: (control: ControlProps) => React.ReactNode
}

function controlProps({ field, required, helpText }: SharedProps): ControlProps {
  const describedBy = [
    helpText === null ? null : field.descriptionId,
    field.error === null ? null : field.errorId,
  ].filter((id) => id !== null)
  return {
    id: field.id,
    "aria-invalid": field.error === null ? undefined : true,
    "aria-required": required ? true : undefined,
    "aria-describedby": describedBy.length > 0 ? describedBy.join(" ") : undefined,
  }
}

function Label({ field, label, required, slots }: SharedProps) {
  return (
    <FieldLabel htmlFor={field.id} {...slots.label}>
      {label}
      {required ? (
        // Hidden from assistive technology: the control says aria-required.
        <span aria-hidden="true" data-slot="field-required" className="text-destructive">
          *
        </span>
      ) : null}
    </FieldLabel>
  )
}

function Messages({ name, field, helpText, slots }: SharedProps) {
  return (
    <>
      <FieldError id={field.errorId} data-testid={`field-${name}-error`} {...slots.error}>
        {field.error}
      </FieldError>
      {helpText === null ? null : (
        <FieldDescription id={field.descriptionId} {...slots.description}>
          {helpText}
        </FieldDescription>
      )}
    </>
  )
}

/** Label above the control; error and help text below. For text-like inputs. */
export function StackedField(props: SharedProps) {
  return (
    <Field {...props.slots.root}>
      <Label {...props} />
      {props.children(controlProps(props))}
      <Messages {...props} />
    </Field>
  )
}

/** Control beside its label; error and help text under the label. For Checkbox and Switch. */
export function InlineField(props: SharedProps) {
  return (
    <Field orientation="horizontal" {...props.slots.root}>
      {props.children(controlProps(props))}
      <FieldContent>
        <Label {...props} />
        <Messages {...props} />
      </FieldContent>
    </Field>
  )
}
