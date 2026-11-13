import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { textField } from "."

const definitions = [textField]

function renderTextField(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm([instance("text-field", "title", settings, extras)], definitions)
}

describe("text field: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(textField.type).toBe("text-field")
    expect(textField.displayName).toBe("Text field")
    expect(textField.description).not.toBe("")
    expect(textField.kind).toBe("input")
    expect(textField.valueType).toBe("text")
    expect(textField.slots).toEqual(["root", "label", "control", "description", "error"])
    expect(Object.keys(textField.settings)).toEqual([
      "label",
      "helpText",
      "placeholder",
      "defaultValue",
      "required",
      "minLength",
      "maxLength",
      "pattern",
      "messages",
    ])
    expect(textField.rules.map((rule) => rule.id)).toEqual([
      "required",
      "minLength",
      "maxLength",
      "pattern",
    ])
    for (const setting of Object.values(textField.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })
})

describe("text field: default render", () => {
  it("renders a labelled, empty text input with no help text, error or required marker", () => {
    renderTextField()

    const input = screen.getByRole("textbox", { name: "Text field" })
    expect(input).toHaveValue("")
    expect(input).toHaveAttribute("type", "text")
    expect(input).not.toHaveAttribute("placeholder")
    expect(input).not.toHaveAttribute("aria-required")
    expect(input).not.toHaveAttribute("aria-invalid")
    expect(input).not.toHaveAttribute("aria-describedby")
    expect(fieldRoot("title")).toContainElement(input)
    expect(fieldError("title")).toBeNull()
    expect(fieldRoot("title").querySelector("[data-slot=field-description]")).toBeNull()
    expect(fieldRoot("title").querySelector("[data-slot=field-required]")).toBeNull()
  })

  it("shows the label, placeholder, help text and default value it is given", () => {
    renderTextField({
      label: "Title",
      placeholder: "e.g. Annual report",
      helpText: "Shown on the cover.",
      defaultValue: "Draft",
    })

    const input = screen.getByRole("textbox", { name: "Title" })
    expect(input).toHaveValue("Draft")
    expect(input).toHaveAttribute("placeholder", "e.g. Annual report")
    expect(input).toHaveAccessibleDescription("Shown on the cover.")
  })

  it("marks a required field for the eye and for assistive technology", () => {
    renderTextField({ label: "Title", required: true })

    const input = screen.getByRole("textbox", { name: "Title" })
    expect(input).toHaveAttribute("aria-required", "true")
    const marker = fieldRoot("title").querySelector("[data-slot=field-required]")
    expect(marker).toHaveTextContent("*")
    // The star is decoration: the accessible name stays "Title".
    expect(marker).toHaveAttribute("aria-hidden", "true")
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderTextField(
      { label: "Title", helpText: "Help" },
      {
        styles: {
          label: { color: "#003BB2" },
          control: { background: { token: "muted" }, radius: "full" },
        },
      },
    )

    const root = fieldRoot("title")
    const label = root.querySelector("[data-slot=field-label]")
    const input = screen.getByRole("textbox")
    expect(label).toHaveStyle({ color: "#003BB2" })
    expect(input.style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(input.style.borderRadius).toBe("var(--sys-radius-full)")
    expect(input.style.color).toBe("")
    expect(root).not.toHaveAttribute("style")
    expect(root.querySelector("[data-slot=field-description]")).not.toHaveAttribute("style")
  })
})

describe("text field: read-only render", () => {
  it("shows the value as text, with no control", async () => {
    const { user, setMode } = renderTextField({ label: "Title" })
    await user.type(screen.getByRole("textbox"), "Annual report")

    setMode("read-only")

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(fieldRoot("title")).toHaveTextContent("Title")
    expect(fieldValue("title")).toHaveTextContent("Annual report")
  })

  it("shows a clear marker when there is no value", () => {
    renderForm([instance("text-field", "title", { label: "Title" })], definitions, {
      mode: "read-only",
    })

    expect(fieldValue("title")).toHaveTextContent("—")
    expect(fieldValue("title")).toHaveTextContent("No value")
  })
})

describe("text field: values", () => {
  it("submits the text typed", async () => {
    const { user, submit, submitted } = renderTextField()

    await user.type(screen.getByRole("textbox"), "Hello")
    submit()

    expect(submitted()).toEqual({ title: "Hello" })
  })

  it("submits null, never an empty string, when nothing is entered or the text is cleared", async () => {
    const { user, submit, submitted } = renderTextField()
    submit()
    expect(submitted()).toEqual({ title: null })

    await user.type(screen.getByRole("textbox"), "x")
    await user.clear(screen.getByRole("textbox"))
    submit()

    expect(submitted()).toEqual({ title: null })
  })
})

describe("text field: validation rules", () => {
  it("required: an empty or blank value is an error; any text clears it", async () => {
    const { user, submit, onSubmit } = renderTextField({ label: "Title", required: true })
    const input = screen.getByRole("textbox")

    await user.click(input)
    await user.tab()
    expect(fieldError("title")).toHaveTextContent("This field is required")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("This field is required")

    await user.type(input, "   ")
    expect(fieldError("title")).toHaveTextContent("This field is required")

    await user.type(input, "a")
    expect(fieldError("title")).toBeNull()
    expect(input).not.toHaveAttribute("aria-invalid")

    submit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("minimum length", async () => {
    const { user } = renderTextField({ minLength: 3 })
    const input = screen.getByRole("textbox")

    await user.type(input, "ab")
    await user.tab()
    expect(fieldError("title")).toHaveTextContent("Enter at least 3 characters")

    await user.type(input, "c")
    expect(fieldError("title")).toBeNull()
  })

  it("maximum length", async () => {
    const { user } = renderTextField({ maxLength: 5 })
    const input = screen.getByRole("textbox")

    await user.type(input, "abcdef")
    await user.tab()
    expect(fieldError("title")).toHaveTextContent("Enter no more than 5 characters")

    await user.type(input, "{Backspace}")
    expect(fieldError("title")).toBeNull()
  })

  it("pattern: the whole value must match", async () => {
    const { user } = renderTextField({ pattern: "[A-Z]{3}" })
    const input = screen.getByRole("textbox")

    await user.type(input, "ABCD")
    await user.tab()
    expect(fieldError("title")).toHaveTextContent("Enter a value in the expected format")

    await user.type(input, "{Backspace}")
    expect(fieldError("title")).toBeNull()
  })

  it("an empty optional field passes the length and pattern rules", async () => {
    const { user, submit, onSubmit } = renderTextField({ minLength: 3, pattern: "[A-Z]+" })

    await user.click(screen.getByRole("textbox"))
    await user.tab()
    submit()

    expect(fieldError("title")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("uses the instance's own message for a rule when it sets one", async () => {
    const { user } = renderTextField({
      required: true,
      pattern: "\\d+",
      messages: { required: "Enter a title", pattern: "Use digits only" },
    })
    const input = screen.getByRole("textbox")

    await user.click(input)
    await user.tab()
    expect(fieldError("title")).toHaveTextContent("Enter a title")

    await user.type(input, "abc")
    expect(fieldError("title")).toHaveTextContent("Use digits only")
  })

  it("shows no error while a person is first typing, only after they leave", async () => {
    const { user } = renderTextField({ minLength: 5 })
    const input = screen.getByRole("textbox")

    await user.type(input, "ab")
    expect(fieldError("title")).toBeNull()

    await user.tab()
    expect(fieldError("title")).not.toBeNull()
  })

  it("an invalid setting value falls back to that setting's default", async () => {
    const { user, submit, onSubmit } = renderTextField({
      label: 42,
      required: "yes",
      maxLength: -1,
      pattern: "(",
    })

    // The default label, not required, no length limit, no pattern.
    const input = screen.getByRole("textbox", { name: "Text field" })
    expect(input).not.toHaveAttribute("aria-required")
    await user.type(input, "anything at all")
    await user.tab()
    submit()

    expect(fieldError("title")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("text field: keyboard", () => {
  it("is reached with Tab, typed into, and submits the form with Enter", async () => {
    const { user, submitted } = renderTextField({ label: "Title" })

    await user.tab()
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus()
    await user.keyboard("Report{Enter}")

    expect(submitted()).toEqual({ title: "Report" })
  })

  it("keeps focus on the field when Enter finds it invalid", async () => {
    const { user, onSubmit } = renderTextField({ label: "Title", required: true })

    await user.tab()
    await user.keyboard("{Enter}")

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus()
    expect(fieldError("title")).toHaveTextContent("This field is required")
  })
})
