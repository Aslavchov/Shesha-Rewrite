import { screen } from "@testing-library/react"
import { HashIcon } from "lucide-react"
import { describe, expect, it } from "vitest"

import { defineStatic, type FormActions } from "../../runtime"
import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { numberField } from "."
import { formatNumber, parseNumber } from "./number-text"

const definitions = [numberField]

function renderNumberField(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm([instance("number-field", "amount", settings, extras)], definitions)
}

describe("number field: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(numberField.type).toBe("number-field")
    expect(numberField.displayName).toBe("Number field")
    expect(numberField.description).not.toBe("")
    expect(numberField.category).toBe("input")
    expect(numberField.kind).toBe("input")
    expect(numberField.valueType).toBe("number")
    expect(numberField.slots).toEqual(["root", "label", "control", "description", "error"])
    expect(Object.keys(numberField.settings)).toEqual([
      "label",
      "helpText",
      "placeholder",
      "defaultValue",
      "required",
      "min",
      "max",
      "wholeNumber",
      "messages",
    ])
    expect(numberField.rules.map((rule) => rule.id)).toEqual([
      "required",
      "wholeNumber",
      "min",
      "max",
    ])
    for (const setting of Object.values(numberField.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })
})

describe("number field: reading and writing numbers as text", () => {
  it.each([
    ["12", 12],
    ["-3", -3],
    ["+7", 7],
    ["1.5", 1.5],
    [".5", 0.5],
    ["-.25", -0.25],
    ["3.", 3],
    ["007", 7],
    ["0", 0],
    ["-0", 0],
    [" 42 ", 42],
    ["0.1", 0.1],
  ])("reads %j as %d", (text, value) => {
    expect(parseNumber(text)).toBe(value)
  })

  it.each([
    "",
    " ",
    "abc",
    "1,5",
    "1,000",
    "1 000",
    "1e3",
    "1E3",
    "Infinity",
    "-Infinity",
    "NaN",
    "0x10",
    "1.2.3",
    "--1",
    "1-",
    "-",
    "+",
    ".",
    "-.",
    "12px",
    "£5",
    "1_000",
    "٣",
    "9".repeat(400),
  ])("cannot read %j", (text) => {
    expect(parseNumber(text)).toBeNull()
  })

  it.each([
    [0, "0"],
    [12, "12"],
    [-3, "-3"],
    [1.5, "1.5"],
    [0.1, "0.1"],
    [1e21, "1000000000000000000000"],
    [-1.5e21, "-1500000000000000000000"],
    [1e-7, "0.0000001"],
    [-2.5e-7, "-0.00000025"],
  ])("writes %d as %j", (value, text) => {
    expect(formatNumber(value)).toBe(text)
  })

  it.each([0, 1, -1, 0.5, 123456.789, 1e21, 1.7976931348623157e308, 1e-7, 5e-324, -6.02e23])(
    "reads back what it writes for %d",
    (value) => {
      expect(parseNumber(formatNumber(value))).toBe(value)
    },
  )
})

