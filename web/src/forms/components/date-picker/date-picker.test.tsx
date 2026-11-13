import { screen, waitFor, within } from "@testing-library/react"
import { RotateCcwIcon } from "lucide-react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { defineStatic, type StaticProps } from "../../runtime"
import { fieldError, fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { textField } from "../text-field"
import { datePicker } from "."

const resetSettings = {}

/** What a Reset button does, without depending on the Button component. */
function ResetProbe({ slots, form }: StaticProps<typeof resetSettings, "root">) {
  return (
    <button type="button" onClick={form.reset} {...slots.root}>
      Reset
    </button>
  )
}

const resetProbe = defineStatic({
  type: "reset-probe",
  displayName: "Reset probe",
  description: "Resets the form.",
  category: "action",
  icon: RotateCcwIcon,
  settings: resetSettings,
  slots: ["root"],
  Edit: ResetProbe,
  ReadOnly: () => null,
})

const definitions = [datePicker, textField, resetProbe]

/** A date picker named `born`, followed by a text field to move focus to. */
function renderDatePicker(settings: Record<string, unknown> = {}, extras = {}) {
  return renderForm(
    [
      instance("date-picker", "born", { label: "Born", ...settings }, extras),
      instance("text-field", "other", { label: "Other" }),
      instance("reset-probe", "reset", {}, { bind: null }),
    ],
    definitions,
  )
}

const input = () => screen.getByRole("textbox", { name: "Born" })
const calendarButton = () => screen.getByRole("button", { name: "Choose date" })
const popup = () => screen.getByTestId("field-born-popup")
const queryPopup = () => screen.queryByTestId("field-born-popup")
const day = (iso: string) => {
  const button = popup().querySelector(`button[data-day="${iso}"]`)
  if (!(button instanceof HTMLButtonElement)) throw new Error(`No day ${iso} in the calendar`)
  return button
}
const closed = () => waitFor(() => expect(queryPopup()).toBeNull())

type User = ReturnType<typeof renderDatePicker>["user"]

async function openCalendar(user: User) {
  await user.click(calendarButton())
  return screen.findByTestId("field-born-popup")
}

afterEach(() => vi.unstubAllEnvs())

describe("date picker: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(datePicker.type).toBe("date-picker")
    expect(datePicker.displayName).toBe("Date picker")
    expect(datePicker.description).not.toBe("")
    expect(datePicker.kind).toBe("input")
    expect(datePicker.valueType).toBe("date")
    expect(datePicker.slots).toEqual([
      "root",
      "label",
      "control",
      "trigger",
      "popup",
      "description",
      "error",
    ])
    expect(Object.keys(datePicker.settings)).toEqual([
      "label",
      "helpText",
      "placeholder",
      "defaultValue",
      "required",
      "minDate",
      "maxDate",
      "messages",
    ])
    expect(datePicker.rules.map((rule) => rule.id)).toEqual(["required", "minDate", "maxDate"])
  })
})

