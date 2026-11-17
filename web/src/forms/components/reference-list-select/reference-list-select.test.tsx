import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fakeApi, PERSON, STATUS, withData } from "@/data/testing"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { referenceListSelect } from "."

const definitions = [referenceListSelect]

function renderSelect(settings: Record<string, unknown> = {}, mode: "edit" | "read-only" = "edit") {
  return renderForm(
    [instance("reference-list-select", "status", { referenceList: "status", ...settings })],
    definitions,
    { mode, wrapper: withData(fakeApi()) },
  )
}

const trigger = () => within(fieldRoot("status")).getByRole("combobox")

async function open(user: ReturnType<typeof renderSelect>["user"]) {
  await user.click(trigger())
  await waitFor(() => expect(trigger()).toHaveAttribute("aria-expanded", "true"))
  return screen
    .getAllByTestId("field-status-option")
    .filter((option) => option.hasAttribute("data-value"))
}

describe("reference-list select", () => {
  it("renders its label and a prompt until a value is chosen", async () => {
    renderSelect({ label: "Status" })
    expect(within(fieldRoot("status")).getByText("Status")).toBeInTheDocument()
    await waitFor(() => expect(trigger()).toHaveTextContent("Select an option"))
  })

  it("offers the list's items in order, without retired ones, and stores the value", async () => {
    const { user, submit, submitted } = renderSelect()
    const options = await open(user)
    // Pending is retired and is not the value: it is not offered.
    expect(options.map((option) => option.textContent)).toEqual(["Active", "Inactive"])
    await user.click(options[1])
    expect(trigger()).toHaveTextContent("Inactive")
    submit()
    expect(submitted()).toEqual({ status: "inactive" })
  })

  it("shows the chosen item as a tag in its colour", async () => {
    const { user } = renderSelect()
    await user.click((await open(user))[0])
    const tag = trigger().querySelector("[data-slot=status-tag]")
    expect(tag).toHaveAttribute("data-color", "success")
    expect(tag).toHaveTextContent("Active")
  })

  it("requires a value when required", async () => {
    const { submit, onSubmit } = renderSelect({ required: true })
    await waitFor(() => expect(trigger()).toHaveTextContent("Select an option"))
    submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(fieldError("status")).toHaveTextContent("This field is required")
  })

  it("is opened and chosen from with the keyboard", async () => {
    const { user, submit, submitted } = renderSelect()
    await waitFor(() => expect(trigger()).toHaveTextContent("Select an option"))
    trigger().focus()
    await user.keyboard("{Enter}")
    await waitFor(() => expect(trigger()).toHaveAttribute("aria-expanded", "true"))
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")
    await waitFor(() => expect(trigger()).toHaveAttribute("aria-expanded", "false"))
    submit()
    expect(submitted()?.status).not.toBeNull()
  })

  it("says so when no list is chosen", async () => {
    renderSelect({ referenceList: null })
    await waitFor(() => expect(trigger()).toHaveTextContent("No reference list chosen"))
  })

  it("reads as the item's tag in read-only mode", async () => {
    renderForm(
      [instance("reference-list-select", "status", { referenceList: "status", label: "Status" })],
      definitions,
      { mode: "read-only", wrapper: withData(fakeApi()) },
    )
    await waitFor(() => expect(fieldValue("status")).toBeInTheDocument())
    expect(fieldValue("status")).toHaveAttribute("data-empty", "true")
  })

  it("is the component for a reference list property, and carries its settings", () => {
    const property = PERSON.properties.find((candidate) => candidate.type === "referenceList")!
    expect(referenceListSelect.forProperty?.(property)).toEqual({
      label: "Status",
      referenceList: STATUS.name,
    })
    expect(referenceListSelect.forProperty?.(PERSON.properties[0])).toBeNull()
  })
})