describe("number field: default render", () => {
  it("renders a labelled, empty text input with no help text, error or required marker", () => {
    renderNumberField()

    const input = screen.getByRole("textbox", { name: "Number field" })
    expect(input).toHaveValue("")
    // Never the browser's number input: it hides text it cannot read.
    expect(input).toHaveAttribute("type", "text")
    expect(input).toHaveAttribute("inputmode", "decimal")
    expect(input).not.toHaveAttribute("placeholder")
    expect(input).not.toHaveAttribute("aria-required")
    expect(input).not.toHaveAttribute("aria-invalid")
    expect(input).not.toHaveAttribute("aria-describedby")
    expect(fieldRoot("amount")).toContainElement(input)
    expect(fieldError("amount")).toBeNull()
    expect(fieldRoot("amount").querySelector("[data-slot=field-description]")).toBeNull()
    expect(fieldRoot("amount").querySelector("[data-slot=field-required]")).toBeNull()
  })

  it("shows the label, placeholder, help text and default value it is given", () => {
    renderNumberField({
      label: "Amount",
      placeholder: "0.00",
      helpText: "In rand.",
      defaultValue: 12.5,
    })

    const input = screen.getByRole("textbox", { name: "Amount" })
    expect(input).toHaveValue("12.5")
    expect(input).toHaveAttribute("placeholder", "0.00")
    expect(input).toHaveAccessibleDescription("In rand.")
  })

  it("asks for a digits-only keypad when only whole numbers are allowed", () => {
    renderNumberField({ wholeNumber: true })

    expect(screen.getByRole("textbox")).toHaveAttribute("inputmode", "numeric")
  })

  it("marks a required field for the eye and for assistive technology", () => {
    renderNumberField({ label: "Amount", required: true })

    const input = screen.getByRole("textbox", { name: "Amount" })
    expect(input).toHaveAttribute("aria-required", "true")
    const marker = fieldRoot("amount").querySelector("[data-slot=field-required]")
    expect(marker).toHaveTextContent("*")
    // The star is decoration: the accessible name stays "Amount".
    expect(marker).toHaveAttribute("aria-hidden", "true")
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderNumberField(
      { label: "Amount", helpText: "Help" },
      {
        styles: {
          label: { color: "#003BB2" },
          control: { background: { token: "muted" }, radius: "full" },
          description: { fontWeight: "medium" },
        },
      },
    )

    const root = fieldRoot("amount")
    const label = root.querySelector("[data-slot=field-label]")
    const description = root.querySelector<HTMLElement>("[data-slot=field-description]")
    const input = screen.getByRole("textbox")
    expect(input).toHaveAttribute("data-slot", "input")
    expect(label).toHaveStyle({ color: "#003BB2" })
    expect(input.style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(input.style.borderRadius).toBe("var(--sys-radius-full)")
    expect(input.style.color).toBe("")
    expect(description?.style.fontWeight).not.toBe("")
    expect(description?.style.color).toBe("")
    expect(root).not.toHaveAttribute("style")
  })

  it("styles the error and the root when they are overridden", async () => {
    const { user } = renderNumberField(
      { required: true },
      { styles: { root: { padding: "md" }, error: { fontWeight: "semibold" } } },
    )

    await user.click(screen.getByRole("textbox"))
    await user.tab()

    expect(fieldRoot("amount").style.padding).not.toBe("")
    expect(fieldError("amount")?.style.fontWeight).not.toBe("")
    expect(screen.getByRole("textbox")).not.toHaveAttribute("style")
  })
})

describe("number field: read-only render", () => {
  it("shows the value as text, with no control", async () => {
    const { user, setMode } = renderNumberField({ label: "Amount" })
    await user.type(screen.getByRole("textbox"), "-1250.75")

    setMode("read-only")

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(fieldRoot("amount")).toHaveTextContent("Amount")
    expect(fieldValue("amount")).toHaveTextContent("-1250.75")
  })

  it("shows zero as a value, not as empty", () => {
    renderForm([instance("number-field", "amount", { defaultValue: 0 })], definitions, {
      mode: "read-only",
    })

    expect(fieldValue("amount").textContent).toBe("0")
  })

  it("shows a clear marker when there is no value", () => {
    renderForm([instance("number-field", "amount", { label: "Amount" })], definitions, {
      mode: "read-only",
    })

    expect(fieldValue("amount")).toHaveTextContent("—")
    expect(fieldValue("amount")).toHaveTextContent("No value")
  })
})

describe("number field: values", () => {
  it("submits a number, never text", async () => {
    const { user, submit, submitted } = renderNumberField()

    await user.type(screen.getByRole("textbox"), "1.5")
    submit()

    expect(submitted()).toEqual({ amount: 1.5 })
    expect(submitted()?.amount).toBeTypeOf("number")
  })

  it.each([
    ["12", 12],
    ["-3", -3],
    [".5", 0.5],
    ["3.", 3],
    ["0", 0],
    ["-0", 0],
  ])("submits %j as %d", async (text, value) => {
    const { user, submit, submitted } = renderNumberField()

    await user.type(screen.getByRole("textbox"), text)
    submit()

    expect(submitted()).toEqual({ amount: value })
  })

  it("submits the default value as a number", () => {
    const { submit, submitted } = renderNumberField({ defaultValue: 3 })

    submit()

    expect(submitted()).toEqual({ amount: 3 })
  })

  it("submits null when nothing is entered, the text is cleared or only spaces are typed", async () => {
    const { user, submit, submitted } = renderNumberField()
    const input = screen.getByRole("textbox")
    submit()
    expect(submitted()).toEqual({ amount: null })

    await user.type(input, "7")
    await user.clear(input)
    submit()
    expect(submitted()).toEqual({ amount: null })

    await user.type(input, "  ")
    submit()
    expect(submitted()).toEqual({ amount: null })
  })

  it("keeps the text exactly as typed while editing, and tidies it on leaving", async () => {
    const { user } = renderNumberField()
    const input = screen.getByRole("textbox")

    await user.type(input, "007.50")
    expect(input).toHaveValue("007.50")

    await user.tab()
    expect(input).toHaveValue("7.5")
  })
})

describe("number field: text that is not a number", () => {
  it("is kept, reported after leaving, blocks submit, and is fixed by typing a number", async () => {
    const { user, submit, onSubmit, submitted } = renderNumberField({ label: "Amount" })
    const input = screen.getByRole("textbox")

    await user.type(input, "abc")
    expect(fieldError("amount")).toBeNull()

    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a number")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("Enter a number")
    // Still there to be seen and corrected.
    expect(input).toHaveValue("abc")

    submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(input).toHaveFocus()

    await user.clear(input)
    await user.type(input, "42")
    expect(fieldError("amount")).toBeNull()

    submit()
    expect(submitted()).toEqual({ amount: 42 })
  })

  it.each(["1,5", "1e3", "Infinity", "1.2.3", "-"])("%j is not a number", async (text) => {
    const { user, submit, onSubmit } = renderNumberField()

    await user.type(screen.getByRole("textbox"), text)
    submit()

    expect(fieldError("amount")).toHaveTextContent("Enter a number")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("is reported even on a required field, in place of the required message", async () => {
    const { user } = renderNumberField({ required: true })

    await user.type(screen.getByRole("textbox"), "abc")
    await user.tab()

    expect(fieldError("amount")).toHaveTextContent("Enter a number")
  })

  it("replaces an earlier value rather than leaving it to be submitted", async () => {
    const { user, submit, onSubmit } = renderNumberField()
    const input = screen.getByRole("textbox")

    await user.type(input, "12")
    await user.type(input, "x")
    submit()

    expect(input).toHaveValue("12x")
    expect(fieldError("amount")).toHaveTextContent("Enter a number")
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("is dropped by a reset, along with its error", async () => {
    function ResetButton({ form }: { form: FormActions }) {
      return (
        <button type="button" onClick={form.reset}>
          Reset
        </button>
      )
    }
    const resetButton = defineStatic({
      type: "test-reset",
      displayName: "Reset",
      description: "Resets the form.",
      category: "action",
      icon: HashIcon,
      settings: {},
      slots: ["root"],
      Edit: ResetButton,
      ReadOnly: ResetButton,
    })
    const { user, submit, submitted } = renderForm(
      [
        instance("number-field", "amount", { defaultValue: 5 }),
        instance("test-reset", "reset", {}, { bind: null }),
      ],
      [numberField, resetButton],
    )
    const input = screen.getByRole("textbox")

    await user.clear(input)
    await user.type(input, "abc")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a number")

    await user.click(screen.getByRole("button", { name: "Reset" }))

    expect(input).toHaveValue("5")
    expect(fieldError("amount")).toBeNull()
    submit()
    expect(submitted()).toEqual({ amount: 5 })
  })
})

describe("number field: validation rules", () => {
  it("required: no number is an error; any number, zero included, clears it", async () => {
    const { user, submit, onSubmit } = renderNumberField({ label: "Amount", required: true })
    const input = screen.getByRole("textbox")

    await user.click(input)
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("This field is required")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("This field is required")

    await user.type(input, "  ")
    expect(fieldError("amount")).toHaveTextContent("This field is required")

    await user.type(input, "0")
    expect(fieldError("amount")).toBeNull()
    expect(input).not.toHaveAttribute("aria-invalid")

    submit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("whole number", async () => {
    const { user } = renderNumberField({ wholeNumber: true })
    const input = screen.getByRole("textbox")

    await user.type(input, "1.5")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a whole number")

    await user.clear(input)
    expect(fieldError("amount")).toBeNull()
    await user.type(input, "2")
    expect(fieldError("amount")).toBeNull()
  })

  it("whole number: a decimal part of zero is still a whole number", async () => {
    const { user, submit, submitted } = renderNumberField({ wholeNumber: true })

    await user.type(screen.getByRole("textbox"), "2.0")
    await user.tab()
    submit()

    expect(fieldError("amount")).toBeNull()
    expect(submitted()).toEqual({ amount: 2 })
  })

  it("minimum", async () => {
    const { user } = renderNumberField({ min: 0 })
    const input = screen.getByRole("textbox")

    await user.type(input, "-1")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a number that is 0 or more")

    await user.clear(input)
    await user.type(input, "0")
    expect(fieldError("amount")).toBeNull()
  })

  it("maximum", async () => {
    const { user } = renderNumberField({ max: 20 })
    const input = screen.getByRole("textbox")

    await user.type(input, "25")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a number that is 20 or less")

    await user.type(input, "{Backspace}")
    expect(fieldError("amount")).toBeNull()
  })

  it("the limits themselves are allowed, and decimals are compared exactly", async () => {
    const { user } = renderNumberField({ min: 0.5, max: 20 })
    const input = screen.getByRole("textbox")

    await user.type(input, "20")
    await user.tab()
    expect(fieldError("amount")).toBeNull()

    await user.type(input, ".5")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a number that is 20 or less")

    await user.clear(input)
    await user.type(input, "0.5")
    await user.tab()
    expect(fieldError("amount")).toBeNull()

    await user.clear(input)
    await user.type(input, "0.49")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a number that is 0.5 or more")
  })

  it("checks whole number before the limits, and the minimum before the maximum", async () => {
    const { user } = renderNumberField({ wholeNumber: true, min: 0, max: 20 })
    const input = screen.getByRole("textbox")

    await user.type(input, "25.5")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a whole number")

    await user.type(input, "{Backspace}{Backspace}")
    expect(fieldError("amount")).toHaveTextContent("Enter a number that is 20 or less")

    await user.clear(input)
    await user.type(input, "-1")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter a number that is 0 or more")

    await user.clear(input)
    await user.type(input, "20")
    expect(fieldError("amount")).toBeNull()
  })

  it("an empty optional field passes the whole number and limit rules", async () => {
    const { user, submit, onSubmit } = renderNumberField({ wholeNumber: true, min: 1, max: 5 })

    await user.click(screen.getByRole("textbox"))
    await user.tab()
    submit()

    expect(fieldError("amount")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("uses the instance's own message for a rule when it sets one", async () => {
    const { user } = renderNumberField({
      required: true,
      wholeNumber: true,
      min: 1,
      max: 10,
      messages: {
        required: "Enter how many",
        wholeNumber: "No fractions",
        min: "At least one",
        max: "Ten at most",
      },
    })
    const input = screen.getByRole("textbox")

    await user.click(input)
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Enter how many")

    await user.type(input, "1.5")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("No fractions")

    await user.clear(input)
    await user.type(input, "0")
    expect(fieldError("amount")).toHaveTextContent("At least one")

    await user.clear(input)
    await user.type(input, "11")
    await user.tab()
    expect(fieldError("amount")).toHaveTextContent("Ten at most")
  })

  it("shows no error while a person is first typing, only after they leave", async () => {
    const { user } = renderNumberField({ max: 5 })
    const input = screen.getByRole("textbox")

    await user.type(input, "25")
    expect(fieldError("amount")).toBeNull()

    await user.tab()
    expect(fieldError("amount")).not.toBeNull()
  })

  it("an invalid setting value falls back to that setting's default", async () => {
    const { user, submit, submitted } = renderNumberField({
      label: 42,
      defaultValue: "7",
      required: "yes",
      min: "0",
      max: null,
      wholeNumber: 1,
    })

    // The default label, no default value, not required, no limits, decimals allowed.
    const input = screen.getByRole("textbox", { name: "Number field" })
    expect(input).toHaveValue("")
    expect(input).not.toHaveAttribute("aria-required")
    expect(input).toHaveAttribute("inputmode", "decimal")
    await user.type(input, "-99.5")
    await user.tab()
    submit()

    expect(fieldError("amount")).toBeNull()
    expect(submitted()).toEqual({ amount: -99.5 })
  })
})

describe("number field: keyboard", () => {
  it("is reached with Tab, typed into, and submits the form with Enter", async () => {
    const { user, submitted } = renderNumberField({ label: "Amount" })

    await user.tab()
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus()
    await user.keyboard("1.5{Enter}")

    expect(submitted()).toEqual({ amount: 1.5 })
  })

  it("keeps focus on the field when Enter finds it invalid", async () => {
    const { user, onSubmit } = renderNumberField({ label: "Amount", max: 10 })

    await user.tab()
    await user.keyboard("11{Enter}")

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveFocus()
    expect(fieldError("amount")).toHaveTextContent("Enter a number that is 10 or less")
  })

  it("does not change its value when an arrow key is pressed", async () => {
    const { user, submit, submitted } = renderNumberField({ label: "Amount" })

    await user.tab()
    await user.keyboard("5{ArrowUp}{ArrowDown}{ArrowDown}")
    submit()

    expect(submitted()).toEqual({ amount: 5 })
  })
})
