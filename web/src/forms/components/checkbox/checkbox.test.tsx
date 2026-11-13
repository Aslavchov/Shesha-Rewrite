import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { checkbox } from "."

const definitions = [checkbox]

function renderCheckbox(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm([instance("checkbox", "terms", settings, extras)], definitions)
}

describe("checkbox: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(checkbox.type).toBe("checkbox")
    expect(checkbox.displayName).toBe("Checkbox")
    expect(checkbox.description).not.toBe("")
    expect(checkbox.category).toBe("input")
    expect(checkbox.kind).toBe("input")
    expect(checkbox.valueType).toBe("boolean")
    expect(checkbox.slots).toEqual(["root", "control", "label", "description", "error"])
    expect(Object.keys(checkbox.settings)).toEqual([
      "label",
      "helpText",
      "defaultValue",
      "required",
      "messages",
    ])
    expect(checkbox.rules.map((rule) => rule.id)).toEqual(["required"])
    for (const setting of Object.values(checkbox.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })
})

describe("checkbox: default render", () => {
  it("renders a labelled, unchecked box with no help text, error or required marker", () => {
    renderCheckbox()

    const box = screen.getByRole("checkbox", { name: "Checkbox" })
    expect(box).not.toBeChecked()
    expect(box).toHaveAttribute("data-slot", "checkbox")
    expect(box).not.toHaveAttribute("aria-required")
    expect(box).not.toHaveAttribute("aria-invalid")
    expect(box).not.toHaveAttribute("aria-describedby")
    expect(fieldRoot("terms")).toContainElement(box)
    expect(fieldError("terms")).toBeNull()
    expect(fieldRoot("terms").querySelector("[data-slot=field-description]")).toBeNull()
    expect(fieldRoot("terms").querySelector("[data-slot=field-required]")).toBeNull()
  })

  it("shows the label, help text and default value it is given", () => {
    renderCheckbox({
      label: "I accept the terms",
      helpText: "You can read them below.",
      defaultValue: true,
    })

    const box = screen.getByRole("checkbox", { name: "I accept the terms" })
    expect(box).toBeChecked()
    expect(box).toHaveAccessibleDescription("You can read them below.")
  })

  it("marks a required field for the eye and for assistive technology", () => {
    renderCheckbox({ label: "I accept the terms", required: true })

    const box = screen.getByRole("checkbox", { name: "I accept the terms" })
    expect(box).toHaveAttribute("aria-required", "true")
    const marker = fieldRoot("terms").querySelector("[data-slot=field-required]")
    expect(marker).toHaveTextContent("*")
    // The star is decoration: the accessible name stays "I accept the terms".
    expect(marker).toHaveAttribute("aria-hidden", "true")
  })

  it("is toggled by clicking the box or its label", async () => {
    const { user } = renderCheckbox({ label: "I accept the terms" })
    const box = screen.getByRole("checkbox")

    await user.click(screen.getByText("I accept the terms"))
    expect(box).toBeChecked()

    await user.click(box)
    expect(box).not.toBeChecked()
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderCheckbox(
      { label: "I accept the terms", helpText: "Help" },
      {
        styles: {
          label: { color: "#003BB2" },
          control: { borderColor: { token: "primary" }, radius: "full" },
        },
      },
    )

    const root = fieldRoot("terms")
    const box = screen.getByRole("checkbox")
    expect(root.querySelector("[data-slot=field-label]")).toHaveStyle({ color: "#003BB2" })
    expect(box.style.borderColor).toBe("var(--sys-color-primary)")
    expect(box.style.borderRadius).toBe("var(--sys-radius-full)")
    expect(box.style.color).toBe("")
    expect(root).not.toHaveAttribute("style")
    expect(root.querySelector("[data-slot=field-description]")).not.toHaveAttribute("style")
  })

  it("an invalid setting value falls back to that setting's default", () => {
    const { submit, onSubmit } = renderCheckbox({
      label: 42,
      helpText: 7,
      defaultValue: "yes",
      required: "yes",
    })

    // The default label, no help text, unchecked, not required.
    const box = screen.getByRole("checkbox", { name: "Checkbox" })
    expect(box).not.toBeChecked()
    expect(box).not.toHaveAttribute("aria-required")
    expect(box).not.toHaveAttribute("aria-describedby")
    submit()

    expect(fieldError("terms")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("checkbox: read-only render", () => {
  it("shows Yes for a checked box, as text with no control", async () => {
    const { user, setMode } = renderCheckbox({ label: "I accept the terms" })
    await user.click(screen.getByRole("checkbox"))

    setMode("read-only")

    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(fieldRoot("terms")).toHaveTextContent("I accept the terms")
    expect(fieldValue("terms")).toHaveTextContent("Yes")
  })

  it("shows No for an unchecked box, never the empty marker", () => {
    renderForm([instance("checkbox", "terms", { label: "I accept the terms" })], definitions, {
      mode: "read-only",
    })

    expect(fieldValue("terms")).toHaveTextContent("No")
    expect(fieldValue("terms")).not.toHaveAttribute("data-empty")
  })
})

describe("checkbox: values", () => {
  it("submits false, never null, when it is left unchecked", () => {
    const { submit, submitted } = renderCheckbox()

    submit()

    expect(submitted()).toEqual({ terms: false })
  })

  it("submits true when checked and false again when unchecked", async () => {
    const { user, submit, submitted } = renderCheckbox()
    const box = screen.getByRole("checkbox")

    await user.click(box)
    submit()
    expect(submitted()).toEqual({ terms: true })

    await user.click(box)
    submit()
    expect(submitted()).toEqual({ terms: false })
  })

  it("submits its default value when it is not touched", () => {
    const { submit, submitted } = renderCheckbox({ defaultValue: true })

    submit()

    expect(submitted()).toEqual({ terms: true })
  })
})

describe("checkbox: validation rules", () => {
  it("required: it must be checked; checking it clears the error", async () => {
    const { user, submit, onSubmit } = renderCheckbox({ required: true })
    const box = screen.getByRole("checkbox")

    await user.tab()
    expect(box).toHaveFocus()
    expect(fieldError("terms")).toBeNull()

    await user.tab()
    expect(fieldError("terms")).toHaveTextContent("This box must be checked")
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(box).toHaveAccessibleDescription("This box must be checked")

    await user.click(box)
    expect(fieldError("terms")).toBeNull()
    expect(box).not.toHaveAttribute("aria-invalid")

    submit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("required: a submit with the box unchecked shows the error and focuses the box", () => {
    const { submit, onSubmit } = renderCheckbox({ required: true })

    submit()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(fieldError("terms")).toHaveTextContent("This box must be checked")
    expect(screen.getByRole("checkbox")).toHaveFocus()
  })

  it("required: checking and unchecking again while the error shows brings it back", async () => {
    const { user, submit } = renderCheckbox({ required: true })
    const box = screen.getByRole("checkbox")
    submit()

    await user.click(box)
    expect(fieldError("terms")).toBeNull()
    await user.click(box)
    await user.tab()

    expect(fieldError("terms")).toHaveTextContent("This box must be checked")
  })

  it("an optional box left unchecked is not an error", async () => {
    const { user, submit, onSubmit } = renderCheckbox()

    await user.tab()
    await user.tab()
    submit()

    expect(fieldError("terms")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("uses the instance's own message for a rule when it sets one", async () => {
    const { user } = renderCheckbox({
      required: true,
      messages: { required: "Accept the terms to continue" },
    })

    await user.tab()
    await user.tab()

    expect(fieldError("terms")).toHaveTextContent("Accept the terms to continue")
  })
})

describe("checkbox: keyboard", () => {
  it("is reached with Tab and toggled with Space", async () => {
    const { user, submit, submitted } = renderCheckbox({ label: "I accept the terms" })

    await user.tab()
    const box = screen.getByRole("checkbox", { name: "I accept the terms" })
    expect(box).toHaveFocus()

    await user.keyboard(" ")
    expect(box).toBeChecked()
    expect(box).toHaveFocus()
    submit()
    expect(submitted()).toEqual({ terms: true })

    await user.keyboard(" ")
    expect(box).not.toBeChecked()
    submit()
    expect(submitted()).toEqual({ terms: false })
  })

  it("is not toggled by Enter", async () => {
    const { user } = renderCheckbox()

    await user.tab()
    await user.keyboard("{Enter}")

    expect(screen.getByRole("checkbox")).not.toBeChecked()
  })
})
