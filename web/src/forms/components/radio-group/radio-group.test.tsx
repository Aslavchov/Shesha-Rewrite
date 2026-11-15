import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { radioGroup } from "."

const definitions = [radioGroup]

const OPTIONS = [
  { label: "Email", value: "email" },
  { label: "Phone", value: "phone" },
  { label: "Post", value: "post" },
]

function renderRadioGroup(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm(
    [
      instance(
        "radio-group",
        "contact",
        { label: "Contact by", options: OPTIONS, ...settings },
        extras,
      ),
    ],
    definitions,
  )
}

const radio = (name: string) => screen.getByRole("radio", { name })

describe("radio group: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(radioGroup.type).toBe("radio-group")
    expect(radioGroup.displayName).toBe("Radio group")
    expect(radioGroup.description).not.toBe("")
    expect(radioGroup.category).toBe("input")
    expect(radioGroup.kind).toBe("input")
    expect(radioGroup.valueType).toBe("option")
    expect(radioGroup.slots).toEqual(["root", "label", "item", "description", "error"])
    expect(Object.keys(radioGroup.settings)).toEqual([
      "label",
      "helpText",
      "options",
      "defaultValue",
      "required",
      "orientation",
      "messages",
    ])
    expect(radioGroup.rules.map((rule) => rule.id)).toEqual(["required"])
  })

  it("offers the options as the choices for its default value", () => {
    const { choicesFrom } = radioGroup.settings.defaultValue
    expect(choicesFrom?.({ options: OPTIONS })).toEqual(
      OPTIONS.map(({ label, value }) => ({ label, value })),
    )
    expect(choicesFrom?.({ options: "nonsense" })).toEqual([])
  })
})

describe("radio group: default render", () => {
  it("renders a named group of options with none chosen", () => {
    renderRadioGroup()
    const group = screen.getByRole("radiogroup", { name: "Contact by" })
    expect(group).not.toHaveAttribute("aria-required")
    for (const option of OPTIONS) {
      expect(radio(option.label)).toHaveAttribute("aria-checked", "false")
    }
    expect(fieldError("contact")).toBeNull()
  })

  it("says so when it has no options yet", () => {
    renderForm([instance("radio-group", "contact")], definitions)
    expect(fieldRoot("contact")).toHaveTextContent("No options yet.")
  })

  it("starts on its default value, and ignores one that is not an option", () => {
    renderRadioGroup({ defaultValue: "phone" })
    expect(radio("Phone")).toHaveAttribute("aria-checked", "true")
  })

  it("ignores a default value that is not one of its options", () => {
    const { submit, submitted } = renderRadioGroup({ defaultValue: "fax" })
    submit()
    expect(submitted()).toEqual({ contact: null })
  })

  it("lays the options out in a column, or a row", () => {
    renderRadioGroup({ orientation: "horizontal" })
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-orientation", "horizontal")
    expect(screen.getByRole("radiogroup").className).toContain("flex-row")
  })

  it("marks a required group for the eye and for assistive technology", () => {
    renderRadioGroup({ required: true })
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-required", "true")
    expect(fieldRoot("contact").querySelector("[data-slot=field-required]")).toHaveTextContent("*")
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderRadioGroup({}, { styles: { item: { padding: "sm" }, label: { color: "#003BB2" } } })
    const items = screen.getAllByTestId("field-contact-option")
    for (const item of items) expect(item.style.padding).toBe("var(--sys-space-sm)")
    expect(fieldRoot("contact").querySelector("[data-form-slot=label]")).toHaveStyle({
      color: "#003BB2",
    })
    expect(fieldRoot("contact")).not.toHaveAttribute("style")
  })
})

describe("radio group: read-only render", () => {
  it("shows the chosen option's label as text, with no control", async () => {
    const { user, setMode } = renderRadioGroup()
    await user.click(radio("Post"))
    setMode("read-only")
    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(fieldValue("contact")).toHaveTextContent("Post")
  })

  it("shows a clear marker when there is no value", () => {
    renderForm([instance("radio-group", "contact", { options: OPTIONS })], definitions, {
      mode: "read-only",
    })
    expect(fieldValue("contact")).toHaveTextContent("No value")
  })
})

describe("radio group: values", () => {
  it("submits the chosen option's value", async () => {
    const { user, submit, submitted } = renderRadioGroup()
    await user.click(radio("Phone"))
    submit()
    expect(submitted()).toEqual({ contact: "phone" })
  })

  it("chooses an option when its label is clicked", async () => {
    const { user, submit, submitted } = renderRadioGroup()
    await user.click(screen.getByText("Email"))
    submit()
    expect(submitted()).toEqual({ contact: "email" })
  })
})

describe("radio group: validation rules", () => {
  it("required: a submit with nothing chosen shows the error and focuses the first option", () => {
    const { submit, onSubmit } = renderRadioGroup({ required: true })
    submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(fieldError("contact")).toHaveTextContent("This field is required")
    expect(radio("Email")).toHaveFocus()
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("radiogroup")).toHaveAccessibleDescription("This field is required")
  })

  it("required: choosing an option clears the error", async () => {
    const { user, submit } = renderRadioGroup({ required: true })
    submit()
    await user.click(radio("Post"))
    expect(fieldError("contact")).toBeNull()
  })

  it("is left when focus leaves the group: an error shows then, not before", async () => {
    const { user } = renderRadioGroup({ required: true })
    await user.tab()
    expect(radio("Email")).toHaveFocus()
    expect(fieldError("contact")).toBeNull()
    await user.tab()
    expect(fieldError("contact")).toHaveTextContent("This field is required")
  })
})

describe("radio group: keyboard", () => {
  it("is one Tab stop; the arrow keys choose", async () => {
    const { user, submit, submitted } = renderRadioGroup()
    await user.tab()
    expect(radio("Email")).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(radio("Phone")).toHaveFocus()
    submit()
    expect(submitted()).toEqual({ contact: "phone" })
  })
})
