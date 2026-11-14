import * as React from "react"
import { PlusIcon } from "lucide-react"
import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

import { useCreateForm } from "../../api/use-forms"
import { designerPath } from "../../pages"

/** The limits the server sets (ADR 0003). */
const MAX_NAME_CHARS = 200
const MAX_DESCRIPTION_CHARS = 1000

/** Counted as the server counts: in characters, not UTF-16 units. */
const characters = (text: string) => [...text].length

/**
 * The New form button (spec 3.1). It asks for a name and an optional
 * description, creates the form, and opens it in the designer.
 */
export function NewForm() {
  const [isOpen, setIsOpen] = React.useState(false)
  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button data-testid="forms-new" />}>
        <PlusIcon aria-hidden="true" data-icon="inline-start" />
        New form
      </DialogTrigger>
      <DialogContent>
        {/* Rendered only while open, so every opening starts from empty fields. */}
        <NewFormFields />
      </DialogContent>
    </Dialog>
  )
}

function NewFormFields() {
  const navigate = useNavigate()
  const create = useCreateForm()
  const id = React.useId()
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  /** Problems are shown once Create has been pressed, then kept up to date. */
  const [wasSubmitted, setWasSubmitted] = React.useState(false)

  const nameError =
    name.trim() === ""
      ? "Give the form a name."
      : characters(name.trim()) > MAX_NAME_CHARS
        ? `Use no more than ${MAX_NAME_CHARS} characters.`
        : null
  const descriptionError =
    characters(description.trim()) > MAX_DESCRIPTION_CHARS
      ? `Use no more than ${MAX_DESCRIPTION_CHARS} characters.`
      : null
  const shownNameError = wasSubmitted ? nameError : null
  const shownDescriptionError = wasSubmitted ? descriptionError : null

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setWasSubmitted(true)
        if (nameError || descriptionError) {
          document.getElementById(nameError ? `${id}-name` : `${id}-description`)?.focus()
          return
        }
        create.mutate(
          { name: name.trim(), description: description.trim() },
          { onSuccess: (record) => void navigate(designerPath(record.id)) },
        )
      }}
    >
      <DialogHeader>
        <DialogTitle>New form</DialogTitle>
        <DialogDescription>
          Name the form to create it. It opens in the designer, ready for its first component.
        </DialogDescription>
      </DialogHeader>

      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Name</FieldLabel>
        <Input
          id={`${id}-name`}
          data-testid="forms-new-name"
          value={name}
          aria-required="true"
          aria-invalid={shownNameError ? true : undefined}
          aria-describedby={shownNameError ? `${id}-name-error` : undefined}
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <FieldError id={`${id}-name-error`} data-testid="forms-new-name-error">
          {shownNameError}
        </FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${id}-description`}>Description</FieldLabel>
        <Textarea
          id={`${id}-description`}
          data-testid="forms-new-description"
          rows={3}
          value={description}
          aria-invalid={shownDescriptionError ? true : undefined}
          aria-describedby={
            shownDescriptionError ? `${id}-description-error` : `${id}-description-help`
          }
          onChange={(event) => setDescription(event.target.value)}
        />
        <FieldError id={`${id}-description-error`}>{shownDescriptionError}</FieldError>
        <FieldDescription id={`${id}-description-help`}>
          Optional. Shown under the form's name.
        </FieldDescription>
      </Field>

      {create.isError ? (
        <p role="alert" data-testid="forms-new-error" className="text-sm text-destructive">
          The form could not be created. {create.error.message}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
        <Button type="submit" data-testid="forms-new-create" disabled={create.isPending}>
          Create form
        </Button>
      </DialogFooter>
    </form>
  )
}
