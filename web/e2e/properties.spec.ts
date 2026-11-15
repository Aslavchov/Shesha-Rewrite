import type { Locator, Page } from "@playwright/test"

import {
  columns,
  createForm,
  dragAndDrop,
  field,
  type Instance,
  liveRegion,
  openDesigner,
  pointIn,
  readForm,
  waitUntilSaved,
} from "./support/designer.ts"
import { expect, test } from "./support/fixtures.ts"

/** Phase 3: the properties panel, styles and five more components (spec section 9). */

// Every check requires a clean console.
test.afterEach(({ consoleProblems }) => {
  expect(consoleProblems).toEqual([])
})

const canvas = (page: Page, name: string) => page.getByTestId(`canvas-${name}`)
const outline = (page: Page, name: string) => page.getByTestId(`outline-${name}`)
const toolbox = (page: Page, type: string) => page.getByTestId(`toolbox-item-${type}`)
const setting = (page: Page, key: string) => page.getByTestId(`props-setting-${key}`)
/** The component as the canvas draws it. */
const drawn = (page: Page, name: string) =>
  page.getByTestId("designer-canvas").getByTestId(`field-${name}`)
/** Where a setting's value comes from now: set on the instance, or the default. */
const sourceOf = (page: Page, key: string) =>
  setting(page, key).locator("xpath=ancestor::*[@data-value-source][1]")
const errorOf = (page: Page, key: string) => sourceOf(page, key).getByRole("alert")

/** Picks an item of a Select-like control by its text. */
async function choose(page: Page, trigger: Locator, name: string) {
  await trigger.click()
  await page.getByRole("option", { name, exact: true }).click()
}

/** An instance as stored, found anywhere in the form. */
function find(components: Instance[], name: string): Instance | undefined {
  for (const instance of components) {
    if (instance.name === name) return instance
    const inner = find(Object.values(instance.regions ?? {}).flat(), name)
    if (inner) return inner
  }
  return undefined
}

async function stored(page: Page, request: Parameters<typeof readForm>[0], id: string) {
  await waitUntilSaved(page)
  return readForm(request, id)
}

test.describe("C3-1 Live label edit", () => {
  test("the canvas follows the typing, and one undo restores the whole old label", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Label edit", [field("first")])
    await openDesigner(page, id)
    await canvas(page, "first").click()

    const label = setting(page, "label")
    await expect(label).toHaveValue("first")
    await label.selectText()
    await label.pressSequentially("First")
    await expect(drawn(page, "first")).toContainText("First")
    await label.pressSequentially(" name")
    await expect(drawn(page, "first")).toContainText("First name")
    await expect(page.getByTestId("designer-undo")).toBeEnabled()

    // One undo, from the field itself: the whole run of typing goes.
    await page.keyboard.press("Control+z")
    await expect(label).toHaveValue("first")
    await expect(drawn(page, "first")).toContainText("first")
    await expect(page.getByTestId("designer-undo")).toBeDisabled()
    await expect(liveRegion(page)).toHaveText("Undid: Change label of first.")
  })
})

test.describe("C3-2 Set, default and reset", () => {
  test("a set placeholder is stored and shown as set; reset removes the key", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Set and reset", [field("first")])
    await openDesigner(page, id)
    await canvas(page, "first").click()
    await expect(sourceOf(page, "placeholder")).toHaveAttribute("data-value-source", "default")
    await expect(page.getByTestId("props-reset-placeholder")).toHaveCount(0)

    await setting(page, "placeholder").fill("e.g. Ada")
    await expect(sourceOf(page, "placeholder")).toHaveAttribute("data-value-source", "set")
    let form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.settings).toEqual({
      label: "first",
      placeholder: "e.g. Ada",
    })

    await page.getByTestId("props-reset-placeholder").click()
    await expect(sourceOf(page, "placeholder")).toHaveAttribute("data-value-source", "default")
    await expect(setting(page, "placeholder")).toHaveValue("")
    form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.settings).toEqual({ label: "first" })
    expect(find(form.document.components, "first")?.settings).not.toHaveProperty("placeholder")
  })
})

