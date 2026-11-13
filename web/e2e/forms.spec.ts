import type { Page } from "@playwright/test"

import {
  controls,
  dayButton,
  demoForm,
  fillValid,
  INPUTS,
  INSTANCES,
  openDemoForm,
  pickDate,
  REQUIRED,
  submitted,
  VALID_SUBMISSION,
} from "./support/demo-form.ts"
import { DEMO_FORM, expect, test } from "./support/fixtures.ts"

// Every check in this file requires a clean console (spec section 13).
test.afterEach(({ consoleProblems }) => {
  expect(consoleProblems).toEqual([])
})

const colourOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((element) => getComputedStyle(element).color)

test.describe("C1-1 Forms list", () => {
  test("Person details is listed with its description, and opens", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("nav-forms").click()

    await expect(page).toHaveURL("/forms")
    const list = page.getByTestId("forms-list")
    await expect(list).toBeVisible()
    const item = list.getByTestId("forms-item").filter({ hasText: DEMO_FORM.name })
    await expect(item).toHaveCount(1)
    await expect(item).toContainText(DEMO_FORM.description)
    await expect(item.getByTestId("forms-item-updated")).toHaveText(
      /^Updated \d{1,2} \w{3} \d{4}, \d{2}:\d{2}$/,
    )
    await expect(page.getByTestId("forms-empty")).toHaveCount(0)

    await item.click()

    await expect(page).toHaveURL(DEMO_FORM.path)
    await expect(page.getByTestId("page-title")).toHaveText(DEMO_FORM.name)
    await expect(page.locator("h1")).toHaveCount(1)
    await expect(page).toHaveTitle(new RegExp(`^${DEMO_FORM.name} · `))
    await expect(page.getByTestId("nav-forms")).toHaveAttribute("aria-current", "page")
    await expect(page.getByTestId("form")).toBeVisible()
    await page.waitForLoadState("networkidle")
  })

  test("the form page loads directly from its own URL, and links back to Forms", async ({
    page,
  }) => {
    const response = await page.goto(DEMO_FORM.path)

    expect(response?.status()).toBe(200)
    await expect(page.getByTestId("form")).toBeVisible()

    await page.getByTestId("form-back-link").click()

    await expect(page).toHaveURL("/forms")
    await expect(page.getByTestId("forms-list")).toBeVisible()
  })
})

test.describe("C1-2 All components render", () => {
  test("every instance is visible with its label, and required fields are marked", async ({
    page,
  }) => {
    const form = await openDemoForm(page)

    for (const name of INSTANCES) {
      await expect(form.root(name), name).toBeVisible()
    }
    const control = controls(form)
    for (const input of INPUTS) {
      await expect(form.root(input.name), input.name).toContainText(input.label)
      // The label names the control for assistive technology too.
      await expect(control[input.name], input.name).toHaveAccessibleName(input.label)

      const star = form.root(input.name).locator("[data-slot=field-required]")
      if (input.required) {
        await expect(control[input.name], input.name).toHaveAttribute("aria-required", "true")
        await expect(star, input.name).toBeVisible()
      } else {
        await expect(control[input.name], input.name).not.toHaveAttribute("aria-required")
        await expect(star, input.name).toHaveCount(0)
      }
    }
    await expect(form.root("preferences")).toContainText("Preferences")
    await expect(form.submit).toHaveText("Submit")
    await expect(form.reset).toHaveText("Reset")
    await expect(form.root("dependants")).toContainText(
      "Children and other people who rely on you financially.",
    )
    await expect(form.email).toHaveAttribute("placeholder", "name@example.com")
    // Defaults: Subscribe is on, everything else is empty or off.
    await expect(form.subscribe).toBeChecked()
    await expect(form.acceptTerms).not.toBeChecked()
  })

  test("the layout follows section 10, top to bottom", async ({ page }) => {
    const form = await openDemoForm(page)

    const order = await form.form
      .locator("[data-testid^=field-]")
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("data-testid") ?? "")
          .filter((id) => /^field-[^-]+$/.test(id)),
      )
    expect(order).toEqual(INSTANCES.map((name) => `field-${name}`))

    // The same order on screen: each instance starts at or below the one before.
    const box = async (name: string) => (await form.root(name).boundingBox())!
    const rows = [
      "nameRow",
      "email",
      "detailsRow",
      "preferredContact",
      "notes",
      "preferences",
      "actions",
    ]
    for (let index = 1; index < rows.length; index++) {
      const above = await box(rows[index - 1])
      const below = await box(rows[index])
      expect(below.y, rows[index]).toBeGreaterThanOrEqual(above.y + above.height)
    }
    // Submit and Reset sit side by side.
    expect((await box("reset")).x).toBeGreaterThan((await box("submit")).x)
    expect((await box("reset")).y).toBe((await box("submit")).y)
  })
})

