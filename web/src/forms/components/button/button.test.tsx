import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { buttonVariants } from "@/components/ui/button"

import { fieldError, fieldRoot, instance, renderForm } from "../../testing/render-form"
import { textField } from "../text-field"
import { button } from "."

const definitions = [textField, button]

/** shadcn's variant names, exactly as `ui/button.tsx` spells them. */
const VARIANTS = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const

/** A button instance. Buttons hold no value, so they have no data path. */
function buttonInstance(name: string, settings: Record<string, unknown> = {}, extras = {}) {
  return instance("button", name, settings, { bind: null, ...extras })
}

/** A form with a required Title, a Subtitle that starts as "Draft", and the buttons given. */
function renderWithFields(...buttons: ReturnType<typeof buttonInstance>[]) {
  return renderForm(
    [
      instance("text-field", "title", { label: "Title", required: true }),
      instance("text-field", "subtitle", { label: "Subtitle", defaultValue: "Draft" }),
      ...buttons,
    ],
    definitions,
  )
}

const title = () => screen.getByRole("textbox", { name: "Title" })
const subtitle = () => screen.getByRole("textbox", { name: "Subtitle" })

/** The classes `ui/button.tsx` gives one variant and no other part of a button. */
function variantClasses(variant: (typeof VARIANTS)[number]): string[] {
  const shared = new Set(buttonVariants({ variant: null }).split(" "))
  return buttonVariants({ variant })
    .split(" ")
    .filter((name) => !shared.has(name))
}

describe("button: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(button.type).toBe("button")
    expect(button.displayName).toBe("Button")
    expect(button.description).not.toBe("")
    expect(button.category).toBe("action")
    expect(button.kind).toBe("static")
    expect(button.valueType).toBeNull()
    expect(button.rules).toEqual([])
    expect(button.slots).toEqual(["root"])
    expect(Object.keys(button.settings)).toEqual(["label", "action", "variant"])
    for (const setting of Object.values(button.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })

  it("offers submit and reset as actions, and submits unless told otherwise", () => {
    const { action } = button.settings
    expect(action.choices?.map((choice) => choice.value)).toEqual(["submit", "reset"])
    expect(action.default).toBe("submit")
  })

  it("offers shadcn's variants under their own names, primary first and by default", () => {
    const { variant } = button.settings
    expect(variant.choices?.map((choice) => choice.value)).toEqual([...VARIANTS])
    expect(variant.default).toBe("default")
    for (const choice of variant.choices ?? []) expect(choice.label).not.toBe("")
  })

  it("names only variants ui/button.tsx really has: each has classes of its own", () => {
    for (const variant of VARIANTS) {
      expect(variantClasses(variant), variant).not.toEqual([])
    }
  })

  it("has no regions and no field", () => {
    const prepared = button.prepare(buttonInstance("send"))
    expect(prepared.regions).toEqual([])
    expect(prepared.field).toBeNull()
    expect(prepared.problems).toEqual([])
  })
})

describe("button: default render", () => {
  it("renders a primary submit button labelled Button", () => {
    renderForm([buttonInstance("send")], definitions)

    const element = screen.getByRole("button", { name: "Button" })
    expect(element).toBe(fieldRoot("send"))
    expect(element.tagName).toBe("BUTTON")
    expect(element).toHaveAttribute("data-slot", "button")
    expect(element).toHaveAttribute("type", "submit")
    expect(element).toHaveClass(...variantClasses("default"))
    expect(element).toBeEnabled()
    expect(element).not.toHaveAttribute("style")
  })

  it("shows the label it is given", () => {
    renderForm([buttonInstance("send", { label: "Save changes" })], definitions)

    expect(screen.getByRole("button", { name: "Save changes" })).toBe(fieldRoot("send"))
  })

  it.each(VARIANTS)("applies the %s variant and no other", (variant) => {
    renderForm([buttonInstance("send", { variant })], definitions)

    // Of all the classes any variant uses, the button has exactly this one's.
    const anyVariant = new Set(VARIANTS.flatMap(variantClasses))
    const applied = [...fieldRoot("send").classList].filter((name) => anyVariant.has(name))
    expect(applied.sort()).toEqual(variantClasses(variant).sort())
  })

  it("keeps its own width where its container would stretch it", () => {
    renderForm([buttonInstance("send")], definitions)

    expect(fieldRoot("send")).toHaveClass("self-start")
  })

  it("applies a style override to the root, which is the button itself", () => {
    renderForm(
      [
        buttonInstance(
          "send",
          {},
          {
            styles: {
              root: { background: { token: "destructive" }, color: "#FFFFFF", radius: "full" },
            },
          },
        ),
        buttonInstance("other"),
      ],
      definitions,
    )

    const element = fieldRoot("send")
    expect(element.style.backgroundColor).toBe("var(--sys-color-destructive)")
    expect(element).toHaveStyle({ color: "#FFFFFF" })
    expect(element.style.borderRadius).toBe("var(--sys-radius-full)")
    expect(element.style.padding).toBe("")
    expect(fieldRoot("other")).not.toHaveAttribute("style")
  })

  it("an invalid setting value falls back to that setting's default", () => {
    renderForm(
      [buttonInstance("send", { label: 7, action: "explode", variant: "primary" })],
      definitions,
    )

    const element = screen.getByRole("button", { name: "Button" })
    expect(element).toHaveAttribute("type", "submit")
    expect(element).toHaveClass(...variantClasses("default"))
  })
})