test.describe("C3-3 Validation settings", () => {
  test("required and a maximum length set in the panel are what the form checks", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Validation", [field("first")])
    await openDesigner(page, id)
    await canvas(page, "first").click()
    await setting(page, "required").click()
    await setting(page, "maxLength").fill("5")
    await waitUntilSaved(page)

    await page.getByTestId("designer-mode-preview").click()
    const control = page.getByTestId("field-first-control")
    await control.fill("abcdef")
    await control.blur()
    await expect(page.getByTestId("field-first-error")).toHaveText(
      "Enter no more than 5 characters",
    )
    await control.fill("")
    await control.press("Enter")
    await expect(page.getByTestId("field-first-error")).toHaveText("This field is required")
  })
})

test.describe("C3-4 Rename", () => {
  test("a valid name and data path apply; an invalid one says why and changes nothing", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Rename", [field("textField1"), field("other")])
    await openDesigner(page, id)
    await canvas(page, "textField1").click()
    const name = page.getByTestId("props-name")

    await name.fill("firstName")
    await expect(outline(page, "firstName")).toBeVisible()
    await expect(canvas(page, "firstName")).toHaveAttribute("data-canvas-item", "c_textField1")

    await name.fill("first name")
    await expect(page.getByTestId("designer-properties").getByRole("alert")).toHaveText(
      "Use only letters, digits, _ and $, with no spaces.",
    )
    await expect(outline(page, "firstName")).toBeVisible()

    await name.fill("other")
    await expect(page.getByTestId("designer-properties").getByRole("alert")).toHaveText(
      "“other” is already the name of another component.",
    )
    await expect(outline(page, "firstName")).toBeVisible()
    await expect(outline(page, "other")).toHaveCount(1)

    // Back to a valid name: the error goes and it applies.
    await name.fill("firstName")
    await expect(page.getByTestId("designer-properties").getByRole("alert")).toHaveCount(0)

    await page.getByTestId("props-bind").fill("person.firstName")
    const form = await stored(page, request, id)
    const instance = find(form.document.components, "firstName")
    expect(instance).toMatchObject({ id: "c_textField1", bind: "person.firstName" })
    expect(find(form.document.components, "other")).toMatchObject({ id: "c_other" })
  })
})

test.describe("C3-5 Invalid setting", () => {
  test("a negative maximum, and a minimum above the maximum, show errors and store nothing", async ({
    page,
    request,
  }) => {
    const start: Instance = { ...field("first"), settings: { label: "First", maxLength: 5 } }
    const id = await createForm(request, "Invalid settings", [start])
    await openDesigner(page, id)
    await canvas(page, "first").click()

    await setting(page, "maxLength").fill("-3")
    await expect(errorOf(page, "maxLength")).toHaveText("Enter a whole number, 0 or more.")
    await setting(page, "minLength").fill("9")
    await expect(errorOf(page, "minLength")).toHaveText(
      "The minimum length is more than the maximum length.",
    )
    await expect(page.getByTestId("designer-undo")).toBeDisabled()

    const form = await stored(page, request, id)
    expect(form.revision).toBe(1)
    expect(find(form.document.components, "first")?.settings).toEqual(start.settings)
  })
})

