import type { Page } from "@playwright/test"

import {
  choose,
  columnText,
  expect,
  openPeople,
  ORGANISATION,
  PERSON,
  pageStatus,
  query,
  readRow,
  rowIds,
  saveStatus,
  table,
  tableSettled,
  test,
} from "./support/data.ts"
import { openDesigner, settle, waitUntilSaved } from "./support/designer.ts"

/**
 * Phase 5: entities, binding and CRUD (spec section 12, checks C5-1 to C5-18).
 * Each test has a server of its own, freshly seeded with --demo (see
 * support/data.ts), because each one changes data.
 */

test.afterEach(({ consoleProblems }) => {
  expect(consoleProblems).toEqual([])
})

const byText = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" })

async function openEntity(page: Page, name: string) {
  await page.goto("/entities")
  await expect(page.getByTestId("entities-page")).toBeVisible()
  await page.getByTestId(`entity-${name}`).click()
  await expect(page.getByTestId("entity-name")).toHaveValue(name)
}

async function openPerson(page: Page, id: string) {
  await page.goto(`/forms/person/${id}`)
  await expect(page.getByTestId("field-surname-control")).toBeVisible()
}

test.describe("Entities page", () => {
  test("C5-1 shows the seeded entities and reference list with their properties, types and settings", async ({
    page,
  }) => {
    await page.goto("/entities")
    await expect(page.getByTestId("page-title")).toHaveText("Entities")
    await expect(page.getByTestId("entity-organisation")).toContainText("1 property, 8 rows")
    await expect(page.getByTestId("entity-person")).toContainText("8 properties, 50 rows")

    await page.getByTestId("entity-person").click()
    await expect(page.getByTestId("entity-display-name")).toHaveValue("Person")
    await expect(page.getByTestId("entity-name")).toBeDisabled()
    await expect(page.getByTestId("entity-display-property")).toHaveText("Surname")
    await expect(page.getByTestId("entity-default-form")).toHaveText("Person")

    const types: Record<string, RegExp> = {
      firstName: /^Text, at most 50 characters$/,
      surname: /^Text, at most 50 characters$/,
      email: /^Text, at most 254 characters$/,
      dateOfBirth: /^Date$/,
      dependants: /^Number, whole, 0 to 20$/,
      status: /^Reference list: Person status$/,
      organisation: /^Reference: Organisation$/,
      notes: /^Text, several lines$/,
    }
    for (const [name, type] of Object.entries(types)) {
      await expect(page.getByTestId(`property-${name}-type`)).toHaveText(type)
    }
    await expect(page.getByTestId("property-firstName")).toContainText("Required")
    await expect(page.getByTestId("property-surname")).toContainText("Display property")
    // Every row's system properties are shown, and cannot be edited.
    for (const system of ["id", "createdAt", "updatedAt", "revision"]) {
      await expect(page.getByTestId(`property-system-${system}`)).toBeVisible()
    }

    await page.getByTestId("reflists-tab").click()
    await page.getByTestId("reflist-personStatus").click()
    const labels = ["Active", "Pending", "Inactive"]
    const values = ["active", "pending", "inactive"]
    for (const [index, value] of values.entries()) {
      await expect(page.getByTestId(`reflist-item-${value}-label`)).toHaveValue(labels[index])
    }
    await expect(page.getByTestId("reflist-item-active-colour")).toHaveText("Success")
    await expect(page.getByTestId("reflist-item-pending-colour")).toHaveText("Warning")
    await expect(page.getByTestId("reflist-item-inactive-colour")).toHaveText("Neutral")
  })

  test("C5-2 a new entity with a new list gets a data API that checks every row", async ({
    page,
    request,
  }) => {
    await page.goto("/entities")

    // The fuel list first, so the entity can use it.
    await page.getByTestId("reflists-tab").click()
    await page.getByTestId("reflist-new").click()
    await page.getByTestId("reflist-display-name").fill("Fuel")
    await expect(page.getByTestId("reflist-name")).toHaveValue("fuel")
    for (const label of ["Petrol", "Diesel", "Electric"]) {
      await page.getByTestId("reflist-item-new").click()
      await page.locator("[data-item-label]").last().fill(label)
    }
    await page.getByTestId("reflist-save").click()
    await expect(page.getByTestId("reflist-fuel")).toBeVisible()
    await expect(page.getByTestId("reflist-save-status")).toHaveText("Saved")

    // Then the entity: its name is made from its display name.
    await page.getByTestId("entities-tab").click()
    await page.getByTestId("entities-new").click()
    await page.getByTestId("entity-display-name").fill("Vehicle")
    await expect(page.getByTestId("entity-name")).toHaveValue("vehicle")
    await page.getByTestId("entity-save").click()
    await expect(page.getByTestId("entity-vehicle")).toBeVisible()
    await expect(page.getByTestId("entity-name")).toBeDisabled()

    await page.getByTestId("property-new").click()
    await page.getByTestId("property-display-name").fill("Registration")
    await expect(page.getByTestId("property-name")).toHaveValue("registration")
    await page.getByTestId("property-max-length").fill("10")
    await page.getByTestId("property-required").click()
    await page.getByTestId("property-save").click()
    await expect(page.getByTestId("property-registration-type")).toHaveText(
      "Text, at most 10 characters",
    )

    await page.getByTestId("property-new").click()
    await page.getByTestId("property-display-name").fill("Year")
    await choose(page, page.getByTestId("property-type"), "Number")
    await page.getByTestId("property-whole").click()
    await page.getByTestId("property-min").fill("1900")
    await page.getByTestId("property-max").fill("2100")
    await page.getByTestId("property-save").click()
    await expect(page.getByTestId("property-year-type")).toHaveText("Number, whole, 1900 to 2100")

    await page.getByTestId("property-new").click()
    await page.getByTestId("property-display-name").fill("Fuel")
    await choose(page, page.getByTestId("property-type"), "Reference list")
    await choose(page, page.getByTestId("property-reference-list"), "Fuel")
    await page.getByTestId("property-save").click()
    await expect(page.getByTestId("property-fuel-type")).toHaveText("Reference list: Fuel")

    // A valid row is stored.
    const valid = await request.post("/api/data/vehicle", {
      data: { values: { registration: "CA 123-456", year: 2019, fuel: "electric" } },
    })
    expect(valid.status()).toBe(201)
    const stored = (await valid.json()) as { id: string }
    expect((await readRow(request, "vehicle", stored.id)).values).toEqual({
      registration: "CA 123-456",
      year: 2019,
      fuel: "electric",
    })

    // An invalid one is refused, with a detail per bad property.
    const invalid = await request.post("/api/data/vehicle", {
      data: { values: { registration: "FAR TOO LONG A PLATE", year: 1800.5, fuel: "coal" } },
    })
    expect(invalid.status()).toBe(400)
    const body = (await invalid.json()) as {
      error: { code: string; details: { path: string; message: string }[] }
    }
    expect(body.error.code).toBe("invalid_row")
    expect(body.error.details.map((detail) => detail.path).sort()).toEqual([
      "fuel",
      "registration",
      "year",
    ])
    expect((await query(request, "vehicle", {})).total).toBe(1)
  })

  test("C5-3 changes are safe: a property is added, a type change is refused, a delete names its forms first", async ({
    page,
    request,
    expectRefusal,
  }) => {
    await openEntity(page, "person")

    await page.getByTestId("property-new").click()
    await page.getByTestId("property-display-name").fill("Nickname")
    await page.getByTestId("property-save").click()
    await expect(page.getByTestId("property-nickname")).toBeVisible()
    expect((await readRow(request, "person", PERSON(1))).values.nickname).toBeNull()

    // Email holds text in every row: it cannot become a number.
    expectRefusal(409)
    await page.getByTestId("property-email").click()
    await choose(page, page.getByTestId("property-type"), "Number")
    await page.getByTestId("property-save").click()
    const error = page.getByTestId("property-error")
    await expect(error).toContainText("This change would lose data")
    await expect(error).toContainText("Email has a value in 50 rows")
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByTestId("property-email-type")).toHaveText(/^Text/)

    // Deleting notes names the forms that use it, and asks first.
    await page.getByTestId("property-notes").click()
    await page.getByTestId("property-delete").click()
    const dialog = page.getByTestId("confirm-dialog")
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("confirm-usage")).toHaveText(/Used by the form Person,/)
    await expect(page.getByTestId("confirm-cancel")).toBeFocused()
    await page.getByTestId("confirm-cancel").click()
    await expect(dialog).toHaveCount(0)
    await page.getByTestId("property-delete").click()
    await page.getByTestId("confirm-ok").click()
    await expect(page.getByTestId("property-notes")).toHaveCount(0)
    expect((await readRow(request, "person", PERSON(1))).values).not.toHaveProperty("notes")
  })
})