test.describe("C1-3 Required errors", () => {
  test("submitting the empty form shows an error beside each required field and focuses First name", async ({
    page,
  }) => {
    const form = await openDemoForm(page)

    await form.submit.click()

    for (const name of REQUIRED) {
      await expect(form.error(name), name).toBeVisible()
      // Beside its field: inside the field's own root.
      await expect(form.root(name).getByTestId(`field-${name}-error`), name).toBeVisible()
    }
    await expect(form.error("acceptTerms")).toHaveText("This box must be checked")
    await expect(form.error("firstName")).toHaveText("This field is required")
    for (const optional of ["dependants", "notes", "subscribe"]) {
      await expect(form.error(optional), optional).toHaveCount(0)
    }
    await expect(form.firstName).toBeFocused()
    await expect(form.success).toHaveCount(0)
    await expect(form.submittedData).toHaveCount(0)

    // Announced to assistive technology.
    const control = controls(form)
    for (const name of REQUIRED) {
      await expect(control[name], name).toHaveAttribute("aria-invalid", "true")
      await expect(control[name], name).toHaveAccessibleDescription(/required|must be checked/)
    }
    await expect(form.error("firstName")).toHaveAttribute("role", "alert")
  })

  test("focus goes to the first invalid field, not always the first field", async ({ page }) => {
    const form = await openDemoForm(page)
    await form.firstName.fill("Ada")
    await form.surname.fill("Lovelace")

    await form.submit.click()

    await expect(form.error("firstName")).toHaveCount(0)
    await expect(form.email).toBeFocused()
  })

  test("nothing is shown while a field is first typed in; the error comes on leaving it", async ({
    page,
  }) => {
    const form = await openDemoForm(page)

    await form.email.pressSequentially("ab")
    await expect(form.error("email")).toHaveCount(0)

    await form.email.press("Tab")
    await expect(form.error("email")).toHaveText("Enter a valid email address")
  })
})

/** Puts each field of C1-4 into its invalid state and leaves it. */
async function breakRules(page: Page) {
  const form = demoForm(page)
  await form.email.fill("abc")
  await form.email.blur()
  await form.dependants.fill("25")
  await form.dependants.blur()
  await form.dateOfBirth.fill("1899-12-31")
  await form.dateOfBirth.blur()
  await form.notes.fill("x".repeat(501))
  await form.notes.blur()
  return form
}

test.describe("C1-4 Rule errors", () => {
  test("each broken rule shows its own error once the field is left", async ({ page }) => {
    await openDemoForm(page)
    const form = await breakRules(page)

    await expect(form.error("email")).toHaveText("Enter a valid email address")
    await expect(form.error("dependants")).toHaveText("Enter a number that is 20 or less")
    await expect(form.error("dateOfBirth")).toHaveText("Enter a date on or after 1 January 1900")
    // Notes cannot end up over 500 characters unnoticed: an error shows.
    await expect(form.error("notes")).toHaveText("Enter no more than 500 characters")

    await form.dependants.fill("1.5")
    await form.dependants.blur()
    await expect(form.error("dependants")).toHaveText("Enter a whole number")

    await form.dependants.fill("-1")
    await expect(form.error("dependants")).toHaveText("Enter a number that is 0 or more")

    // And none of it can be submitted.
    await form.submit.click()
    await expect(form.submittedData).toHaveCount(0)
  })

  test("text that is not a number or a date is an error, not a silent blank", async ({ page }) => {
    const form = await openDemoForm(page)

    await form.dependants.fill("two")
    await form.dependants.blur()
    await expect(form.error("dependants")).toHaveText("Enter a number")

    await form.dateOfBirth.fill("31 June 1990")
    await form.dateOfBirth.blur()
    await expect(form.error("dateOfBirth")).toHaveText("Enter a date like 14 March 1990")

    await form.dateOfBirth.fill("14 mar 1990")
    await expect(form.error("dateOfBirth")).toHaveCount(0)
    await form.dateOfBirth.blur()
    await expect(form.dateOfBirth).toHaveValue("14 March 1990")
  })
})