test.describe("C3-4 and C3-5 A field left with an invalid value", () => {
  test("a taken name, typed key by key, leaves the name it had, not a half-typed one", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Taken name", [field("textField1"), field("textField2")])
    await openDesigner(page, id)
    await canvas(page, "textField1").click()
    const name = page.getByTestId("props-name")
    await name.fill("")
    await name.pressSequentially("textField2")
    await expect(page.getByTestId("designer-properties").getByRole("alert")).toHaveText(
      "“textField2” is already the name of another component.",
    )
    await name.blur()
    await expect(name).toHaveValue("textField1")
    await expect(outline(page, "textField1")).toBeVisible()
    await expect(page.getByTestId("designer-properties").getByRole("alert")).toHaveCount(0)
    await expect(liveRegion(page)).toHaveText(
      "Taken back: Rename textField1. What was typed is not valid.",
    )
    const form = await stored(page, request, id)
    expect(form.document.components.map((instance) => instance.name)).toEqual([
      "textField1",
      "textField2",
    ])
  })

  test("a data path that clashes, typed key by key, leaves the path it had", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Clashing path", [
      { ...field("first"), bind: "person.first" },
      { ...field("taken"), bind: "person.firstName" },
    ])
    await openDesigner(page, id)
    await canvas(page, "first").click()
    const path = page.getByTestId("props-bind")
    await path.fill("")
    await path.pressSequentially("person.firstName")
    await expect(page.getByTestId("designer-properties").getByRole("alert")).toHaveText(
      "taken already stores its value under person.firstName.",
    )
    await path.blur()
    await expect(path).toHaveValue("person.first")
    const form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.bind).toBe("person.first")
  })

  test("a maximum length typed as -3 leaves the maximum it had", async ({ page, request }) => {
    const start: Instance = { ...field("first"), settings: { label: "First", maxLength: 5 } }
    const id = await createForm(request, "Negative maximum", [start])
    await openDesigner(page, id)
    await canvas(page, "first").click()
    const max = setting(page, "maxLength")
    await max.fill("")
    await max.pressSequentially("-3")
    await expect(errorOf(page, "maxLength")).toHaveText("Enter a whole number, 0 or more.")
    await max.blur()
    await expect(max).toHaveValue("5")
    await expect(errorOf(page, "maxLength")).toHaveCount(0)
    const form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.settings).toEqual(start.settings)
  })

  test("a minimum length of 10 under a maximum of 5 leaves no minimum, not 1", async ({
    page,
    request,
  }) => {
    const start: Instance = { ...field("first"), settings: { label: "First", maxLength: 5 } }
    const id = await createForm(request, "Minimum above maximum", [start])
    await openDesigner(page, id)
    await canvas(page, "first").click()
    const min = setting(page, "minLength")
    await min.pressSequentially("10")
    await expect(errorOf(page, "minLength")).toHaveText(
      "The minimum length is more than the maximum length.",
    )
    await min.blur()
    await expect(min).toHaveValue("")
    await expect(sourceOf(page, "minLength")).toHaveAttribute("data-value-source", "default")
    const form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.settings).toEqual(start.settings)
  })

  test("after undo, a field shows the restored value without its old error", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Stale errors", [field("first")])
    await openDesigner(page, id)
    await canvas(page, "first").click()
    await setting(page, "maxLength").fill("5")
    await setting(page, "maxLength").blur()
    await setting(page, "minLength").fill("9")
    await expect(errorOf(page, "minLength")).toBeVisible()
    await page.keyboard.press("Control+z")
    await expect(setting(page, "maxLength")).toHaveValue("")
    await expect(setting(page, "minLength")).toHaveValue("")
    await expect(errorOf(page, "minLength")).toHaveCount(0)
    await page.keyboard.press("Control+y")
    await expect(setting(page, "maxLength")).toHaveValue("5")
    await expect(errorOf(page, "minLength")).toHaveCount(0)
  })

  test("focus moves on from a reset, a removed option and a fixed problem", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Focus", [
      {
        ...field("pick", "radio-group"),
        settings: {
          placeholder: 1,
          options: [
            { label: "One", value: "1" },
            { label: "Two", value: "2" },
          ],
        },
      },
    ])
    await openDesigner(page, id)
    await canvas(page, "pick").click()

    await page.getByTestId("props-problem-fix-0").click()
    await expect(page.getByTestId("props-name")).toBeFocused()

    await setting(page, "helpText").fill("Pick one")
    await page.getByTestId("props-reset-helpText").click()
    await expect(setting(page, "helpText")).toBeFocused()

    await page.getByTestId("props-option-0-remove").click()
    await expect(page.getByTestId("props-option-0-label")).toBeFocused()
    await expect(page.getByTestId("props-option-0-label")).toHaveValue("Two")
  })
})