test.describe("People list", () => {
  test("C5-4 pages through 50 people, sorts by surname both ways and searches", async ({
    page,
    request,
  }) => {
    await openPeople(page)
    expect(await rowIds(page)).toHaveLength(10)

    const seen = new Set<string>()
    for (const status of ["1–10", "11–20", "21–30", "31–40", "41–50"]) {
      await expect(pageStatus(page)).toHaveText(`${status} of 50`)
      await tableSettled(page)
      for (const id of await rowIds(page)) seen.add(id)
      if (status !== "41–50") await page.getByTestId("table-page-next").click()
    }
    expect(seen.size).toBe(50)
    await expect(page.getByTestId("table-page-next")).toHaveAttribute("aria-disabled", "true")
    await page.getByTestId("table-page-prev").click()
    await expect(pageStatus(page)).toHaveText("31–40 of 50")

    const everyone = (await query(request, "person", { select: ["surname"], pageSize: 50 })).rows
    const surnames = everyone.map((row) => String(row.values.surname)).sort(byText)

    const sort = page.getByTestId("table-sort-surname")
    await sort.click()
    await expect(page.locator("th", { has: sort })).toHaveAttribute("aria-sort", "ascending")
    await expect(pageStatus(page)).toHaveText("1–10 of 50")
    await tableSettled(page)
    expect(await columnText(page, "surname")).toEqual(surnames.slice(0, 10))
    await sort.click()
    await expect(page.locator("th", { has: sort })).toHaveAttribute("aria-sort", "descending")
    await tableSettled(page)
    expect(await columnText(page, "surname")).toEqual([...surnames].reverse().slice(0, 10))

    const search = async (text: string, expected: number) => {
      await page.getByTestId("table-search").fill(text)
      await expect(pageStatus(page)).toHaveText(
        expected === 0 ? "No rows" : `1–${Math.min(expected, 10)} of ${expected}`,
      )
      await tableSettled(page)
    }

    await search("smi", 3)
    expect((await columnText(page, "surname")).sort(byText)).toEqual(["Goldsmith", "Smit", "Smith"])

    const acacia = await query(request, "person", {
      filter: [{ property: "organisation", op: "eq", value: ORGANISATION(1) }],
    })
    await search("Acacia Logistics", acacia.total)
    expect(new Set(await columnText(page, "organisation"))).toEqual(new Set(["Acacia Logistics"]))

    await search("Pending", 10)
    expect(new Set(await columnText(page, "status"))).toEqual(new Set(["Pending"]))
  })

  test("C5-5 filters by status and a date of birth range, then searches as well", async ({
    page,
    request,
  }) => {
    await openPeople(page)
    await page.getByTestId("table-filters").click()
    await choose(page, page.getByTestId("table-filter-status"), "Pending")
    await page.getByTestId("table-filter-dateOfBirth-from").fill("1960-01-01")
    await page.getByTestId("table-filter-dateOfBirth-to").fill("1990-12-31")

    const filter = [
      { property: "status", op: "eq", value: "pending" },
      { property: "dateOfBirth", op: "gte", value: "1960-01-01" },
      { property: "dateOfBirth", op: "lte", value: "1990-12-31" },
    ]
    const expected = await query(request, "person", { filter, pageSize: 50 })
    expect(expected.total).toBeGreaterThan(1)
    await expect(pageStatus(page)).toHaveText(`1–${expected.total} of ${expected.total}`)
    await tableSettled(page)
    expect((await rowIds(page)).sort()).toEqual(expected.rows.map((row) => row.id).sort())
    await expect(page.getByTestId("table-filters-count")).toHaveText(/^2/)

    // A search narrows the filtered rows further.
    const first = String(expected.rows[0].values.surname)
    const narrowed = await query(request, "person", { filter, search: first, pageSize: 50 })
    await page.getByTestId("table-search").fill(first)
    await expect(pageStatus(page)).toHaveText(`1–${narrowed.total} of ${narrowed.total}`)
    await tableSettled(page)
    expect((await rowIds(page)).sort()).toEqual(narrowed.rows.map((row) => row.id).sort())
  })

  test("C5-17 at 390 px the table scrolls inside itself and the page never sideways", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openPeople(page)
    const scroller = page.getByTestId("table-scroll")
    const inside = await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)
    expect(inside).toBe(true)
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(sideways).toBe(false)
  })
})

