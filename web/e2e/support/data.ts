import type { APIRequestContext, Locator, Page } from "@playwright/test"

import { expect, test as base } from "./fixtures.ts"
import { type AppServer, freePort, removeInstall, startServer } from "./server.ts"

/**
 * Helpers for the Phase 5 tests: entities, rows and bound forms.
 *
 * Every Phase 5 test changes data (definitions, rows), and several change the
 * seeded Person itself. So each one gets a server of its own, freshly started
 * with --demo, and the worker's shared server is left as the earlier phases'
 * tests expect it.
 */
export const test = base.extend<{ fresh: AppServer }>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern here.
  fresh: async ({}, provide) => {
    const server = await startServer(["--demo", "--port", String(await freePort())])
    await provide(server)
    await server.stop()
    removeInstall(server.dir)
  },
  baseURL: async ({ fresh }, provide) => {
    await provide(fresh.url)
  },
})

export { expect }

/** The ids `--demo` gives the seeded rows and forms (spec section 7). */
export const PERSON = (number: number) => `person-${String(number).padStart(2, "0")}`
export const ORGANISATION = (number: number) => `organisation-${number}`

export const table = (page: Page, name = "people") => page.getByTestId(`table-${name}`)
export const pageStatus = (page: Page) => page.getByTestId("table-page-status")

/** The ids of the rows on screen, top to bottom. */
export const rowIds = (page: Page) =>
  page
    .locator('[data-testid^="table-row-"]')
    .evaluateAll((rows) =>
      rows.map((row) => (row.getAttribute("data-testid") ?? "").replace(/^table-row-/, "")),
    )

/** The text of one column on screen, top to bottom. */
export const columnText = (page: Page, property: string) =>
  page
    .locator(`[data-testid^="table-row-"] td[data-column="${property}"]`)
    .evaluateAll((cells) => cells.map((cell) => (cell.textContent ?? "").trim()))

export async function openPeople(page: Page) {
  await page.goto("/forms/people")
  await expect(table(page)).toBeVisible()
  await expect(pageStatus(page)).toHaveText("1–10 of 50")
}

/** Waits until the table shows what it was last asked for. */
export async function tableSettled(page: Page) {
  await expect(page.getByTestId("table-scroll")).toHaveAttribute("aria-busy", "false")
}

export type Row = {
  id: string
  revision: number
  display: string
  values: Record<string, string | number | boolean | null>
  references: Record<string, string>
}

export async function readRow(
  request: APIRequestContext,
  entity: string,
  id: string,
): Promise<Row> {
  const response = await request.get(`/api/data/${entity}/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as Row
}

export async function query(
  request: APIRequestContext,
  entity: string,
  body: Record<string, unknown>,
): Promise<{ rows: Row[]; total: number }> {
  const response = await request.post(`/api/data/${entity}/query`, { data: body })
  expect(response.status(), await response.text()).toBe(200)
  return (await response.json()) as { rows: Row[]; total: number }
}

/** Chooses an option from a Base UI select, by the text it shows. */
export async function choose(page: Page, trigger: Locator, option: string | RegExp) {
  await trigger.click()
  await page.getByRole("option", { name: option }).click()
  await expect(page.getByRole("listbox")).toHaveCount(0)
}

export const saveStatus = (page: Page) => page.getByTestId("form-save-status")