test.describe("C3-6 Form settings", () => {
  test("renaming the form and changing its gap update the title, the list and the canvas", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Before the rename", [field("a"), field("b")])
    await openDesigner(page, id)
    const gapBetween = async () => {
      const a = (await drawn(page, "a").boundingBox())!
      const b = (await drawn(page, "b").boundingBox())!
      return b.y - (a.y + a.height)
    }
    const before = await gapBetween()

    await expect(page.getByTestId("designer-properties-empty")).toBeVisible()
    await page.getByTestId("props-form-name").fill("After the rename")
    await expect(page.getByTestId("page-title")).toHaveText("After the rename")
    await expect(page).toHaveTitle(/^After the rename · Designer/)
    await page.getByTestId("props-form-description").fill("Renamed in the designer.")
    await choose(page, setting(page, "gap"), "Extra large")
    await expect.poll(gapBetween).toBeGreaterThan(before)

    await waitUntilSaved(page)
    await page.getByTestId("designer-back").click()
    await page.getByTestId("nav-forms").click()
    const item = page.getByTestId("forms-item").filter({ hasText: "After the rename" })
    await expect(item).toHaveCount(1)
    await expect(item).toContainText("Renamed in the designer.")
    const form = await readForm(request, id)
    expect(form.document).toMatchObject({ name: "After the rename", settings: { gap: "xl" } })
  })
})

/** The computed value of a colour token on the page, in the current theme. */
const tokenColour = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("div")
    probe.style.color = `var(--sys-color-${name})`
    document.body.append(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  }, token)

const computed = (locator: Locator, property: "color" | "backgroundColor" | "paddingTop") =>
  locator.evaluate((element, name) => getComputedStyle(element)[name], property)

test.describe("C3-7 Slot styles", () => {
  test("a theme colour on one slot and a custom colour on another; the theme follows dark mode", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Slot styles", [field("first")])
    await openDesigner(page, id)
    const control = drawn(page, "first").getByTestId("field-first-control")
    const label = drawn(page, "first").locator("[data-form-slot=label]")
    const root = drawn(page, "first")
    const before = {
      label: await computed(label, "backgroundColor"),
      root: await computed(root, "backgroundColor"),
      rootColour: await computed(root, "color"),
    }

    await canvas(page, "first").click()
    await page.getByTestId("props-slot-control").click()
    await page.getByTestId("props-style-control-background").click()
    await page.getByTestId("props-token-muted").click()
    await page.getByTestId("props-slot-label").click()
    await page.getByTestId("props-style-label-color").click()
    await page.getByTestId("props-style-label-color-hex").fill("#B21A00")
    await page.keyboard.press("Escape")

    await expect
      .poll(() => computed(control, "backgroundColor"))
      .toBe(await tokenColour(page, "muted"))
    await expect.poll(() => computed(label, "color")).toBe("rgb(178, 26, 0)")
    // Nothing else changed.
    expect(await computed(label, "backgroundColor")).toBe(before.label)
    expect(await computed(root, "backgroundColor")).toBe(before.root)
    expect(await computed(root, "color")).toBe(before.rootColour)

    const light = await computed(control, "backgroundColor")
    await page.getByTestId("theme-toggle").click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    const darkMuted = await tokenColour(page, "muted")
    expect(darkMuted).not.toBe(light)
    await expect.poll(() => computed(control, "backgroundColor")).toBe(darkMuted)
    // The custom colour stays what it is.
    expect(await computed(label, "color")).toBe("rgb(178, 26, 0)")

    const form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.styles).toEqual({
      control: { background: { token: "muted" } },
      label: { color: "#B21A00" },
    })
  })
})

test.describe("C3-8 Slot isolation", () => {
  test("a Select's trigger padding does not reach the items of its popup", async ({
    page,
    request,
  }) => {
    const select: Instance = {
      ...field("pick", "select"),
      settings: {
        label: "Pick",
        options: [
          { label: "One", value: "1" },
          { label: "Two", value: "2" },
        ],
      },
    }
    const id = await createForm(request, "Slot isolation", [select])
    await openDesigner(page, id)
    await page.getByTestId("designer-mode-preview").click()
    await page.getByTestId("field-pick-control").click()
    const item = page.getByTestId("field-pick-option").filter({ hasText: "One" })
    const itemPadding = await computed(item, "paddingTop")
    await page.keyboard.press("Escape")
    await page.getByTestId("designer-mode-design").click()

    await canvas(page, "pick").click()
    await page.getByTestId("props-slot-trigger").click()
    await choose(page, page.getByTestId("props-style-trigger-padding"), "Large")
    await waitUntilSaved(page)

    await page.getByTestId("designer-mode-preview").click()
    const trigger = page.getByTestId("field-pick-control")
    await expect.poll(() => computed(trigger, "paddingTop")).toBe("24px")
    await trigger.click()
    await expect(item).toBeVisible()
    expect(await computed(item, "paddingTop")).toBe(itemPadding)
    expect(itemPadding).not.toBe("24px")
  })
})