test.describe("Bound forms", () => {
  test("C5-6 opens a row with its values, saves a change that persists, and goes back to the list", async ({
    page,
    request,
  }) => {
    await openPeople(page)
    // A press anywhere on the row opens it.
    await page
      .getByTestId(`table-row-${PERSON(2)}`)
      .locator('td[data-column="email"]')
      .click()
    await expect(page).toHaveURL(`/forms/person/${PERSON(2)}`)

    const before = await readRow(request, "person", PERSON(2))
    await expect(page.getByTestId("page-title")).toHaveText(before.display)
    await expect(page.getByTestId("field-firstName-control")).toHaveValue(
      String(before.values.firstName),
    )
    await expect(page.getByTestId("field-status-control")).toContainText("Active")
    await expect(page.getByTestId("field-organisation-control")).toHaveValue(
      before.references.organisation,
    )

    await page.getByTestId("field-surname-control").fill("Naidoo-Khan")
    await page.getByTestId("field-save").click()
    await expect(saveStatus(page)).toHaveText("Saved")
    expect((await readRow(request, "person", PERSON(2))).values.surname).toBe("Naidoo-Khan")

    await page.reload()
    await expect(page.getByTestId("field-surname-control")).toHaveValue("Naidoo-Khan")

    await page.goBack()
    await page.goForward()
    await page.getByTestId("form-back").click()
    await expect(table(page)).toBeVisible()
    await page.getByTestId("table-search").fill("Naidoo-Khan")
    await expect(pageStatus(page)).toHaveText("1–1 of 1")
    await expect(page.getByTestId(`table-row-${PERSON(2)}`)).toContainText("Naidoo-Khan")
  })

  test("C5-7 the server's error shows on the email field and focus moves there", async ({
    page,
    expectRefusal,
  }) => {
    await openEntity(page, "person")
    await page.getByTestId("property-email").click()
    await page.getByTestId("property-required").click()
    await page.getByTestId("property-save").click()
    await expect(page.getByTestId("property-email")).toContainText("Required")

    // The form itself does not require email: only the server does now.
    expectRefusal(400)
    await openPerson(page, PERSON(3))
    await page.getByTestId("field-email-control").fill("")
    await page.getByTestId("field-save").click()
    await expect(page.getByTestId("field-email-error")).toHaveText("This field is required")
    await expect(page.getByTestId("field-email-control")).toBeFocused()
    await expect(page.getByTestId("field-email-control")).toHaveAttribute("aria-invalid", "true")
    await expect(saveStatus(page)).toContainText("Not saved")
  })

  test("C5-8 a save on a row changed in another tab says so and offers a reload", async ({
    page,
    context,
    request,
    expectRefusal,
  }) => {
    const other = await context.newPage()
    await openPerson(page, PERSON(4))
    await openPerson(other, PERSON(4))

    await other.bringToFront()
    await other.getByTestId("field-surname-control").fill("First tab")
    await other.getByTestId("field-save").click()
    await expect(saveStatus(other)).toHaveText("Saved")

    expectRefusal(409)
    await page.bringToFront()
    await page.getByTestId("field-surname-control").fill("Second tab")
    await page.getByTestId("field-save").click()
    await expect(page.getByTestId("form-conflict")).toBeVisible()
    await expect(page.getByTestId("form-conflict")).toContainText("changed somewhere else")
    expect((await readRow(request, "person", PERSON(4))).values.surname).toBe("First tab")

    await page.getByTestId("form-conflict-reload").click()
    await expect(page.getByTestId("form-conflict")).toHaveCount(0)
    await expect(page.getByTestId("field-surname-control")).toHaveValue("First tab")
    await other.close()
  })

  test("C5-9 New creates a row, the address carries its id, and it appears in the list", async ({
    page,
    request,
  }) => {
    await openPeople(page)
    await page.getByTestId("table-new").click()
    await expect(page).toHaveURL("/forms/person")
    await expect(page.getByTestId("page-title")).toHaveText("New person")

    await page.getByTestId("field-firstName-control").fill("Ayanda")
    await page.getByTestId("field-surname-control").fill("Zwane")
    await page.getByTestId("field-dateOfBirth-control").fill("14 March 1990")
    await choose(page, page.getByTestId("field-status-control"), "Pending")
    await page.getByTestId("field-save").click()

    await expect(page).toHaveURL(/\/forms\/person\/[0-9a-f]{32}$/)
    await expect(saveStatus(page)).toHaveText("Created and saved")
    const id = page.url().split("/").pop() ?? ""
    const stored = await readRow(request, "person", id)
    expect(stored.values).toMatchObject({
      firstName: "Ayanda",
      surname: "Zwane",
      dateOfBirth: "1990-03-14",
      status: "pending",
    })

    await page.reload()
    await expect(page.getByTestId("field-surname-control")).toHaveValue("Zwane")
    await page.getByTestId("form-back").click()
    await page.getByTestId("table-search").fill("Zwane")
    await expect(page.getByTestId(`table-row-${id}`)).toBeVisible()
  })

  test("C5-10 delete asks by name; cancel keeps, OK removes; a referenced organisation is refused", async ({
    page,
    request,
    expectRefusal,
  }) => {
    await openPeople(page)
    const smith = await readRow(request, "person", PERSON(1))
    await page.getByTestId(`table-delete-${PERSON(1)}`).click()
    const dialog = page.getByTestId("confirm-dialog")
    await expect(dialog).toContainText(`Delete ${smith.display}?`)
    await page.getByTestId("confirm-cancel").click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId(`table-row-${PERSON(1)}`)).toBeVisible()

    await page.getByTestId(`table-delete-${PERSON(1)}`).click()
    await page.getByTestId("confirm-ok").click()
    await expect(page.getByTestId(`table-row-${PERSON(1)}`)).toHaveCount(0)
    await expect(pageStatus(page)).toHaveText("1–10 of 49")
    expect((await request.get(`/api/data/person/${PERSON(1)}`)).status()).toBe(404)

    // A table of organisations, to delete one that people refer to.
    const created = await request.post("/api/forms", {
      data: {
        document: {
          formatVersion: 1,
          name: "Organisations",
          components: [
            {
              id: "c_orgs",
              type: "data-table",
              name: "orgs",
              settings: { entity: "organisation", allowDelete: true, allowNew: false },
            },
          ],
        },
      },
    })
    const form = (await created.json()) as { id: string }
    await page.goto(`/forms/${form.id}`)
    await expect(table(page, "orgs")).toBeVisible()
    expectRefusal(409)
    await page.getByTestId(`table-delete-${ORGANISATION(1)}`).click()
    await expect(dialog).toContainText("Delete Acacia Logistics?")
    await page.getByTestId("confirm-ok").click()
    await expect(page.getByTestId("confirm-error")).toContainText(
      "Acacia Logistics cannot be deleted",
    )
    await expect(page.getByTestId("confirm-error")).toContainText("of Person refer to it")
    await page.getByTestId("confirm-cancel").click()
    await expect(page.getByTestId(`table-row-${ORGANISATION(1)}`)).toBeVisible()
  })

  test("C5-13 reference list items follow a new order and label; a retired item stays on rows that hold it", async ({
    page,
  }) => {
    await page.goto("/entities")
    await page.getByTestId("reflists-tab").click()
    await page.getByTestId("reflist-personStatus").click()
    await page.getByTestId("reflist-item-inactive-up").click()
    await page.getByTestId("reflist-item-active-label").fill("Current")
    await page.getByTestId("reflist-item-pending-retire").click()
    await page.getByTestId("reflist-save").click()
    await expect(page.getByTestId("reflist-save-status")).toHaveText("Saved")

    // Person 1 is Active: Pending is no longer offered, and the order follows the list.
    await openPerson(page, PERSON(1))
    await expect(page.getByTestId("field-status-control")).toContainText("Current")
    await page.getByTestId("field-status-control").click()
    const options = page.locator('[data-testid="field-status-option"][data-value]')
    await expect(options).toHaveCount(2)
    expect(await options.allTextContents()).toEqual(["Current", "Inactive"])
    await page.keyboard.press("Escape")

    // Person 7 is Pending: it still shows, marked retired.
    await openPerson(page, PERSON(7))
    await expect(page.getByTestId("field-status-control")).toContainText("Pending")
    await expect(page.getByTestId("field-status-control")).toContainText("(retired)")
    await page.getByTestId("field-status-control").click()
    await expect(options).toHaveCount(3)
    await page.keyboard.press("Escape")

    await openPeople(page)
    await page.getByTestId("table-search").fill("Pending")
    await expect(pageStatus(page)).toHaveText("1–10 of 10")
  })

  test("C5-14 the entity picker finds an organisation by typing, chosen with the keyboard", async ({
    page,
    request,
  }) => {
    // Person 13 has no organisation.
    await openPerson(page, PERSON(13))
    const picker = page.getByTestId("field-organisation-control")
    await expect(picker).toHaveValue("")
    await picker.click()
    await picker.fill("fynb")
    await expect(page.getByRole("option", { name: "Fynbos Foods" })).toBeVisible()
    await expect(page.getByRole("option")).toHaveCount(1)
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(picker).toHaveValue("Fynbos Foods")

    await page.getByTestId("field-save").click()
    await expect(saveStatus(page)).toHaveText("Saved")
    expect((await readRow(request, "person", PERSON(13))).values.organisation).toBe(ORGANISATION(6))
    await page.reload()
    await expect(page.getByTestId("field-organisation-control")).toHaveValue("Fynbos Foods")
  })

  test("C5-15 a status shows its label in its colour, in the table and the form, light and dark", async ({
    page,
  }) => {
    const colourOf = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => getComputedStyle(element).color)
    const tag = `[data-testid="table-row-${PERSON(1)}"] [data-slot="status-tag"]`

    await openPeople(page)
    await expect(page.locator(tag)).toHaveText("Active")
    await expect(page.locator(tag)).toHaveAttribute("data-color", "success")
    const light = await colourOf(tag)
    const success = await page.evaluate(() => {
      const probe = document.createElement("span")
      probe.className = "text-success"
      document.body.append(probe)
      const colour = getComputedStyle(probe).color
      probe.remove()
      return colour
    })
    expect(light).toBe(success)

    await page.getByTestId("theme-toggle").click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    const dark = await colourOf(tag)
    expect(dark).not.toBe(light)

    await openPerson(page, PERSON(1))
    const inForm = '[data-testid="field-status-control"] [data-slot="status-tag"]'
    await expect(page.locator(inForm)).toHaveText("Active")
    expect(await colourOf(inForm)).toBe(dark)
  })

  test("C5-16 with the keyboard alone: sort, page, open a row, save, go back, delete", async ({
    page,
  }) => {
    await openPeople(page)
    const live = page.getByTestId("table-live")
    const ring = async () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element)
        return style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0
      })

    await page.getByTestId("table-search").focus()
    // Search, Filters, New, then the table's own region, then the first header.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab")
    await expect(page.getByTestId("table-sort-firstName")).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.getByTestId("table-sort-surname")).toBeFocused()
    expect(await ring()).toBe(true)
    await page.keyboard.press("Enter")
    await expect(live).toHaveText("Sorted by Surname, ascending. 1–10 of 50.")

    await page.getByTestId("table-page-next").focus()
    await page.keyboard.press("Enter")
    await expect(pageStatus(page)).toHaveText("11–20 of 50")
    await expect(live).toHaveText("Page 2 of 5. 11–20 of 50.")
    expect(await ring()).toBe(true)

    const firstRow = page.locator('[data-testid^="table-open-"]').first()
    const id = ((await firstRow.getAttribute("data-testid")) ?? "").replace("table-open-", "")
    await firstRow.focus()
    expect(await ring()).toBe(true)
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(`/forms/person/${id}`)

    await page.getByTestId("field-notes-control").focus()
    await page.keyboard.type(" Typed without a mouse.")
    await page.getByTestId("field-surname-control").focus()
    // Enter in a text input submits the form.
    await page.keyboard.press("Enter")
    await expect(saveStatus(page)).toHaveText("Saved")

    await page.getByTestId("form-back").focus()
    expect(await ring()).toBe(true)
    await page.keyboard.press("Enter")
    await expect(table(page)).toBeVisible()
    // The list is as it was left: sorted, on page 2.
    await expect(pageStatus(page)).toHaveText("11–20 of 50")

    await page.getByTestId(`table-delete-${id}`).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("confirm-cancel")).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.getByTestId("confirm-ok")).toBeFocused()
    expect(await ring()).toBe(true)
    await page.keyboard.press("Enter")
    await expect(page.getByTestId(`table-row-${id}`)).toHaveCount(0)
    await expect(live).toContainText("Deleted")
    await expect(page.getByTestId("table-scroll")).toBeFocused()
  })
})

