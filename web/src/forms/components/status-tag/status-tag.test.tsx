import { waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fakeApi, withData } from "@/data/testing"
import { createRegistry, FormRenderer } from "@/forms/runtime"

import { fieldValue, formDocument, instance } from "../../testing/render-form"
import { statusTag } from "."
import { render } from "@testing-library/react"

const registry = createRegistry([statusTag])

function renderTag(value: string | null, mode: "edit" | "read-only" = "edit") {
  const document = formDocument([
    instance("status-tag", "status", { referenceList: "status", label: "Status" }),
  ])
  return render(
    <FormRenderer
      document={document}
      registry={registry}
      mode={mode}
      values={value === null ? {} : { status: value }}
    />,
    { wrapper: withData(fakeApi()) },
  )
}

describe("status tag", () => {
  it("shows the item's label in its colour", async () => {
    renderTag("active")
    await waitFor(() => expect(fieldValue("status")).toHaveTextContent("Active"))
    expect(fieldValue("status")).toHaveAttribute("data-color", "success")
  })

  it("marks a retired item, and still shows it", async () => {
    renderTag("pending")
    await waitFor(() => expect(fieldValue("status")).toHaveTextContent("Pending"))
    expect(fieldValue("status")).toHaveAttribute("data-retired", "true")
    expect(fieldValue("status")).toHaveTextContent("(retired)")
  })

  it("shows a value the list does not have as it is stored, in a neutral colour", async () => {
    renderTag("gone")
    await waitFor(() => expect(fieldValue("status")).toHaveTextContent("gone"))
    expect(fieldValue("status")).toHaveAttribute("data-color", "muted")
  })

  it("shows the empty marker without a value", () => {
    renderTag(null)
    expect(fieldValue("status")).toHaveAttribute("data-empty", "true")
    expect(fieldValue("status")).toHaveTextContent("No value")
  })

  it("is the same in read-only mode, and takes no focus in either", async () => {
    const { container } = renderTag("active", "read-only")
    await waitFor(() => expect(fieldValue("status")).toHaveTextContent("Active"))
    expect(container.querySelector("input, button, [tabindex]")).toBeNull()
  })
})