test.describe("C3-9 Style reset", () => {
  test("resetting a property removes it; resetting the slot removes the slot", async ({
    page,
    request,
  }) => {
    const styled: Instance = {
      ...field("first"),
      styles: { label: { color: "#003BB2", fontWeight: "semibold" } },
    }
    const id = await createForm(request, "Style reset", [styled])
    await openDesigner(page, id)
    await canvas(page, "first").click()
    await page.getByTestId("props-slot-label").click()

    await page.getByTestId("props-style-reset-label-color").click()
    let form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.styles).toEqual({
      label: { fontWeight: "semibold" },
    })

    await page.getByTestId("props-style-reset-label").click()
    form = await stored(page, request, id)
    expect(find(form.document.components, "first")).not.toHaveProperty("styles")
  })
})

test.describe("C3-10 Columns count", () => {
  test("fewer columns warn and hide a field, without deleting it; restoring shows it again", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Columns count", [columns("row")])
    await openDesigner(page, id)
    await canvas(page, "row").click()
    await setting(page, "columns").fill("3")
    await dragAndDrop(
      page,
      toolbox(page, "text-field"),
      await pointIn(page.getByTestId("drop-target-row-col3")),
    )
    await expect(outline(page, "textField1")).toBeVisible()

    await canvas(page, "row").click()
    await setting(page, "columns").fill("2")
    await expect(page.getByTestId("props-warning-columns")).toContainText(
      "1 component is now hidden",
    )
    await expect(outline(page, "textField1")).toHaveAttribute("data-hidden", "true")
    await expect(canvas(page, "textField1")).toHaveCount(0)
    let form = await stored(page, request, id)
    expect(form.document.components[0].regions?.col3?.[0]?.name).toBe("textField1")

    await setting(page, "columns").fill("3")
    await expect(outline(page, "textField1")).not.toHaveAttribute("data-hidden")
    await expect(canvas(page, "textField1")).toBeVisible()
    form = await stored(page, request, id)
    expect(form.document.components[0].settings).toEqual({ columns: 3 })
  })
})

test.describe("C3-11 Problems", () => {
  test("an unknown type and an invalid setting are marked, explained, and the reset works", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Problems", [
      { id: "c_stars", type: "rating", name: "stars" },
      { ...field("first"), settings: { label: "First", maxLength: -3 } },
    ])
    await openDesigner(page, id)
    await expect(page.getByTestId("outline-problem-stars")).toBeVisible()
    await expect(page.getByTestId("outline-problem-first")).toBeVisible()

    await outline(page, "stars").click()
    await expect(page.getByTestId("props-problems")).toContainText(
      "This version has no component of type “rating”.",
    )

    await outline(page, "first").click()
    const problems = page.getByTestId("props-problems")
    await expect(problems).toContainText("Maximum length: -3 is not a valid maximum length")
    await problems.getByRole("button", { name: "Reset maximum length" }).click()
    await expect(page.getByTestId("props-problems")).toHaveCount(0)
    await expect(page.getByTestId("outline-problem-first")).toHaveCount(0)

    const form = await stored(page, request, id)
    expect(find(form.document.components, "first")?.settings).toEqual({ label: "First" })
  })
})

