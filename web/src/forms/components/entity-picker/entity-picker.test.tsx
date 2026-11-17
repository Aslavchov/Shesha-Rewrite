import { screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fakeApi, PERSON, withData } from "@/data/testing"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { entityPicker } from "."

const COMPANIES = ["Acacia Logistics", "Blue Crane Health", "Fynbos Foods"].map((name, index) => ({
  entity: "company",
  id: `company-${index + 1}`,
  values: { name },
}))

function renderPicker(settings: Record<string, unknown> = {}, mode: "edit" | "read-only" = "edit") {
  const api = fakeApi({ rows: COMPANIES })
  const view = renderForm(
    [instance("entity-picker", "company", { entity: "company", label: "Company", ...settings })],
    [entityPicker],
    { mode, wrapper: withData(api) },
  )
  return { ...view, api }
}

const input = () => within(fieldRoot("company")).getByRole("combobox")

describe("entity picker", () => {
  it("is an accessible combobox with its label", async () => {
    renderPicker()
    expect(input()).toHaveAccessibleName("Company")
    await waitFor(() => expect(input()).toHaveAttribute("placeholder", "Search company…"))
  })

  it("searches the entity on the server as you type, and stores the chosen row's id", async () => {
    const { user, api, submit, submitted } = renderPicker()
    await waitFor(() => expect(input()).toBeEnabled())
    await user.click(input())
    await user.type(input(), "fyn")
    // The search goes to the server a moment after the last keystroke.
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))
    const option = screen.getByRole("option", { name: "Fynbos Foods" })
    expect(api.queries.at(-1)).toMatchObject({
      entity: "company",
      query: { search: "fyn", select: ["name"], sort: [{ property: "name" }] },
    })
    await user.click(option)
    expect(input()).toHaveValue("Fynbos Foods")
    submit()
    expect(submitted()).toEqual({ company: "company-3" })
  })

  it("is chosen from with the keyboard", async () => {
    const { user, submit, submitted } = renderPicker()
    await waitFor(() => expect(input()).toBeEnabled())
    input().focus()
    await user.keyboard("blue")
    await waitFor(() =>
      expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Blue Crane Health",
      ]),
    )
    await user.keyboard("{ArrowDown}{Enter}")
    await waitFor(() => expect(input()).toHaveValue("Blue Crane Health"))
    submit()
    expect(submitted()).toEqual({ company: "company-2" })
  })

  it("requires a row when required", async () => {
    const { submit, onSubmit } = renderPicker({ required: true })
    await waitFor(() => expect(input()).toBeEnabled())
    submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(fieldError("company")).toHaveTextContent("This field is required")
  })

  it("is disabled, and says why, without an entity", async () => {
    renderPicker({ entity: null })
    await waitFor(() => expect(input()).toHaveAttribute("placeholder", "No entity chosen"))
    expect(input()).toBeDisabled()
  })

  it("shows the empty marker in read-only mode without a value", () => {
    renderPicker({}, "read-only")
    expect(fieldValue("company")).toHaveAttribute("data-empty", "true")
  })

  it("is the component for a reference property, and carries its settings", () => {
    const property = PERSON.properties.find((candidate) => candidate.type === "reference")!
    expect(entityPicker.forProperty?.(property)).toEqual({ label: "Company", entity: "company" })
    expect(entityPicker.forProperty?.(PERSON.properties[0])).toBeNull()
  })
})