test.describe("Binding in the designer", () => {
  async function newBoundForm(page: Page, request: Parameters<typeof readRow>[0]) {
    const response = await request.post("/api/forms", {
      data: { document: { formatVersion: 1, name: "Bound", components: [] } },
    })
    const { id } = (await response.json()) as { id: string }
    await openDesigner(page, id)
    await choose(page, page.getByTestId("props-setting-entity"), "Person")
    await expect(page.getByTestId("designer-data-panel")).toBeVisible()
    return id
  }

  test("C5-11 properties become bound, labelled components with their limits", async ({
    page,
    request,
  }) => {
    const id = await newBoundForm(page, request)
    for (const name of ["dateOfBirth", "status", "organisation"]) {
      await page.getByTestId(`data-property-${name}`).click()
      await settle(page)
    }
    // Dragged onto the canvas this time.
    const firstName = page.getByTestId("data-property-firstName")
    const box = await page.getByTestId("designer-canvas").boundingBox()
    if (!box) throw new Error("No canvas.")
    await firstName.hover()
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20, { steps: 12 })
    await settle(page)
    await page.mouse.up()
    await settle(page)

    for (const name of ["dateOfBirth", "status", "organisation", "firstName"]) {
      await expect(page.getByTestId(`data-property-${name}`)).toHaveAttribute("data-placed", "true")
    }
    await expect(page.getByTestId("data-property-email")).not.toHaveAttribute("data-placed")
    await waitUntilSaved(page)

    const stored = (await (await request.get(`/api/forms/${id}`)).json()) as {
      document: { components: { type: string; bind: string; settings: unknown }[] }
    }
    const byBind = Object.fromEntries(stored.document.components.map((c) => [c.bind, c]))
    expect(byBind.dateOfBirth).toMatchObject({
      type: "date-picker",
      settings: { label: "Date of birth" },
    })
    expect(byBind.status).toMatchObject({
      type: "reference-list-select",
      settings: { label: "Status", referenceList: "personStatus" },
    })
    expect(byBind.organisation).toMatchObject({
      type: "entity-picker",
      settings: { label: "Organisation", entity: "organisation" },
    })
    expect(byBind.firstName).toMatchObject({
      type: "text-field",
      settings: { label: "First name", required: true, maxLength: 50 },
    })

    // Filled in, the select offers the three statuses.
    await page.goto(`/forms/${id}`)
    await expect(page.getByText("Date of birth")).toBeVisible()
    await page.getByTestId("field-status-control").click()
    const options = page.locator('[data-testid="field-status-option"][data-value]')
    expect(await options.allTextContents()).toEqual(["Active", "Pending", "Inactive"])
    await page.keyboard.press("Escape")
  })

  test("C5-12 a path with no property and a component of the wrong type are problems in plain words", async ({
    page,
    request,
  }) => {
    await newBoundForm(page, request)
    await page.getByTestId("data-property-firstName").click()
    await page.getByTestId("toolbox-item-text-field").click()

    // The first field's data path is changed to one Person does not have.
    await page.getByTestId("canvas-firstName").click()
    await page.getByTestId("props-bind").fill("nickname")
    await page.getByTestId("props-bind").press("Tab")
    await expect(page.getByTestId("props-problems")).toContainText(
      "Person has no property called “nickname”",
    )
    await expect(page.getByTestId("outline-problem-firstName")).toBeVisible()

    // A Text field bound to a date.
    await page.getByTestId("canvas-textField1").click()
    await page.getByTestId("props-bind").fill("dateOfBirth")
    await page.getByTestId("props-bind").press("Tab")
    await expect(page.getByTestId("props-problems")).toContainText(
      "Text field holds text, but Date of birth is a date. Use a Date picker for it.",
    )
    await expect(page.getByTestId("outline-problem-textField1")).toBeVisible()
  })
})

test("C5-18 bad queries get 400 with details, never 500", async ({ request }) => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["an unknown sort property", { sort: [{ property: "shoeSize" }] }, "sort[0].property"],
    [
      "a malformed filter",
      { filter: [{ property: "status", op: "contains", value: 1 }] },
      "filter[0].op",
    ],
    ["a filter that is not a list", { filter: { property: "surname" } }, "filter"],
    ["SQL-like search text", { search: "'; DROP TABLE forms; --" }, "search"],
    ["SQL as a property", { select: ["surname; DROP TABLE forms"] }, "select[0]"],
  ]
  for (const [what, body, path] of cases) {
    const response = await request.post("/api/data/person/query", { data: body })
    expect(response.status(), what).toBe(400)
    const { error } = (await response.json()) as {
      error: { code: string; details: { path: string }[] }
    }
    expect(error.code, what).toBe("invalid_query")
    expect(
      error.details.map((detail) => detail.path),
      what,
    ).toContain(path)
  }
  expect((await query(request, "person", {})).total).toBe(50)
})
