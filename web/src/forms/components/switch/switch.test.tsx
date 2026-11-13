import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { switchField } from "."

const definitions = [switchField]

function renderSwitch(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm([instance("switch", "subscribe", settings, extras)], definitions)
}

describe("switch: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(switchField.type).toBe("switch")
    expect(switchField.displayName).toBe("Switch")
    expect(switchField.description).not.toBe("")
    expect(switchField.category).toBe("input")
    expect(switchField.kind).toBe("input")
    expect(switchField.valueType).toBe("boolean")
    expect(switchField.slots).toEqual(["root", "control", "label", "description"])
    // No rules, so no required setting and no messages.
    expect(Object.keys(switchField.settings)).toEqual(["label", "helpText", "defaultValue"])
    expect(switchField.rules).toEqual([])
    for (const setting of Object.values(switchField.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })
})

describe("switch: default render", () => {
  it("renders a labelled switch that is off, with no help text, error or required marker", () => {
    renderSwitch()

    const control = screen.getByRole("switch", { name: "Switch" })
    expect(control).not.toBeChecked()
    expect(control).toHaveAttribute("data-slot", "switch")
    expect(control).not.toHaveAttribute("aria-required")
    expect(control).not.toHaveAttribute("aria-invalid")
    expect(control).not.toHaveAttribute("aria-describedby")
    expect(fieldRoot("subscribe")).toContainElement(control)
    expect(fieldError("subscribe")).toBeNull()
    expect(fieldRoot("subscribe").querySelector("[data-slot=field-description]")).toBeNull()
    expect(fieldRoot("subscribe").querySelector("[data-slot=field-required]")).toBeNull()
  })

  it("shows the label, help text and default value it is given", () => {
    renderSwitch({
      label: "Subscribe to updates",
      helpText: "About one email a month.",
      defaultValue: true,
    })

    const control = screen.getByRole("switch", { name: "Subscribe to updates" })
    expect(control).toBeChecked()
    expect(control).toHaveAccessibleDescription("About one email a month.")
  })

  it("is toggled by clicking the switch or its label", async () => {
    const { user } = renderSwitch({ label: "Subscribe to updates" })
    const control = screen.getByRole("switch")

    await user.click(screen.getByText("Subscribe to updates"))
    expect(control).toBeChecked()

    await user.click(control)
    expect(control).not.toBeChecked()
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderSwitch(
      { label: "Subscribe to updates", helpText: "Help" },
      {
        styles: {
          label: { fontWeight: "semibold" },
          control: { background: "#003BB2", radius: "sm" },
        },
      },
    )

    const root = fieldRoot("subscribe")
    const control = screen.getByRole("switch")
    const label = root.querySelector<HTMLElement>("[data-slot=field-label]")
    expect(label?.style.fontWeight).toBe("var(--sys-font-weight-semibold)")
    expect(control).toHaveStyle({ backgroundColor: "#003BB2" })
    expect(control.style.borderRadius).toBe("var(--sys-radius-sm)")
    expect(control.style.fontWeight).toBe("")
    expect(root).not.toHaveAttribute("style")
    expect(root.querySelector("[data-slot=field-description]")).not.toHaveAttribute("style")
    expect(root.querySelector("[data-slot=switch-thumb]")).not.toHaveAttribute("style")
  })

  it("an invalid setting value falls back to that setting's default", () => {
    renderSwitch({ label: 42, helpText: 7, defaultValue: "on" })

    // The default label, no help text, off.
    const control = screen.getByRole("switch", { name: "Switch" })
    expect(control).not.toBeChecked()
    expect(control).not.toHaveAttribute("aria-describedby")
  })
})

describe("switch: read-only render", () => {
  it("shows Yes for a switch that is on, as text with no control", async () => {
    const { user, setMode } = renderSwitch({ label: "Subscribe to updates" })
    await user.click(screen.getByRole("switch"))

    setMode("read-only")

    expect(screen.queryByRole("switch")).toBeNull()
    expect(fieldRoot("subscribe")).toHaveTextContent("Subscribe to updates")
    expect(fieldValue("subscribe")).toHaveTextContent("Yes")
  })

  it("shows No for a switch that is off, never the empty marker", () => {
    renderForm([instance("switch", "subscribe", { label: "Subscribe to updates" })], definitions, {
      mode: "read-only",
    })

    expect(fieldValue("subscribe")).toHaveTextContent("No")
    expect(fieldValue("subscribe")).not.toHaveAttribute("data-empty")
  })
})

describe("switch: values", () => {
  it("submits false, never null, when it is left off", () => {
    const { submit, submitted } = renderSwitch()

    submit()

    expect(submitted()).toEqual({ subscribe: false })
  })

  it("submits true when on and false again when off", async () => {
    const { user, submit, submitted } = renderSwitch()
    const control = screen.getByRole("switch")

    await user.click(control)
    submit()
    expect(submitted()).toEqual({ subscribe: true })

    await user.click(control)
    submit()
    expect(submitted()).toEqual({ subscribe: false })
  })

  it("submits its default value when it is not touched", () => {
    const { submit, submitted } = renderSwitch({ defaultValue: true })

    submit()

    expect(submitted()).toEqual({ subscribe: true })
  })
})

describe("switch: validation", () => {
  it("has no rules: leaving it or submitting it, on or off, is never an error", async () => {
    const { user, submit, onSubmit } = renderSwitch()

    await user.tab()
    await user.tab()
    submit()

    expect(fieldError("subscribe")).toBeNull()
    expect(screen.getByRole("switch")).not.toHaveAttribute("aria-invalid")
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe("switch: keyboard", () => {
  it("is reached with Tab and toggled with Space", async () => {
    const { user, submit, submitted } = renderSwitch({ label: "Subscribe to updates" })

    await user.tab()
    const control = screen.getByRole("switch", { name: "Subscribe to updates" })
    expect(control).toHaveFocus()

    await user.keyboard(" ")
    expect(control).toBeChecked()
    expect(control).toHaveFocus()
    submit()
    expect(submitted()).toEqual({ subscribe: true })

    await user.keyboard(" ")
    expect(control).not.toBeChecked()
    submit()
    expect(submitted()).toEqual({ subscribe: false })
  })
})
