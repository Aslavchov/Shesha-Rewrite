import * as React from "react"

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
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
  /** `field-<name>-control`: the element a person types into or presses. */
  "data-testid": string
  "aria-invalid": true | undefined
  "aria-required": true | undefined
  "aria-describedby": string | undefined
}

/** How much of a length limit is used. */
export type CharacterCount = { readonly length: number; readonly max: number }

type SharedProps = {
  /** The instance name: the suffix of the `field-<name>-error` test id. */
  name: string
  /** Shown under the control, at its end. For text controls with a maximum length. */
  count?: CharacterCount
  /** The ids and the current error; the shared parts never touch the value. */
  field: Pick<FieldApi<unknown>, "id" | "descriptionId" | "errorId" | "error">
  label: string
  required?: boolean
  helpText: string | null
  slots: FieldSlots
  /** Renders the control, given the attributes that connect it to its label and messages. */
  children: (control: ControlProps) => React.ReactNode
}

/** What the shared parts read: everything but the control. */
type PartsProps = Omit<SharedProps, "children">

const countId = (field: SharedProps["field"]) => `${field.id}-count`

function controlProps({ name, field, required, helpText, count }: PartsProps): ControlProps {
  const describedBy = [
    helpText === null ? null : field.descriptionId,
    field.error === null ? null : field.errorId,
    count === undefined ? null : countId(field),
  ].filter((id) => id !== null)
  return {
    id: field.id,
    "data-testid": `field-${name}-control`,
    "aria-invalid": field.error === null ? undefined : true,
    "aria-required": required ? true : undefined,
    "aria-describedby": describedBy.length > 0 ? describedBy.join(" ") : undefined,
  }
}

function RequiredMarker({ required }: { required?: boolean }) {
  return required ? (
    // Hidden from assistive technology: the control says aria-required.
    <span aria-hidden="true" data-slot="field-required" className="text-destructive">
      *
    </span>
  ) : null
}

function Label({ field, label, required, slots }: PartsProps) {
  return (
    <FieldLabel htmlFor={field.id} className="gap-0.5" {...slots.label}>
      {label}
      <RequiredMarker required={required} />
    </FieldLabel>
  )
}

function Messages({ name, field, helpText, slots, count }: PartsProps) {
  const messages = (
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
  if (count === undefined) return messages

  // The count sits at the end of the row the messages start; they wrap beside it.
  const isOver = count.length > count.max
  return (
    <div data-slot="field-footer" className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">{messages}</div>
      <p
        id={countId(field)}
        data-slot="field-count"
        data-testid={`field-${name}-count`}
        data-over={isOver ? "true" : undefined}
        className="ml-auto shrink-0 text-sm text-muted-foreground tabular-nums data-over:font-medium data-over:text-destructive"
      >
        {count.length} / {count.max}
        <span className="sr-only"> characters</span>
      </p>
    </div>
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

/** The attributes for a group of controls (a radio group), and the id of each control in it. */
export type GroupControlProps = Omit<ControlProps, "id"> & {
  "aria-labelledby": string
  /** The id of the group's control at `index`. The first one's is the field's control id. */
  itemId: (index: number) => string
}

/**
 * A label above a group of controls; error and help text below. For Radio
 * group. The label names the group rather than one control, and the field's
 * control id goes to the first control, which is where focus goes when the
 * field is invalid.
 */
export function GroupField({
  children,
  ...props
}: PartsProps & { children: (control: GroupControlProps) => React.ReactNode }) {
  const { field, label, required, slots } = props
  const labelId = `${field.id}-label`
  const { id, ...control } = controlProps(props)
  return (
    <Field {...slots.root}>
      <FieldTitle id={labelId} className="gap-0.5 leading-snug" {...slots.label}>
        {label}
        <RequiredMarker required={required} />
      </FieldTitle>
      {children({
        ...control,
        "aria-labelledby": labelId,
        itemId: (index) => (index === 0 ? id : `${id}-${index}`),
      })}
      <Messages {...props} />
    </Field>
  )
}