test.describe("C1-5 Errors clear", () => {
  test("each error disappears as soon as its field is valid, before the field is left", async ({
    page,
  }) => {
    await openDemoForm(page)
    const form = await breakRules(page)
    for (const name of ["email", "dependants", "dateOfBirth", "notes"]) {
      await expect(form.error(name), name).toBeVisible()
    }

    // Typing the last character of a valid value is enough.
    await form.email.fill("ada@example.co")
    await expect(form.error("email")).toHaveCount(0)
    await expect(form.email).toBeFocused()
    await expect(form.email).not.toHaveAttribute("aria-invalid")

    await form.dependants.fill("2")
    await expect(form.error("dependants")).toHaveCount(0)

    await form.dateOfBirth.fill("1990-03-14")
    await expect(form.error("dateOfBirth")).toHaveCount(0)

    await form.notes.press("Backspace")
    await expect(form.error("notes")).toHaveCount(0)
    await expect(form.notes).toHaveValue("x".repeat(500))
  })

  test("required errors clear as each field is filled, including Select, date and Checkbox", async ({
    page,
  }) => {
    const form = await openDemoForm(page)
    await form.submit.click()
    for (const name of REQUIRED) await expect(form.error(name), name).toBeVisible()

    await form.firstName.pressSequentially("A")
    await expect(form.error("firstName")).toHaveCount(0)
    await form.surname.pressSequentially("L")
    await expect(form.error("surname")).toHaveCount(0)
    await form.email.fill("ada@example.com")
    await expect(form.error("email")).toHaveCount(0)
    await pickDate(form, "1990-03-14")
    await expect(form.error("dateOfBirth")).toHaveCount(0)
    await form.preferredContact.click()
    await form.options.getByRole("option", { name: "Post" }).click()
    await expect(form.error("preferredContact")).toHaveCount(0)
    await form.acceptTerms.click()
    await expect(form.error("acceptTerms")).toHaveCount(0)

    await form.submit.click()
    await expect(form.success).toBeVisible()
  })
})

test.describe("C1-6 Valid submit", () => {
  test("shows the success message and the submitted data, typed and nested", async ({ page }) => {
    const form = await openDemoForm(page)
    await fillValid(form)

    await form.submit.click()

    await expect(form.success).toBeVisible()
    await expect(form.success).toContainText("Form submitted")
    await expect(form.submittedData).toBeVisible()
    const data = await submitted(form)
    expect(data).toEqual(VALID_SUBMISSION)

    // Formatted JSON: nested objects on their own lines, a number without
    // quotes, the date as picked, and an empty Notes as null.
    const text = (await form.submittedData.textContent()) ?? ""
    expect(text).toContain('"contact": {\n    "preferredMethod": "phone"\n  }')
    expect(text).toContain('"preferences": {\n    "subscribe": true,\n    "acceptTerms": true\n  }')
    expect(text).toContain('"dependants": 2,')
    expect(text).toContain('"dateOfBirth": "1990-03-14",')
    expect(text).toContain('"notes": null,')
    for (const name of INPUTS.map((input) => input.name)) {
      await expect(form.error(name), name).toHaveCount(0)
    }
  })

  test("optional fields left empty are null, and a decimal is a number", async ({
    page,
    request,
  }) => {
    // A second form through the API, so a non-whole number can be submitted.
    const created = await request.post("/api/forms", {
      data: {
        document: {
          formatVersion: 1,
          name: "Measurements",
          components: [
            {
              id: "c_1",
              type: "number-field",
              name: "weight",
              bind: "weight",
              settings: { label: "Weight" },
            },
            {
              id: "c_2",
              type: "number-field",
              name: "height",
              bind: "size.height",
              settings: { label: "Height" },
            },
            {
              id: "c_3",
              type: "text-field",
              name: "unit",
              bind: "size.unit",
              settings: { label: "Unit" },
            },
            { id: "c_4", type: "button", name: "save", settings: { label: "Save" } },
          ],
        },
      },
    })
    const { id } = await created.json()
    try {
      await page.goto(`/forms/${id}`)
      await page.getByTestId("field-weight").getByRole("textbox").fill("72.5")

      await page.getByTestId("field-save").click()

      const data = JSON.parse((await page.getByTestId("form-submitted-data").textContent()) ?? "")
      expect(data).toEqual({ weight: 72.5, size: { height: null, unit: null } })
    } finally {
      await request.delete(`/api/forms/${id}`)
    }
  })

  test("Enter in a text field submits the form", async ({ page }) => {
    const form = await openDemoForm(page)
    await fillValid(form)

    await form.surname.press("Enter")

    await expect(form.success).toBeVisible()
  })
})