describe("button: submit action", () => {
  it("validates and hands the values to the host when clicked", async () => {
    const { user, onSubmit, submitted } = renderWithFields(buttonInstance("send"))
    await user.type(title(), "Annual report")

    await user.click(fieldRoot("send"))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(submitted()).toEqual({ title: "Annual report", subtitle: "Draft" })
    expect(fieldError("title")).toBeNull()
  })

  it("a failed submit shows the errors, focuses the first invalid field and submits nothing", async () => {
    const { user, onSubmit } = renderWithFields(buttonInstance("send"))

    await user.click(fieldRoot("send"))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(fieldError("title")).toHaveTextContent("This field is required")
    expect(fieldError("subtitle")).toBeNull()
    expect(title()).toHaveFocus()
  })

  it("submits once, through the form: Enter in a text input takes the same path", async () => {
    const { user, onSubmit, submitted } = renderWithFields(buttonInstance("send"))

    await user.type(title(), "Report{Enter}")

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(submitted()).toEqual({ title: "Report", subtitle: "Draft" })
  })

  it("does not reset the form", async () => {
    const { user, onReset } = renderWithFields(buttonInstance("send"))
    await user.type(title(), "Kept")

    await user.click(fieldRoot("send"))

    expect(onReset).not.toHaveBeenCalled()
    expect(title()).toHaveValue("Kept")
  })
})

describe("button: reset action", () => {
  it("is a plain button, never a native reset", () => {
    renderWithFields(buttonInstance("clear", { action: "reset", label: "Reset" }))

    expect(screen.getByRole("button", { name: "Reset" })).toHaveAttribute("type", "button")
  })

  it("returns every value to its default and clears the errors, without submitting", async () => {
    const { user, submit, onSubmit, onReset } = renderWithFields(
      buttonInstance("clear", { action: "reset", label: "Reset" }),
    )
    await user.clear(subtitle())
    await user.type(subtitle(), "Changed")
    submit()
    expect(fieldError("title")).not.toBeNull()

    await user.click(fieldRoot("clear"))

    expect(title()).toHaveValue("")
    expect(subtitle()).toHaveValue("Draft")
    expect(fieldError("title")).toBeNull()
    expect(title()).not.toHaveAttribute("aria-invalid")
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("works beside a submit button, each doing its own job", async () => {
    const { user, onSubmit, onReset, submitted } = renderWithFields(
      buttonInstance("send", { label: "Submit" }),
      buttonInstance("clear", { action: "reset", label: "Reset", variant: "outline" }),
    )
    await user.type(title(), "First")

    await user.click(screen.getByRole("button", { name: "Reset" }))
    expect(title()).toHaveValue("")
    expect(onSubmit).not.toHaveBeenCalled()

    await user.type(title(), "Second")
    await user.click(screen.getByRole("button", { name: "Submit" }))
    expect(submitted()).toEqual({ title: "Second", subtitle: "Draft" })
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})

describe("button: read-only render", () => {
  it("renders nothing: Submit and Reset are not available", () => {
    renderForm(
      [
        instance("text-field", "title", { label: "Title" }),
        buttonInstance("send"),
        buttonInstance("clear", { action: "reset" }),
      ],
      definitions,
      { mode: "read-only" },
    )

    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByTestId("field-send")).toBeNull()
    expect(screen.queryByTestId("field-clear")).toBeNull()
    expect(fieldRoot("title")).toBeVisible()
  })

  it("comes back when the form returns to edit mode", () => {
    const { setMode } = renderForm([buttonInstance("send")], definitions)

    setMode("read-only")
    expect(screen.queryByRole("button")).toBeNull()

    setMode("edit")
    expect(screen.getByRole("button", { name: "Button" })).toBeVisible()
  })
})

describe("button: keyboard", () => {
  it("is reached with Tab, after the fields before it and in document order", async () => {
    const { user } = renderWithFields(
      buttonInstance("send", { label: "Submit" }),
      buttonInstance("clear", { action: "reset", label: "Reset" }),
    )

    await user.tab()
    expect(title()).toHaveFocus()
    await user.tab()
    expect(subtitle()).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "Reset" })).toHaveFocus()
  })

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])("%s on a focused submit button submits the form", async (_key, keys) => {
    const { user, onSubmit, submitted } = renderWithFields(buttonInstance("send"))
    await user.type(title(), "Report")
    await user.tab()
    await user.tab()
    expect(fieldRoot("send")).toHaveFocus()

    await user.keyboard(keys)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(submitted()).toEqual({ title: "Report", subtitle: "Draft" })
  })

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])(
    "%s on a focused submit button shows the errors when the form is invalid",
    async (_key, keys) => {
      const { user, onSubmit } = renderWithFields(buttonInstance("send"))
      await user.tab()
      await user.tab()
      await user.tab()
      expect(fieldRoot("send")).toHaveFocus()

      await user.keyboard(keys)

      expect(onSubmit).not.toHaveBeenCalled()
      expect(fieldError("title")).toHaveTextContent("This field is required")
      expect(title()).toHaveFocus()
    },
  )

  it.each([
    ["Enter", "{Enter}"],
    ["Space", " "],
  ])("%s on a focused reset button resets the form", async (_key, keys) => {
    const { user, onSubmit, onReset } = renderWithFields(
      buttonInstance("clear", { action: "reset", label: "Reset" }),
    )
    await user.type(title(), "Typed")
    await user.tab()
    await user.tab()
    expect(fieldRoot("clear")).toHaveFocus()

    await user.keyboard(keys)

    expect(title()).toHaveValue("")
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