test.describe("C3-12 New components", () => {
  test("Card, Tabs, Text, Alert and Radio group render as configured", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "New components")
    await openDesigner(page, id)

    await toolbox(page, "text").click()
    await setting(page, "text").fill("Your details")
    await choose(page, setting(page, "variant"), "Heading 2")

    await toolbox(page, "alert").click()
    await choose(page, setting(page, "variant"), "Warning")
    await setting(page, "title").fill("Check before sending")

    await toolbox(page, "card").click()
    await setting(page, "title").fill("About you")
    await setting(page, "description").fill("As on your passport.")

    await toolbox(page, "radio-group").click()
    await setting(page, "label").fill("Contact by")
    await page.getByTestId("props-option-add").click()
    await page.getByTestId("props-option-add").click()
    await page.getByTestId("props-option-0-label").fill("Email")
    await page.getByTestId("props-option-0-value").fill("email")
    await page.getByTestId("props-option-1-label").fill("Phone")
    await page.getByTestId("props-option-1-value").fill("phone")
    await setting(page, "required").click()

    await toolbox(page, "tabs").click()
    await page.getByTestId("props-tab-0-label").fill("Home")
    await page.getByTestId("props-tab-1-label").fill("Work")

    await toolbox(page, "button").click()
    await waitUntilSaved(page)

    await page.getByTestId("designer-mode-preview").click()
    const form = page.getByTestId("form")
    await expect(form.getByRole("heading", { level: 2, name: "Your details" })).toBeVisible()
    await expect(page.getByTestId("field-alert1")).toHaveAttribute("data-variant", "warning")
    await expect(page.getByTestId("field-alert1")).toContainText("Check before sending")
    await expect(form.getByRole("group", { name: "About you" })).toContainText(
      "As on your passport.",
    )

    // The radio group validates when it is required.
    await form.getByRole("button", { name: "Button" }).click()
    await expect(page.getByTestId("field-radioGroup1-error")).toHaveText("This field is required")
    await form.getByRole("radio", { name: "Phone" }).click()
    await expect(page.getByTestId("field-radioGroup1-error")).toHaveCount(0)

    // The tabs switch.
    await expect(form.getByRole("tab", { name: "Home" })).toHaveAttribute("aria-selected", "true")
    await form.getByRole("tab", { name: "Work" }).click()
    await expect(form.getByRole("tab", { name: "Work" })).toHaveAttribute("aria-selected", "true")

    await form.getByRole("button", { name: "Button" }).click()
    await expect(page.getByTestId("form-submitted-data")).toContainText('"radioGroup1": "phone"')
  })
})

test.describe("C3-13 Tabs editing", () => {
  test("content survives a rename; removing the tab hides it; undo brings both back", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Tabs editing")
    await openDesigner(page, id)
    await toolbox(page, "tabs").click()

    await page.getByTestId("props-tab-add").click()
    await expect(page.getByTestId("props-tab-2-label")).toHaveValue("Tab 3")
    // Adding a tab shows it on the canvas, ready for a drop.
    await dragAndDrop(
      page,
      toolbox(page, "text-field"),
      await pointIn(page.getByTestId("drop-target-tabs1-tab3")),
    )
    await expect(outline(page, "textField1")).toBeVisible()

    await outline(page, "tabs1").click()
    await page.getByTestId("props-tab-2-label").fill("Extra")
    await expect(outline(page, "tabs1-tab3")).toHaveText("Extra")
    await expect(outline(page, "textField1")).not.toHaveAttribute("data-hidden")
    let form = await stored(page, request, id)
    expect(form.document.components[0].regions?.tab3?.[0]?.name).toBe("textField1")

    await page.getByTestId("props-tab-2-remove").click()
    await expect(outline(page, "textField1")).toHaveAttribute("data-hidden", "true")
    await expect(page.getByTestId("outline-problem-tabs1")).toBeVisible()
    form = await stored(page, request, id)
    expect(form.document.components[0].regions?.tab3?.[0]?.name).toBe("textField1")

    await page.getByTestId("designer-undo").click()
    await expect(outline(page, "tabs1-tab3")).toHaveText("Extra")
    await expect(outline(page, "textField1")).not.toHaveAttribute("data-hidden")
    await page.getByTestId("canvas-switch-tabs1-tab3").click()
    await expect(canvas(page, "textField1")).toBeVisible()
  })

  test("choosing a tab on the canvas shows its region, which takes drops", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Tabs on the canvas")
    await openDesigner(page, id)
    await toolbox(page, "tabs").click()
    await page.getByTestId("canvas-switch-tabs1-tab2").click()
    await expect(outline(page, "tabs1")).toHaveAttribute("aria-selected", "true")
    await dragAndDrop(
      page,
      toolbox(page, "switch"),
      await pointIn(page.getByTestId("drop-target-tabs1-tab2")),
    )
    const form = await stored(page, request, id)
    expect(form.document.components[0].regions?.tab2?.[0]?.name).toBe("switch1")
  })
})

/** Whether the element with focus shows the focus ring. */
const focusRing = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return null
    const style = getComputedStyle(element)
    return {
      testId: element.getAttribute("data-testid"),
      hasRing: style.outlineStyle === "solid" && parseFloat(style.outlineWidth) >= 2,
    }
  })