for (const zone of [
  { timezoneId: "Etc/GMT+8", label: "UTC−8" },
  { timezoneId: "Etc/GMT-12", label: "UTC+12" },
]) {
  test.describe(`C1-7 Date in any time zone: ${zone.label}`, () => {
    test.use({ timezoneId: zone.timezoneId })

    test("the date picked is the date submitted", async ({ page }) => {
      const offsetMinutes = await page.evaluate(() => new Date(2026, 0, 1).getTimezoneOffset())
      expect(offsetMinutes).toBe(zone.label === "UTC−8" ? 480 : -720)

      const form = await openDemoForm(page)
      await fillValid(form)
      await expect(form.dateOfBirth).toHaveValue("14 March 1990")
      await form.submit.click()
      expect(await submitted(form)).toMatchObject({ dateOfBirth: "1990-03-14" })

      // The first and last days of a year are where an off-by-one would show.
      for (const iso of ["2000-01-01", "1999-12-31"]) {
        await pickDate(form, iso)
        await form.submit.click()
        await expect(form.submittedData).toContainText(`"dateOfBirth": "${iso}"`)
      }

      // A typed date is the same date too.
      await form.dateOfBirth.fill("2001-09-04")
      await form.submit.click()
      await expect(form.submittedData).toContainText('"dateOfBirth": "2001-09-04"')

      // And it reads back as that day.
      await form.modeReadOnly.click()
      await expect(form.value("dateOfBirth")).toHaveText("4 September 2001")
    })
  })
}

test.describe("C1-8 Read-only", () => {
  test("shows values as text with no controls, and Edit brings the same values back", async ({
    page,
  }) => {
    const form = await openDemoForm(page)
    await fillValid(form)
    await form.notes.fill("Line one\nLine two")

    await form.modeReadOnly.click()

    await expect(form.modeReadOnly).toHaveAttribute("aria-pressed", "true")
    await expect(form.form).toHaveAttribute("data-mode", "read-only")
    await expect(form.value("firstName")).toHaveText("Ada")
    await expect(form.value("surname")).toHaveText("Lovelace")
    await expect(form.value("email")).toHaveText("ada@example.com")
    // A readable date, the option's label, Yes or No.
    await expect(form.value("dateOfBirth")).toHaveText("14 March 1990")
    await expect(form.value("dependants")).toHaveText("2")
    await expect(form.value("preferredContact")).toHaveText("Phone")
    await expect(form.value("notes")).toHaveText("Line one\nLine two")
    await expect(form.value("subscribe")).toHaveText("Yes")
    await expect(form.value("acceptTerms")).toHaveText("Yes")
    for (const input of INPUTS) {
      await expect(form.root(input.name), input.name).toContainText(input.label)
    }

    // No editable controls, no Submit, no Reset.
    await expect(
      form.form.locator(
        "input, textarea, select, button, [role=combobox], [role=checkbox], [role=switch], [contenteditable]",
      ),
    ).toHaveCount(0)
    await expect(form.submit).toHaveCount(0)
    await expect(form.reset).toHaveCount(0)

    await form.modeEdit.click()

    await expect(form.firstName).toHaveValue("Ada")
    await expect(form.surname).toHaveValue("Lovelace")
    await expect(form.email).toHaveValue("ada@example.com")
    await expect(form.dateOfBirth).toHaveValue("14 March 1990")
    await expect(form.dependants).toHaveValue("2")
    await expect(form.preferredContact).toHaveText("Phone")
    await expect(form.notes).toHaveValue("Line one\nLine two")
    await expect(form.subscribe).toBeChecked()
    await expect(form.acceptTerms).toBeChecked()
    await form.submit.click()
    expect(await submitted(form)).toEqual({ ...VALID_SUBMISSION, notes: "Line one\nLine two" })
  })

  test("empty values show a clear marker, and No for booleans that are off", async ({ page }) => {
    const form = await openDemoForm(page)
    await form.subscribe.click()

    await form.modeReadOnly.click()

    for (const name of [
      "firstName",
      "surname",
      "email",
      "dateOfBirth",
      "dependants",
      "preferredContact",
      "notes",
    ]) {
      await expect(form.value(name), name).toHaveText("—No value")
      await expect(form.value(name), name).toHaveAttribute("data-empty", "true")
    }
    await expect(form.value("subscribe")).toHaveText("No")
    await expect(form.value("acceptTerms")).toHaveText("No")
  })
})

