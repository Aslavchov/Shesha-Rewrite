import { render, screen, waitFor, within } from "@testing-library/react"
import type { UserEvent } from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { select } from "."
import { SelectReadOnly } from "./select"

const definitions = [select]

const CONTACT_OPTIONS = [
  { label: "Email", value: "email" },
  { label: "Phone", value: "phone" },
  { label: "Post", value: "post" },
]

function renderSelect(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm(
    [instance("select", "contact", { options: CONTACT_OPTIONS, ...settings }, extras)],
    definitions,
  )
}

/** The control. Found by its slot, because an open list hides everything else from roles. */
function trigger(): HTMLElement {
  const element = fieldRoot("contact").querySelector<HTMLElement>("[data-slot=select-trigger]")
  if (!element) throw new Error("The select has no trigger.")
  return element
}

/**
 * Opens the list with the mouse. A press opens it on the next animation
 * frame (Base UI waits for focus to settle), so the test waits for that.
 */
async function openWithMouse(user: UserEvent) {
  await user.click(trigger())
  await waitFor(() => expect(trigger()).toHaveAttribute("aria-expanded", "true"))
}

/**
 * Opens the list from the focused trigger with a key. The list is open at
 * once; focus moves into it a moment later, so the test waits for that.
 */
async function openWithKey(user: UserEvent, key = "{ArrowDown}") {
  await user.keyboard(key)
  await waitFor(() => expect(popup().contains(document.activeElement)).toBe(true))
}

/** Closing the list hands focus back to the trigger a moment later. */
const focusReturnsToTrigger = () => waitFor(() => expect(trigger()).toHaveFocus())

const popup = () => screen.getByTestId("field-contact-popup")
const option = (name: string) => within(popup()).getByRole("option", { name })
const optionNames = () =>
  within(popup())
    .getAllByRole("option")
    .map((item) => item.textContent)

describe("select: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(select.type).toBe("select")
    expect(select.displayName).toBe("Select")
    expect(select.description).not.toBe("")
    expect(select.category).toBe("input")
    expect(select.kind).toBe("input")
    expect(select.valueType).toBe("option")
    expect(select.slots).toEqual([
      "root",
      "label",
      "trigger",
      "popup",
      "item",
      "description",
      "error",
    ])
    expect(Object.keys(select.settings)).toEqual([
      "label",
      "helpText",
      "placeholder",
      "options",
      "defaultValue",
      "required",
      "messages",
    ])
    expect(select.rules.map((rule) => rule.id)).toEqual(["required"])
    for (const setting of Object.values(select.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })
})

