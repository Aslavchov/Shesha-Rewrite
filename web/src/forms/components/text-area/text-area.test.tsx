import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { textArea } from "."

const definitions = [textArea]

function renderTextArea(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm([instance("text-area", "notes", settings, extras)], definitions)
}

describe("text area: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(textArea.type).toBe("text-area")
    expect(textArea.displayName).toBe("Text area")
    expect(textArea.description).not.toBe("")
    expect(textArea.category).toBe("input")
    expect(textArea.kind).toBe("input")
    expect(textArea.valueType).toBe("text")
    expect(textArea.slots).toEqual(["root", "label", "control", "description", "error"])
    expect(Object.keys(textArea.settings)).toEqual([
      "label",
      "helpText",
      "placeholder",
      "defaultValue",
      "required",
      "maxLength",
      "rows",
      "messages",
    ])
    expect(textArea.rules.map((rule) => rule.id)).toEqual(["required", "maxLength"])
    for (const setting of Object.values(textArea.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })
})

describe("text area: default render", () => {
  it("renders a labelled, empty, four-row text area with no help text, error or required marker", () => {
    renderTextArea()

    const control = screen.getByRole("textbox", { name: "Text area" })
    expect(control.tagName).toBe("TEXTAREA")
    expect(control).toHaveValue("")
    expect(control).toHaveAttribute("rows", "4")
    expect(control).not.toHaveAttribute("placeholder")
    expect(control).not.toHaveAttribute("aria-required")
    expect(control).not.toHaveAttribute("aria-invalid")
    expect(control).not.toHaveAttribute("aria-describedby")
    expect(fieldRoot("notes")).toContainElement(control)
    expect(fieldError("notes")).toBeNull()
    expect(fieldRoot("notes").querySelector("[data-slot=field-description]")).toBeNull()
    expect(fieldRoot("notes").querySelector("[data-slot=field-required]")).toBeNull()
  })

  it("shows the label, placeholder, help text, default value and rows it is given", () => {
    renderTextArea({
      label: "Notes",
      placeholder: "Anything we should know",
      helpText: "Up to 500 characters.",
      defaultValue: "First line\nSecond line",
      rows: 8,
    })

    const control = screen.getByRole("textbox", { name: "Notes" })
    expect(control).toHaveValue("First line\nSecond line")
    expect(control).toHaveAttribute("placeholder", "Anything we should know")
    expect(control).toHaveAccessibleDescription("Up to 500 characters.")
    expect(control).toHaveAttribute("rows", "8")
  })

  it("marks a required field for the eye and for assistive technology", () => {
    renderTextArea({ label: "Notes", required: true })

    const control = screen.getByRole("textbox", { name: "Notes" })
    expect(control).toHaveAttribute("aria-required", "true")
    const marker = fieldRoot("notes").querySelector("[data-slot=field-required]")
    expect(marker).toHaveTextContent("*")
    // The star is decoration: the accessible name stays "Notes".
    expect(marker).toHaveAttribute("aria-hidden", "true")
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderTextArea(
      { label: "Notes", helpText: "Help" },
      {
        styles: {
          label: { color: "#003BB2" },
          control: { background: { token: "muted" }, radius: "xl" },
          description: { fontWeight: "medium" },
        },
      },
    )

    const root = fieldRoot("notes")
    const label = root.querySelector("[data-slot=field-label]")
    const description = root.querySelector<HTMLElement>("[data-slot=field-description]")
    const control = screen.getByRole("textbox")
    expect(control).toHaveAttribute("data-slot", "textarea")
    expect(label).toHaveStyle({ color: "#003BB2" })
    expect(control.style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(control.style.borderRadius).toBe("var(--sys-radius-xl)")
    expect(control.style.color).toBe("")
    expect(description?.style.fontWeight).not.toBe("")
    expect(description?.style.color).toBe("")
    expect(root).not.toHaveAttribute("style")
  })

  it("styles the error and the root when they are overridden", async () => {
    const { user } = renderTextArea(
      { required: true },
      { styles: { root: { padding: "md" }, error: { fontWeight: "semibold" } } },
    )

    await user.click(screen.getByRole("textbox"))
    await user.tab()

    expect(fieldRoot("notes").style.padding).not.toBe("")
    expect(fieldError("notes")?.style.fontWeight).not.toBe("")
    expect(screen.getByRole("textbox")).not.toHaveAttribute("style")
  })
})

describe("text area: read-only render", () => {
  it("shows the value as text with its line breaks, and no control", async () => {
    const { user, setMode } = renderTextArea({ label: "Notes" })
    await user.type(screen.getByRole("textbox"), "Line one{Enter}Line two")

    setMode("read-only")

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(fieldRoot("notes")).toHaveTextContent("Notes")
    // Exactly as typed: the line break is kept, not collapsed to a space.
    expect(fieldValue("notes").textContent).toBe("Line one\nLine two")
  })

  it("shows a clear marker when there is no value", () => {
    renderForm([instance("text-area", "notes", { label: "Notes" })], definitions, {
      mode: "read-only",
    })

    expect(fieldValue("notes")).toHaveTextContent("—")
    expect(fieldValue("notes")).toHaveTextContent("No value")
  })
})

describe("text area: values", () => {
  it("submits the text typed, line breaks included", async () => {
    const { user, submit, submitted } = renderTextArea()

    await user.type(screen.getByRole("textbox"), "Hello{Enter}there")
    submit()

    expect(submitted()).toEqual({ notes: "Hello\nthere" })
  })

  it("submits null, never an empty string, when nothing is entered or the text is cleared", async () => {
    const { user, submit, submitted } = renderTextArea()
    submit()
    expect(submitted()).toEqual({ notes: null })

    await user.type(screen.getByRole("textbox"), "x")
    await user.clear(screen.getByRole("textbox"))
    submit()

    expect(submitted()).toEqual({ notes: null })
  })
})

describe("text area: validation rules", () => {
  it("required: an empty or blank value is an error; any text clears it", async () => {
    const { user, submit, onSubmit } = renderTextArea({ label: "Notes", required: true })
    const control = screen.getByRole("textbox")

    await user.click(control)
    await user.tab()
    expect(fieldError("notes")).toHaveTextContent("This field is required")
    expect(control).toHaveAttribute("aria-invalid", "true")
    expect(control).toHaveAccessibleDescription("This field is required")

    await user.type(control, " {Enter} ")
    expect(fieldError("notes")).toHaveTextContent("This field is required")

    await user.type(control, "a")
    expect(fieldError("notes")).toBeNull()
    expect(control).not.toHaveAttribute("aria-invalid")

    submit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("maximum length", async () => {
    const { user } = renderTextArea({ maxLength: 5 })
    const control = screen.getByRole("textbox")

    await user.type(control, "abcdef")
    await user.tab()
    expect(fieldError("notes")).toHaveTextContent("Enter no more than 5 characters")

    await user.type(control, "{Backspace}")
    expect(fieldError("notes")).toBeNull()
  })

  it("maximum length: text over the limit is kept and reported, not cut off", async () => {
    const { user, submit, onSubmit } = renderTextArea({ maxLength: 10 })
    const control = screen.getByRole("textbox")
    expect(control).not.toHaveAttribute("maxlength")

    await user.click(control)
    await user.paste("A paragraph that is far too long")
    expect(control).toHaveValue("A paragraph that is far too long")

    submit()
    expect(fieldError("notes")).toHaveTextContent("Enter no more than 10 characters")
    expect(onSubmit).not.toHaveBeenCalled()
    expect(control).toHaveFocus()
  })

  it("an empty optional field passes the length rule", async () => {
    const { user, submit, onSubmit } = renderTextArea({ maxLength: 5 })

    await user.click(screen.getByRole("textbox"))
    await user.tab()
    submit()

    expect(fieldError("notes")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("uses the instance's own message for a rule when it sets one", async () => {
    const { user } = renderTextArea({
      required: true,
      maxLength: 3,
      messages: { required: "Add a note", maxLength: "Keep it to 3 characters" },
    })
    const control = screen.getByRole("textbox")

    await user.click(control)
    await user.tab()
    expect(fieldError("notes")).toHaveTextContent("Add a note")

    await user.type(control, "abcd")
    await user.tab()
    expect(fieldError("notes")).toHaveTextContent("Keep it to 3 characters")
  })

  it("shows no error while a person is first typing, only after they leave", async () => {
    const { user } = renderTextArea({ maxLength: 2 })
    const control = screen.getByRole("textbox")

    await user.type(control, "abc")
    expect(fieldError("notes")).toBeNull()

    await user.tab()
    expect(fieldError("notes")).not.toBeNull()
  })

  it.each([1, 21, 2.5, "6", null])(
    "an invalid rows value (%j) falls back to the default",
    (rows) => {
      renderTextArea({ rows })

      expect(screen.getByRole("textbox")).toHaveAttribute("rows", "4")
    },
  )

  it("an invalid setting value falls back to that setting's default", async () => {
    const { user, submit, onSubmit } = renderTextArea({
      label: 42,
      required: "yes",
      maxLength: -1,
    })

    // The default label, not required, no length limit.
    const control = screen.getByRole("textbox", { name: "Text area" })
    expect(control).not.toHaveAttribute("aria-required")
    await user.type(control, "anything at all")
    await user.tab()
    submit()

    expect(fieldError("notes")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("text area: keyboard", () => {
  it("is reached with Tab and typed into; Enter adds a line and does not submit", async () => {
    const { user, onSubmit, submit, submitted } = renderTextArea({ label: "Notes" })

    await user.tab()
    const control = screen.getByRole("textbox", { name: "Notes" })
    expect(control).toHaveFocus()
    await user.keyboard("One{Enter}Two")

    expect(control).toHaveValue("One\nTwo")
    expect(onSubmit).not.toHaveBeenCalled()

    submit()
    expect(submitted()).toEqual({ notes: "One\nTwo" })
  })

  it("is left with Tab, which never types a tab character", async () => {
    const { user } = renderTextArea({ label: "Notes" })

    await user.tab()
    await user.keyboard("One")
    await user.tab()

    expect(screen.getByRole("textbox", { name: "Notes" })).not.toHaveFocus()
    expect(screen.getByRole("textbox", { name: "Notes" })).toHaveValue("One")
  })
})
