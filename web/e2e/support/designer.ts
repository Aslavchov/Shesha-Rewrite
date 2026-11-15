import type { APIRequestContext, Locator, Page } from "@playwright/test"

import { expect } from "./fixtures.ts"

/** Helpers for the designer's end-to-end tests (Phase 2, section 10). */

export type Instance = {
  id: string
  type: string
  name: string
  bind?: string
  settings?: Record<string, unknown>
  styles?: Record<string, Record<string, unknown>>
  regions?: Record<string, Instance[]>
}

/** An input with the id `c_<name>`, bound to its name. */
export const field = (name: string, type = "text-field"): Instance => ({
  id: `c_${name}`,
  type,
  name,
  bind: name,
  settings: { label: name },
})

export const columns = (
  name: string,
  regions: Record<string, Instance[]> = {},
  settings?: Record<string, unknown>,
): Instance => ({
  id: `c_${name}`,
  type: "columns",
  name,
  ...(settings ? { settings } : {}),
  ...(Object.keys(regions).length > 0 ? { regions } : {}),
})

export const container = (name: string, content: Instance[] = []): Instance => ({
  id: `c_${name}`,
  type: "container",
  name,
  ...(content.length > 0 ? { regions: { content } } : {}),
})

export type StoredForm = {
  id: string
  revision: number
  document: { name: string; components: Instance[] }
}

/** Creates a form through the API and returns its id. Each test designs a form of its own. */
export async function createForm(
  request: APIRequestContext,
  name: string,
  components: Instance[] = [],
): Promise<string> {
  const response = await request.post("/api/forms", {
    data: { document: { formatVersion: 1, name, components } },
  })
  expect(response.status()).toBe(201)
  return ((await response.json()) as StoredForm).id
}

export async function readForm(request: APIRequestContext, id: string): Promise<StoredForm> {
  const response = await request.get(`/api/forms/${id}`)
  expect(response.status()).toBe(200)
  return (await response.json()) as StoredForm
}

/** The names of a stored form's instances as nested lists, to compare layouts at a glance. */
export function layoutOf(components: Instance[]): unknown[] {
  return components.map((instance) => {
    const regions = Object.entries(instance.regions ?? {})
    if (regions.length === 0) return instance.name
    return {
      [instance.name]: Object.fromEntries(
        regions.map(([name, children]) => [name, layoutOf(children)]),
      ),
    }
  })
}

export async function openDesigner(page: Page, id: string) {
  await page.goto(`/designer/${id}`)
  await expect(page.getByTestId("designer-page")).toBeVisible()
  await expect(page.getByTestId("designer-canvas")).toHaveAttribute("data-mode", "design")
}

export const saveStatus = (page: Page) => page.getByTestId("designer-save-status")

/** Waits until everything changed so far has been stored. */
export async function waitUntilSaved(page: Page) {
  await expect(saveStatus(page)).toHaveAttribute("data-status", "saved")
}

/** The names of the instances on the canvas, in the order they are drawn: document order. */
export const canvasOrder = (page: Page) =>
  page
    .getByTestId("designer-canvas")
    .locator("[data-canvas-item]")
    .evaluateAll((items) =>
      items.map((item) => (item.getAttribute("data-testid") ?? "").replace(/^canvas-/, "")),
    )

/** The rows of the outline, top to bottom: instance names, and region rows as `parent-region`. */
export const outlineOrder = (page: Page) =>
  page
    .getByTestId("designer-outline")
    .locator("[data-row]")
    .evaluateAll((rows) =>
      rows.map((row) => (row.getAttribute("data-testid") ?? "").replace(/^outline-/, "")),
    )

export type Point = { x: number; y: number }

/** A point of an element: `fx` and `fy` run from 0 at its left and top to 1 at its right and bottom. */
export async function pointIn(locator: Locator, fx = 0.5, fy = 0.5): Promise<Point> {
  const box = await locator.boundingBox()
  if (!box) throw new Error("The element is not on screen.")
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}

/** Two animation frames: enough for the designer to follow the pointer and redraw. */
export const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )

/**
 * Presses on `from` and moves the pointer to `to`, without letting go: the
 * drag is in progress when this returns. Finish it with `page.mouse.up()`.
 */
export async function dragTo(page: Page, from: Locator | Point, to: Point) {
  // A toolbox item may be below the fold of the toolbox.
  if (!("x" in from)) await from.scrollIntoViewIfNeeded()
  const start = "x" in from ? from : await pointIn(from)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  // A little way first: a press only becomes a drag once the pointer has travelled.
  await page.mouse.move(start.x + 6, start.y + 6, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await settle(page)
}

/** Drags `from` to `to` and drops it there. */
export async function dragAndDrop(page: Page, from: Locator | Point, to: Point) {
  await dragTo(page, from, to)
  await page.mouse.up()
  await settle(page)
}

export const dropIndicator = (page: Page) => page.getByTestId("drop-indicator")

export const liveRegion = (page: Page) => page.getByTestId("designer-live")