describe("select: default render", () => {
  it("renders a labelled, closed, empty select with no help text, error or required marker", () => {
    renderForm([instance("select", "contact")], definitions)

    const control = screen.getByRole("combobox", { name: "Select" })
    expect(control).toBe(trigger())
    expect(control).toHaveTextContent("Select an option")
    expect(control).toHaveAttribute("data-placeholder")
    expect(control).toHaveAttribute("aria-expanded", "false")
    expect(control).not.toHaveAttribute("aria-required")
    expect(control).not.toHaveAttribute("aria-invalid")
    expect(control).not.toHaveAttribute("aria-describedby")
    expect(screen.queryByTestId("field-contact-popup")).toBeNull()
    expect(fieldError("contact")).toBeNull()
    expect(fieldRoot("contact").querySelector("[data-slot=field-description]")).toBeNull()
    expect(fieldRoot("contact").querySelector("[data-slot=field-required]")).toBeNull()
  })

  it("fills the width of its field, like a text input", () => {
    renderSelect()

    expect(trigger()).toHaveClass("w-full")
    expect(trigger()).not.toHaveClass("w-fit")
  })

  it("shows the label, placeholder and help text it is given", () => {
    renderSelect({
      label: "Preferred contact method",
      placeholder: "Choose how we reach you",
      helpText: "We only use this for updates.",
    })

    const control = screen.getByRole("combobox", { name: "Preferred contact method" })
    expect(control).toHaveTextContent("Choose how we reach you")
    expect(control).toHaveAccessibleDescription("We only use this for updates.")
  })

  it("lists its options by label, in order, after an item that clears the value", async () => {
    const { user } = renderSelect()

    await openWithMouse(user)

    expect(optionNames()).toEqual(["Select an option", "Email", "Phone", "Post"])
  })

  it("names the clearing item after the placeholder", async () => {
    const { user } = renderSelect({ placeholder: "No preference" })

    await openWithMouse(user)

    expect(optionNames()).toEqual(["No preference", "Email", "Phone", "Post"])
  })

  it("shows the label of its default value, not the value", () => {
    renderSelect({ defaultValue: "phone" })

    expect(trigger()).toHaveTextContent("Phone")
    expect(trigger()).not.toHaveTextContent("phone")
    expect(trigger()).not.toHaveAttribute("data-placeholder")
  })

  it("ignores a default value that is not one of its options", () => {
    const { submit, submitted } = renderSelect({ defaultValue: "fax" })

    expect(trigger()).toHaveTextContent("Select an option")
    submit()
    expect(submitted()).toEqual({ contact: null })
  })

  it("marks a required field for the eye and for assistive technology", () => {
    renderSelect({ label: "Contact", required: true })

    expect(screen.getByRole("combobox", { name: "Contact" })).toHaveAttribute(
      "aria-required",
      "true",
    )
    const marker = fieldRoot("contact").querySelector("[data-slot=field-required]")
    expect(marker).toHaveTextContent("*")
    expect(marker).toHaveAttribute("aria-hidden", "true")
  })

  it("offers no clearing item when a value is required", async () => {
    const { user } = renderSelect({ required: true })

    await openWithMouse(user)

    expect(optionNames()).toEqual(["Email", "Phone", "Post"])
  })

  it("applies style overrides to the slot they name and to no other", async () => {
    const { user } = renderSelect(
      { label: "Contact", helpText: "Help" },
      {
        styles: {
          label: { color: "#003BB2" },
          trigger: { padding: "lg", background: { token: "muted" } },
          popup: { radius: "none", borderColor: "#FF0000" },
          item: { fontWeight: "semibold" },
        },
      },
    )

    await openWithMouse(user)

    const root = fieldRoot("contact")
    expect(root.querySelector("[data-slot=field-label]")).toHaveStyle({ color: "#003BB2" })
    expect(trigger().style.padding).toBe("var(--sys-space-lg)")
    expect(trigger().style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(trigger().style.borderRadius).toBe("")
    expect(trigger().style.fontWeight).toBe("")

    // The popup and the items never receive the trigger's padding or background.
    expect(popup()).toHaveAttribute("data-slot", "select-content")
    expect(popup().style.borderRadius).toBe("var(--sys-radius-none)")
    expect(popup()).toHaveStyle({ borderColor: "#FF0000" })
    expect(popup().style.padding).toBe("")
    expect(popup().style.backgroundColor).toBe("")
    expect(popup().style.fontWeight).toBe("")

    const items = within(popup()).getAllByRole("option")
    expect(items).toHaveLength(4)
    for (const item of items) {
      expect(item).toHaveAttribute("data-slot", "select-item")
      expect(item.style.fontWeight).toBe("var(--sys-font-weight-semibold)")
      expect(item.style.padding).toBe("")
      expect(item.style.backgroundColor).toBe("")
      expect(item.style.borderRadius).toBe("")
    }

    expect(root).not.toHaveAttribute("style")
    expect(root.querySelector("[data-slot=field-description]")).not.toHaveAttribute("style")
  })

  it("an invalid setting value falls back to that setting's default", async () => {
    const { user, submit, onSubmit } = renderSelect({
      label: 42,
      placeholder: false,
      options: [{ label: "No value", value: "" }],
      defaultValue: 7,
      required: "yes",
    })

    // The default label and placeholder, no options, no default, not required.
    const control = screen.getByRole("combobox", { name: "Select" })
    expect(control).toHaveTextContent("Select an option")
    expect(control).not.toHaveAttribute("aria-required")
    await openWithMouse(user)
    expect(optionNames()).toEqual(["Select an option"])
    await user.keyboard("{Escape}")
    submit()

    expect(fieldError("contact")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("select: read-only render", () => {
  it("shows the chosen option's label as text, with no control", async () => {
    const { user, setMode } = renderSelect({ label: "Contact" })
    await openWithMouse(user)
    await user.click(option("Phone"))

    setMode("read-only")

    expect(screen.queryByRole("combobox")).toBeNull()
    expect(fieldRoot("contact")).toHaveTextContent("Contact")
    expect(fieldValue("contact")).toHaveTextContent("Phone")
    expect(fieldValue("contact")).not.toHaveTextContent("phone")
  })

  it("shows a clear marker when there is no value", () => {
    renderForm(
      [instance("select", "contact", { label: "Contact", options: CONTACT_OPTIONS })],
      definitions,
      { mode: "read-only" },
    )

    expect(fieldValue("contact")).toHaveTextContent("—")
    expect(fieldValue("contact")).toHaveTextContent("No value")
  })

  it("shows the value itself when no option has it", () => {
    // A form cannot produce this by itself: values only come from the options.
    // It happens when the options change under a stored value.
    render(
      <SelectReadOnly
        instance={{ id: "c_contact", name: "contact" }}
        settings={{
          label: "Contact",
          helpText: null,
          placeholder: null,
          options: CONTACT_OPTIONS,
          defaultValue: null,
          required: false,
        }}
        slots={{
          root: { "data-testid": "field-contact" },
          label: {},
          trigger: {},
          popup: {},
          item: {},
          description: {},
          error: {},
        }}
        value="fax"
      />,
    )

    expect(fieldValue("contact")).toHaveTextContent("fax")
  })
})

describe("select: values", () => {
  it("submits the chosen option's value, a string", async () => {
    const { user, submit, submitted } = renderSelect()

    await openWithMouse(user)
    await user.click(option("Post"))
    submit()

    expect(trigger()).toHaveTextContent("Post")
    expect(submitted()).toEqual({ contact: "post" })
  })

  it("submits its default value when nothing else is chosen", () => {
    const { submit, submitted } = renderSelect({ defaultValue: "email" })

    submit()

    expect(submitted()).toEqual({ contact: "email" })
  })

  it("submits null when nothing is chosen, and again after the value is cleared", async () => {
    const { user, submit, submitted } = renderSelect()
    submit()
    expect(submitted()).toEqual({ contact: null })

    await openWithMouse(user)
    await user.click(option("Email"))
    submit()
    expect(submitted()).toEqual({ contact: "email" })

    await openWithMouse(user)
    await user.click(option("Select an option"))
    submit()

    expect(trigger()).toHaveTextContent("Select an option")
    expect(trigger()).toHaveAttribute("data-placeholder")
    expect(submitted()).toEqual({ contact: null })
  })

  it("marks the chosen option in the list", async () => {
    const { user } = renderSelect({ defaultValue: "phone" })

    await openWithMouse(user)

    expect(option("Phone")).toHaveAttribute("aria-selected", "true")
    expect(option("Email")).toHaveAttribute("aria-selected", "false")
  })
})

describe("select: validation rules", () => {
  it("required: leaving it empty is an error; choosing an option clears it", async () => {
    const { user, submit, onSubmit } = renderSelect({ required: true })

    await user.tab()
    expect(trigger()).toHaveFocus()
    expect(fieldError("contact")).toBeNull()

    await user.tab()
    expect(fieldError("contact")).toHaveTextContent("This field is required")
    expect(trigger()).toHaveAttribute("aria-invalid", "true")
    expect(trigger()).toHaveAccessibleDescription("This field is required")

    await openWithMouse(user)
    await user.click(option("Email"))
    expect(fieldError("contact")).toBeNull()
    expect(trigger()).not.toHaveAttribute("aria-invalid")

    submit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("required: a submit with nothing chosen shows the error and focuses the select", () => {
    const { submit, onSubmit } = renderSelect({ required: true })

    submit()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(fieldError("contact")).toHaveTextContent("This field is required")
    expect(trigger()).toHaveFocus()
  })

  it("an optional select left empty is not an error", async () => {
    const { user, submit, onSubmit } = renderSelect()

    await user.tab()
    await user.tab()
    submit()

    expect(fieldError("contact")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("shows no error while the list is open, only once the select is left", async () => {
    const { user } = renderSelect({ required: true })

    // Opening the list moves focus from the trigger into the list.
    await user.tab()
    await openWithKey(user)
    expect(option("Email")).toHaveFocus()
    expect(fieldError("contact")).toBeNull()

    // Closing it without choosing returns to the trigger: still not left.
    await user.keyboard("{Escape}")
    await focusReturnsToTrigger()
    expect(fieldError("contact")).toBeNull()

    await user.tab()
    expect(fieldError("contact")).toHaveTextContent("This field is required")
  })

  it("counts as left when Tab moves on from the open list", async () => {
    const { user } = renderForm(
      [
        instance("select", "contact", { options: CONTACT_OPTIONS, required: true }),
        instance("select", "backup", { label: "Backup", options: CONTACT_OPTIONS }),
      ],
      definitions,
    )

    await user.tab()
    await openWithKey(user)
    expect(fieldError("contact")).toBeNull()
    await user.tab()

    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("combobox", { name: "Backup" })).toHaveFocus()
    expect(fieldError("contact")).toHaveTextContent("This field is required")
  })

  it("counts as left when the open list is dismissed by clicking away", async () => {
    const { user } = renderSelect({ required: true })

    await openWithMouse(user)
    expect(fieldError("contact")).toBeNull()
    await user.click(document.body)

    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    expect(fieldError("contact")).toHaveTextContent("This field is required")
  })

  it("uses the instance's own message for a rule when it sets one", async () => {
    const { user } = renderSelect({
      required: true,
      messages: { required: "Choose how we should contact you" },
    })

    await user.tab()
    await user.tab()

    expect(fieldError("contact")).toHaveTextContent("Choose how we should contact you")
  })
})

describe("select: keyboard", () => {
  it("opens with the keyboard, moves with the arrows, chooses with Enter and returns focus", async () => {
    const { user, submit, submitted } = renderSelect({ label: "Contact", required: true })

    await user.tab()
    expect(screen.getByRole("combobox", { name: "Contact" })).toHaveFocus()

    await openWithKey(user)
    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    expect(option("Email")).toHaveFocus()

    await user.keyboard("{ArrowDown}")
    expect(option("Phone")).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(option("Post")).toHaveFocus()
    await user.keyboard("{ArrowUp}")
    expect(option("Phone")).toHaveFocus()

    await user.keyboard("{Enter}")
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    await focusReturnsToTrigger()
    expect(trigger()).toHaveTextContent("Phone")

    submit()
    expect(submitted()).toEqual({ contact: "phone" })
  })

  it.each(["{Enter}", " "])("opens with the %j key too", async (key) => {
    const { user } = renderSelect()

    await user.tab()
    await openWithKey(user, key)

    expect(trigger()).toHaveAttribute("aria-expanded", "true")
    expect(option("Select an option")).toHaveFocus()
  })

  it("closes with Escape, keeps the value and returns focus to the trigger", async () => {
    const { user, submit, submitted } = renderSelect({ defaultValue: "email" })

    await user.tab()
    await openWithKey(user)
    expect(option("Email")).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(option("Phone")).toHaveFocus()

    await user.keyboard("{Escape}")
    expect(trigger()).toHaveAttribute("aria-expanded", "false")
    await focusReturnsToTrigger()
    expect(trigger()).toHaveTextContent("Email")

    submit()
    expect(submitted()).toEqual({ contact: "email" })
  })

  it("clears the value from the keyboard through the first item", async () => {
    const { user, submit, submitted } = renderSelect({ defaultValue: "email" })

    await user.tab()
    await openWithKey(user)
    expect(option("Email")).toHaveFocus()
    await user.keyboard("{ArrowUp}")
    expect(option("Select an option")).toHaveFocus()
    await user.keyboard("{Enter}")

    await focusReturnsToTrigger()
    expect(trigger()).toHaveTextContent("Select an option")
    submit()
    expect(submitted()).toEqual({ contact: null })
  })
})