test.describe("C1-9 Reset", () => {
  test("returns every field to its default and clears every error", async ({ page }) => {
    const form = await openDemoForm(page)
    await form.firstName.fill("Ada")
    await form.dependants.fill("two")
    await form.notes.fill("Something")
    await form.subscribe.click()
    await form.acceptTerms.click()
    await form.preferredContact.click()
    await form.options.getByRole("option", { name: "Email" }).click()
    await pickDate(form, "1990-03-14")
    await form.email.fill("abc")
    await form.submit.click()
    for (const name of ["surname", "email", "dependants"]) {
      await expect(form.error(name), name).toBeVisible()
    }

    await form.reset.click()

    await expect(form.firstName).toHaveValue("")
    await expect(form.surname).toHaveValue("")
    await expect(form.email).toHaveValue("")
    await expect(form.dateOfBirth).toHaveValue("")
    await expect(form.dependants).toHaveValue("")
    await expect(form.notes).toHaveValue("")
    await expect(form.preferredContact).not.toContainText("Email")
    await expect(form.subscribe).toBeChecked()
    await expect(form.acceptTerms).not.toBeChecked()
    await expect(form.form.locator("[data-testid$=-error]")).toHaveCount(0)
    await expect(form.form.locator("[aria-invalid=true]")).toHaveCount(0)

    // Reset really did go back to the defaults: the form is empty again.
    await form.submit.click()
    for (const name of REQUIRED) await expect(form.error(name), name).toBeVisible()
  })

  test("clears a shown submission", async ({ page }) => {
    const form = await openDemoForm(page)
    await fillValid(form)
    await form.submit.click()
    await expect(form.submittedData).toBeVisible()

    await form.reset.click()

    await expect(form.success).toHaveCount(0)
    await expect(form.submittedData).toHaveCount(0)
    await expect(form.firstName).toHaveValue("")
  })
})

test.describe("C1-10 Slot override", () => {
  test("only the Email label takes the override colour", async ({ page }) => {
    await openDemoForm(page)
    const label = (name: string) => `[data-testid=field-${name}] [data-slot=field-label]`
    const input = (name: string) => `[data-testid=field-${name}] input`

    expect(await colourOf(page, label("email"))).toBe("rgb(0, 59, 178)")

    // Unchanged from their defaults: the same as fields with no override.
    const defaultLabel = await colourOf(page, label("surname"))
    const defaultInput = await colourOf(page, input("surname"))
    expect(defaultLabel).not.toBe("rgb(0, 59, 178)")
    expect(await colourOf(page, label("firstName"))).toBe(defaultLabel)
    expect(await colourOf(page, input("email"))).toBe(defaultInput)
    expect(await colourOf(page, input("firstName"))).toBe(defaultInput)

    // The override is on the label itself and nowhere else: no class, no rule.
    const styled = await page
      .getByTestId("form")
      .locator("[style]")
      .evaluateAll((elements) =>
        elements
          .filter((element) => (element as HTMLElement).style.color !== "")
          .map((element) => element.getAttribute("data-slot")),
      )
    expect(styled).toEqual(["field-label"])
  })

  test("the override also holds in read-only and dark mode", async ({ page }) => {
    const form = await openDemoForm(page)
    await page.getByTestId("theme-toggle").click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    expect(await colourOf(page, "[data-testid=field-email] [data-slot=field-label]")).toBe(
      "rgb(0, 59, 178)",
    )

    await form.modeReadOnly.click()

    expect(await colourOf(page, "[data-testid=field-email] dt")).toBe("rgb(0, 59, 178)")
    expect(await colourOf(page, "[data-testid=field-surname] dt")).not.toBe("rgb(0, 59, 178)")
  })
})