async function tabTo(page: Page, testId: string, limit = 80) {
  for (let presses = 0; presses < limit; presses++) {
    await page.keyboard.press("Tab")
    const now = await focusRing(page)
    expect(now?.hasRing, `focus ring on ${now?.testId}`).toBe(true)
    if (now?.testId === testId) return presses + 1
  }
  throw new Error(`Tab never reached ${testId}.`)
}

test.describe("C3-14 Keyboard", () => {
  test("toolbox, add, label, style and undo, without the mouse", async ({ page, request }) => {
    const id = await createForm(request, "Keyboard", [field("alpha")])
    await openDesigner(page, id)

    // The toolbox is one Tab stop: the first item, then straight out of it.
    await tabTo(page, "toolbox-item-text-field")
    await page.keyboard.press("Tab")
    expect((await focusRing(page))?.testId).not.toMatch(/^toolbox-item-/)
    await page.keyboard.press("Shift+Tab")
    expect((await focusRing(page))?.testId).toBe("toolbox-item-text-field")

    // The arrow keys move to an item; Enter adds it.
    await page.keyboard.press("ArrowDown")
    await expect(toolbox(page, "text-area")).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(liveRegion(page)).toHaveText(
      "Added Text area textArea1 at position 2 of 2 in the form.",
    )

    // On to the label, and type a new one.
    await tabTo(page, "props-setting-label")
    await page.keyboard.press("Control+a")
    await page.keyboard.type("Comments")
    await expect(drawn(page, "textArea1")).toContainText("Comments")

    // Leaving the field ends the run: it is said once, with the final value.
    await page.keyboard.press("Tab")
    await expect(liveRegion(page)).toHaveText("Label of textArea1: “Comments”.")

    // On to the Appearance editor: open the root slot, and give it a background.
    await tabTo(page, "props-slot-root")
    await page.keyboard.press("Enter")
    await tabTo(page, "props-style-root-background")
    await page.keyboard.press("Enter")
    // The swatches are one Tab stop (Phase 4, section 6): the arrow keys move between them.
    await expect(page.getByTestId("props-token-foreground")).toBeFocused()
    while ((await focusRing(page))?.testId !== "props-token-muted") {
      await page.keyboard.press("ArrowRight")
      expect((await focusRing(page))?.hasRing).toBe(true)
    }
    await page.keyboard.press("Enter")
    await expect(liveRegion(page)).toHaveText("Background of root of textArea1: the muted colour.")
    await expect
      .poll(() => computed(drawn(page, "textArea1"), "backgroundColor"))
      .toBe(await tokenColour(page, "muted"))

    await page.keyboard.press("Control+z")
    await expect(liveRegion(page)).toHaveText("Undid: Change background of root of textArea1.")
    await expect
      .poll(() => computed(drawn(page, "textArea1"), "backgroundColor"))
      .not.toBe(await tokenColour(page, "muted"))
    await page.keyboard.press("Control+z")
    await expect(liveRegion(page)).toHaveText("Undid: Change label of textArea1.")
    await expect(drawn(page, "textArea1")).toContainText("Text area")
  })
})

test.describe("C3-15 Small fixes from Phase 2", () => {
  test("the toolbox is one Tab stop, and the live region has role=status", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Small fixes", [field("alpha")])
    await openDesigner(page, id)
    const stops = await page
      .getByTestId("designer-toolbox")
      .locator("button")
      .evaluateAll((items) => items.filter((item) => (item as HTMLElement).tabIndex === 0).length)
    expect(stops).toBe(1)
    await expect(liveRegion(page)).toHaveAttribute("role", "status")
  })

  test("the selection outline sits a little outside the component", async ({ page, request }) => {
    const id = await createForm(request, "Outline spacing", [field("alpha")])
    await openDesigner(page, id)
    await canvas(page, "alpha").click()
    const box = (await canvas(page, "alpha").boundingBox())!
    const ring = (await canvas(page, "alpha").locator("[data-slot=canvas-outline]").boundingBox())!
    expect(box.x - ring.x).toBeGreaterThanOrEqual(3)
    expect(box.y - ring.y).toBeGreaterThanOrEqual(3)
  })
})