describe("date picker: default render", () => {
  it("renders a labelled, empty text input with an example of the typed form, and a calendar button", () => {
    renderForm([instance("date-picker", "born")], definitions)

    const text = screen.getByRole("textbox", { name: "Date picker" })
    expect(text).toHaveValue("")
    expect(text).toHaveAttribute("placeholder", "e.g. 14 March 1990")
    expect(text).not.toHaveAttribute("aria-required")
    expect(text).not.toHaveAttribute("aria-invalid")
    expect(fieldRoot("born")).toContainElement(text)
    expect(fieldRoot("born")).toContainElement(calendarButton())
    expect(calendarButton()).toHaveAttribute("type", "button")
    expect(queryPopup()).toBeNull()
    expect(fieldError("born")).toBeNull()
  })

  it("shows the label, placeholder, help text and default value it is given", () => {
    renderDatePicker({
      placeholder: "Day Month Year",
      helpText: "As on your passport.",
      defaultValue: "1990-03-14",
    })

    expect(input()).toHaveValue("14 March 1990")
    expect(input()).toHaveAttribute("placeholder", "Day Month Year")
    expect(input()).toHaveAccessibleDescription("As on your passport.")
  })

  it("marks a required field for the eye and for assistive technology", () => {
    renderDatePicker({ required: true })

    expect(input()).toHaveAttribute("aria-required", "true")
    expect(fieldRoot("born").querySelector("[data-slot=field-required]")).toHaveTextContent("*")
  })

  it("applies style overrides to the slot they name and to no other", async () => {
    const { user } = renderDatePicker(
      {},
      {
        styles: {
          control: { color: "#003BB2" },
          trigger: { radius: "full" },
          popup: { background: { token: "muted" } },
        },
      },
    )

    expect(input()).toHaveStyle({ color: "#003BB2" })
    expect(input().style.borderRadius).toBe("")
    expect(calendarButton().style.borderRadius).toBe("var(--sys-radius-full)")
    expect(calendarButton().style.color).toBe("")

    const calendar = await openCalendar(user)
    expect(calendar.style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(calendar.style.color).toBe("")
    expect(fieldRoot("born")).not.toHaveAttribute("style")
  })
})

describe("date picker: read-only render", () => {
  it("shows the date as text a person reads, with no control", async () => {
    const { user, setMode } = renderDatePicker()
    await user.type(input(), "1990-03-14")

    setMode("read-only")

    expect(screen.queryByRole("textbox", { name: "Born" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Choose date" })).toBeNull()
    expect(fieldRoot("born")).toHaveTextContent("Born")
    expect(fieldValue("born")).toHaveTextContent("14 March 1990")
  })

  it("shows a clear marker when there is no value", () => {
    renderForm([instance("date-picker", "born", { label: "Born" })], definitions, {
      mode: "read-only",
    })

    expect(fieldValue("born")).toHaveTextContent("No value")
  })
})

describe("date picker: typing a date", () => {
  it.each([
    ["1990-03-14", "1990-03-14"],
    ["14 March 1990", "1990-03-14"],
    ["14 mar 1990", "1990-03-14"],
    ["4 Sept 2001", "2001-09-04"],
  ])("%j is submitted as %s", async (typed, expected) => {
    const { user, submit, submitted } = renderDatePicker()

    await user.type(input(), typed)
    submit()

    expect(submitted()).toMatchObject({ born: expected })
  })

  it("shows the date in its standard form once typing is over", async () => {
    const { user } = renderDatePicker()

    await user.type(input(), "14 mar 1990")
    expect(input()).toHaveValue("14 mar 1990")

    await user.tab()
    expect(input()).toHaveValue("14 March 1990")
  })

  it("submits null when nothing is entered or the text is cleared", async () => {
    const { user, submit, submitted } = renderDatePicker()
    submit()
    expect(submitted()).toMatchObject({ born: null })

    await user.type(input(), "1990-03-14")
    await user.clear(input())
    submit()

    expect(submitted()).toMatchObject({ born: null })
  })

  it.each(["tomorrow", "31 June 2020", "14/03/1990"])(
    "text that is not a date (%j) is an error, not a silent blank",
    async (typed) => {
      const { user, submit, onSubmit } = renderDatePicker()

      await user.type(input(), typed)
      expect(fieldError("born")).toBeNull()

      await user.click(screen.getByRole("textbox", { name: "Other" }))
      await waitFor(() =>
        expect(fieldError("born")).toHaveTextContent("Enter a date like 14 March 1990"),
      )
      // What was typed stays, so it can be seen and fixed.
      expect(input()).toHaveValue(typed)
      expect(input()).toHaveAttribute("aria-invalid", "true")

      submit()
      expect(onSubmit).not.toHaveBeenCalled()

      await user.clear(input())
      await user.type(input(), "14 March 1990")
      expect(fieldError("born")).toBeNull()
      submit()
      expect(onSubmit).toHaveBeenCalledTimes(1)
    },
  )

  it("reset drops text that was typed, readable or not", async () => {
    const { user } = renderDatePicker({ defaultValue: "2000-01-01" })
    await user.clear(input())
    await user.type(input(), "not a date")
    await user.tab()
    await user.tab()
    await waitFor(() => expect(fieldError("born")).not.toBeNull())

    await user.click(screen.getByRole("button", { name: "Reset" }))

    expect(input()).toHaveValue("1 January 2000")
    expect(fieldError("born")).toBeNull()
  })
})

describe("date picker: picking a date", () => {
  it("opens on the month of the value, and picking a day sets it and closes the calendar", async () => {
    const { user, submit, submitted } = renderDatePicker({ defaultValue: "1990-03-14" })

    await openCalendar(user)
    expect(day("1990-03-14")).toHaveAttribute("data-selected-single", "true")

    await user.click(day("1990-03-20"))
    await closed()

    expect(input()).toHaveValue("20 March 1990")
    await waitFor(() => expect(calendarButton()).toHaveFocus())
    submit()
    expect(submitted()).toMatchObject({ born: "1990-03-20" })
  })

  it("the month and year are chosen from dropdowns", async () => {
    const { user, submit, submitted } = renderDatePicker({ defaultValue: "1990-03-14" })
    await openCalendar(user)
    const [month, year] = within(popup()).getAllByRole("combobox")

    await user.selectOptions(year, "1975")
    await user.selectOptions(month, "11")
    await user.click(day("1975-12-25"))
    await closed()

    submit()
    expect(submitted()).toMatchObject({ born: "1975-12-25" })
  })

  it.each(["Etc/GMT+8", "Etc/GMT-12", "UTC"])(
    "the day picked is the day submitted in %s",
    async (timeZone) => {
      vi.stubEnv("TZ", timeZone)
      const { user, submit, submitted } = renderDatePicker({ defaultValue: "1999-12-30" })

      for (const iso of ["1999-12-31", "1999-12-01"]) {
        await openCalendar(user)
        await user.click(day(iso))
        await closed()
        submit()
        expect(submitted(), `${iso} in ${timeZone}`).toMatchObject({ born: iso })
      }
    },
  )

  it("days outside the allowed range cannot be picked", async () => {
    const { user } = renderDatePicker({
      defaultValue: "2026-06-15",
      minDate: "2026-06-10",
      maxDate: "2026-06-20",
    })
    await openCalendar(user)

    expect(day("2026-06-09")).toBeDisabled()
    expect(day("2026-06-10")).toBeEnabled()
    expect(day("2026-06-20")).toBeEnabled()
    expect(day("2026-06-21")).toBeDisabled()
  })

  it("picking a day replaces text that could not be read, and clears its error", async () => {
    const { user } = renderDatePicker({ defaultValue: "1990-03-14" })
    await user.clear(input())
    await user.type(input(), "sometime")
    await user.click(screen.getByRole("textbox", { name: "Other" }))
    await waitFor(() => expect(fieldError("born")).not.toBeNull())

    await openCalendar(user)
    const today = popup().querySelector("button[data-day]:not([disabled])")
    if (!(today instanceof HTMLButtonElement)) throw new Error("The calendar shows no days")
    await user.click(today)
    await closed()

    expect(fieldError("born")).toBeNull()
    expect(input()).not.toHaveValue("sometime")
    expect(input()).not.toHaveValue("")
  })
})

describe("date picker: validation rules", () => {
  it("required: leaving it empty is an error; a date clears it", async () => {
    const { user, submit, onSubmit } = renderDatePicker({ required: true })

    await user.click(input())
    await user.click(screen.getByRole("textbox", { name: "Other" }))
    await waitFor(() => expect(fieldError("born")).toHaveTextContent("This field is required"))
    expect(input()).toHaveAccessibleDescription("This field is required")

    await user.type(input(), "1990-03-14")
    expect(fieldError("born")).toBeNull()

    submit()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it("earliest date", async () => {
    const { user } = renderDatePicker({ minDate: "1900-01-01" })

    await user.type(input(), "1899-12-31")
    await user.click(screen.getByRole("textbox", { name: "Other" }))
    await waitFor(() =>
      expect(fieldError("born")).toHaveTextContent("Enter a date on or after 1 January 1900"),
    )

    await user.clear(input())
    await user.type(input(), "1900-01-01")
    expect(fieldError("born")).toBeNull()
  })

  it("latest date", async () => {
    const { user } = renderDatePicker({ maxDate: "2026-12-31" })

    await user.type(input(), "1 January 2027")
    await user.click(screen.getByRole("textbox", { name: "Other" }))
    await waitFor(() =>
      expect(fieldError("born")).toHaveTextContent("Enter a date on or before 31 December 2026"),
    )

    await user.clear(input())
    await user.type(input(), "31 December 2026")
    expect(fieldError("born")).toBeNull()
  })

  it("uses the instance's own message for a rule when it sets one", async () => {
    const { submit } = renderDatePicker({
      required: true,
      messages: { required: "Enter your date of birth" },
    })

    submit()

    expect(fieldError("born")).toHaveTextContent("Enter your date of birth")
    expect(input()).toHaveFocus()
  })

  it("moving between the input and the calendar button is not leaving the field", async () => {
    const { user } = renderDatePicker({ required: true })

    await user.tab()
    expect(input()).toHaveFocus()
    await user.tab()
    expect(calendarButton()).toHaveFocus()
    await user.tab({ shift: true })
    expect(input()).toHaveFocus()
    expect(fieldError("born")).toBeNull()

    await user.tab()
    await user.tab()
    expect(screen.getByRole("textbox", { name: "Other" })).toHaveFocus()
    expect(fieldError("born")).toHaveTextContent("This field is required")
  })

  it("no error appears while the calendar is open, or when Escape closes it", async () => {
    const { user } = renderDatePicker({ required: true })

    await user.tab()
    await user.tab()
    await user.keyboard("{Enter}")
    await screen.findByTestId("field-born-popup")
    expect(fieldError("born")).toBeNull()

    await user.keyboard("{Escape}")
    await closed()
    await waitFor(() => expect(calendarButton()).toHaveFocus())
    expect(fieldError("born")).toBeNull()
  })
})

describe("date picker: keyboard", () => {
  it("a date is typed, then the form is submitted with Enter", async () => {
    const { user, onSubmit } = renderForm([instance("date-picker", "born")], definitions)

    await user.tab()
    await user.keyboard("14 March 1990{Enter}")

    expect(onSubmit).toHaveBeenCalledWith({ born: "1990-03-14" })
  })

  it("the calendar opens from the button, the arrows move between days, and Enter picks", async () => {
    const { user, submit, submitted } = renderDatePicker({ defaultValue: "1990-03-14" })

    await user.tab()
    await user.tab()
    expect(calendarButton()).toHaveFocus()
    await user.keyboard(" ")
    await screen.findByTestId("field-born-popup")
    await waitFor(() => expect(day("1990-03-14")).toHaveFocus())

    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(day("1990-03-15")).toHaveFocus())
    await user.keyboard("{ArrowDown}")
    await waitFor(() => expect(day("1990-03-22")).toHaveFocus())
    await user.keyboard("{Enter}")
    await closed()

    expect(input()).toHaveValue("22 March 1990")
    await waitFor(() => expect(calendarButton()).toHaveFocus())
    submit()
    expect(submitted()).toMatchObject({ born: "1990-03-22" })
  })
})