test.describe("C1-11 Columns follow their width", () => {
  const boxes = async (page: Page) => {
    const form = demoForm(page)
    const box = async (name: string) => (await form.root(name).boundingBox())!
    return {
      firstName: await box("firstName"),
      surname: await box("surname"),
      dateOfBirth: await box("dateOfBirth"),
      dependants: await box("dependants"),
    }
  }
  const hasHorizontalScroll = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

  test("side by side at 1280px, stacked at 390px, with no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openDemoForm(page)

    let at = await boxes(page)
    expect(at.surname.y).toBe(at.firstName.y)
    expect(at.surname.x).toBeGreaterThanOrEqual(at.firstName.x + at.firstName.width)
    expect(Math.abs(at.surname.width - at.firstName.width)).toBeLessThanOrEqual(1)
    expect(at.dependants.y).toBe(at.dateOfBirth.y)
    expect(at.dependants.x).toBeGreaterThanOrEqual(at.dateOfBirth.x + at.dateOfBirth.width)
    expect(await hasHorizontalScroll(page)).toBe(false)

    await page.setViewportSize({ width: 390, height: 844 })

    await expect
      .poll(async () => (await boxes(page)).surname.x === (await boxes(page)).firstName.x)
      .toBe(true)
    at = await boxes(page)
    expect(at.surname.y).toBeGreaterThanOrEqual(at.firstName.y + at.firstName.height)
    expect(at.surname.width).toBe(at.firstName.width)
    expect(at.dependants.x).toBe(at.dateOfBirth.x)
    expect(at.dependants.y).toBeGreaterThanOrEqual(at.dateOfBirth.y + at.dateOfBirth.height)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("they follow the container, not the viewport", async ({ page }) => {
    // A wide window, but the form squeezed into a narrow box, as it would be
    // in a side panel: the columns must stack.
    await page.setViewportSize({ width: 1280, height: 900 })
    const form = await openDemoForm(page)
    const before = await boxes(page)
    expect(before.surname.y).toBe(before.firstName.y)

    await form.form.evaluate((element) => {
      element.parentElement!.style.width = "320px"
    })

    await expect
      .poll(async () => {
        const at = await boxes(page)
        return at.surname.y >= at.firstName.y + at.firstName.height
      })
      .toBe(true)
  })
})

/** The focused element: which instance it belongs to, and whether its focus ring shows. */
function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return null
    // A control made of parts shows the ring around the whole control.
    const group = element.closest("[data-slot=input-group]")
    const ringOwner = group && element.matches("[data-slot=input-group-control]") ? group : element
    const style = getComputedStyle(ringOwner)
    // The instance it belongs to: the nearest `field-<name>`, past the test
    // ids of the parts inside it (`field-<name>-control` and the like).
    let owner: Element | null = element
    while (owner && !/^field-[^-]+$/.test(owner.getAttribute("data-testid") ?? "")) {
      owner = owner.parentElement
    }
    return {
      instance: owner?.getAttribute("data-testid")?.replace(/^field-/, "") ?? null,
      hasRing:
        style.outlineStyle === "solid" &&
        parseFloat(style.outlineWidth) >= 2 &&
        !/rgba?\(0, 0, 0, 0\)|transparent/.test(style.outlineColor),
    }
  })
}

test.describe("C1-12 Keyboard only", () => {
  test("the whole form is filled and submitted without a mouse, with a visible focus ring", async ({
    page,
  }) => {
    const form = await openDemoForm(page)
    const keyboard = page.keyboard
    const expectFocus = async (instance: string) => {
      expect(await focused(page), instance).toEqual({ instance, hasRing: true })
    }

    // Start from the top of the form, as someone tabbing in would.
    await form.modeReadOnly.focus()
    await keyboard.press("Tab")

    await expectFocus("firstName")
    await keyboard.type("Ada")
    await keyboard.press("Tab")

    await expectFocus("surname")
    await keyboard.type("Lovelace")
    await keyboard.press("Tab")

    await expectFocus("email")
    await keyboard.type("ada@example.com")
    await keyboard.press("Tab")

    // Date picker: the text input, then the calendar button.
    await expectFocus("dateOfBirth")
    await expect(form.dateOfBirth).toBeFocused()
    await keyboard.press("Tab")
    await expectFocus("dateOfBirth")
    await expect(form.calendarButton).toBeFocused()
    await keyboard.press("Enter")
    await expect(form.calendar).toBeVisible()
    // Month and year are chosen from the dropdowns, then a day with the arrows.
    const dropdowns = form.calendar.getByRole("combobox")
    await dropdowns.nth(1).focus()
    await dropdowns.nth(1).selectOption("1990")
    await dropdowns.nth(0).focus()
    await dropdowns.nth(0).selectOption("2")
    const day = dayButton(form, "1990-03-13")
    await day.focus()
    expect((await focused(page))?.hasRing).toBe(true)
    await keyboard.press("ArrowRight")
    await expect(dayButton(form, "1990-03-14")).toBeFocused()
    await keyboard.press("Enter")
    await expect(form.calendar).toBeHidden()
    await expect(form.dateOfBirth).toHaveValue("14 March 1990")
    await expect(form.calendarButton).toBeFocused()
    await keyboard.press("Tab")

    await expectFocus("dependants")
    await keyboard.type("2")
    await keyboard.press("Tab")

    // Select: open, move, choose.
    await expectFocus("preferredContact")
    await keyboard.press("Enter")
    await expect(form.options).toBeVisible()
    const highlighted = form.options.locator("[role=option][data-highlighted]")
    await expect(highlighted).toHaveText("Email")
    await keyboard.press("ArrowDown")
    await expect(highlighted).toHaveText("Phone")
    await keyboard.press("Enter")
    await expect(form.options).toBeHidden()
    await expect(form.preferredContact).toHaveText("Phone")
    await expect(form.preferredContact).toBeFocused()
    await keyboard.press("Tab")

    await expectFocus("notes")
    await keyboard.type("By keyboard")
    await keyboard.press("Tab")

    // Switch and Checkbox toggle with Space.
    await expectFocus("subscribe")
    await keyboard.press("Space")
    await expect(form.subscribe).not.toBeChecked()
    await keyboard.press("Space")
    await expect(form.subscribe).toBeChecked()
    await keyboard.press("Tab")

    await expectFocus("acceptTerms")
    await keyboard.press("Space")
    await expect(form.acceptTerms).toBeChecked()
    await keyboard.press("Tab")

    await expectFocus("submit")
    await keyboard.press("Tab")
    await expectFocus("reset")
    await keyboard.press("Shift+Tab")
    await expectFocus("submit")
    await keyboard.press("Enter")

    await expect(form.success).toBeVisible()
    expect(await submitted(form)).toEqual({ ...VALID_SUBMISSION, notes: "By keyboard" })
  })

  test("the date can be typed instead of picked, and Escape closes the popups", async ({
    page,
  }) => {
    const form = await openDemoForm(page)

    await form.dateOfBirth.focus()
    await page.keyboard.type("14 mar 1990")
    await page.keyboard.press("Tab")
    await expect(form.dateOfBirth).toHaveValue("14 March 1990")
    await expect(form.calendarButton).toBeFocused()

    await page.keyboard.press("Space")
    await expect(form.calendar).toBeVisible()
    // It opens on the month of the value.
    await expect(dayButton(form, "1990-03-14")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(form.calendar).toBeHidden()
    await expect(form.calendarButton).toBeFocused()
    await expect(form.error("dateOfBirth")).toHaveCount(0)

    await form.preferredContact.focus()
    await page.keyboard.press("ArrowDown")
    await expect(form.options).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(form.options).toBeHidden()
    await expect(form.preferredContact).toBeFocused()
    // Opening and closing a required Select without choosing shows no error
    // while focus is still on it.
    await expect(form.error("preferredContact")).toHaveCount(0)
    await page.keyboard.press("Tab")
    await expect(form.error("preferredContact")).toBeVisible()
  })

  test("the Edit and Read-only switch works from the keyboard", async ({ page }) => {
    const form = await openDemoForm(page)

    await form.modeEdit.focus()
    expect((await focused(page))?.hasRing).toBe(true)
    await page.keyboard.press("Tab")
    await expect(form.modeReadOnly).toBeFocused()
    await page.keyboard.press("Enter")

    await expect(form.form).toHaveAttribute("data-mode", "read-only")
    await expect(form.modeReadOnly).toBeFocused()
  })
})

test.describe("C1-18 Unknown id", () => {
  test("shows a not-found state with a link back to Forms", async ({ page }) => {
    const response = await page.goto("/forms/does-not-exist")

    // The page itself loads; the form is what does not exist.
    expect(response?.status()).toBe(200)
    await expect(page.getByTestId("form-not-found")).toBeVisible()
    await expect(page.getByTestId("form")).toHaveCount(0)
    await expect(page.locator("h1")).toHaveCount(1)
    await expect(page.getByTestId("app-shell")).toBeVisible()

    await page.getByTestId("form-not-found-link").click()

    await expect(page).toHaveURL("/forms")
    await expect(page.getByTestId("forms-list")).toBeVisible()
  })
})
