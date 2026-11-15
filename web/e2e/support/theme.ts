import type { APIRequestContext, Locator, Page } from "@playwright/test"

import { expect } from "./fixtures.ts"

/** Helpers for the theme's end-to-end tests (Phase 4, section 10). */

export type ThemeDocument = { formatVersion: 1; [key: string]: unknown }

export const EMPTY_THEME: ThemeDocument = { formatVersion: 1 }

type ThemeState = {
  published: { revision: number; document: ThemeDocument }
  draft: { revision: number; document: ThemeDocument }
  unpublished: boolean
}

export async function readTheme(request: APIRequestContext): Promise<ThemeState> {
  const response = await request.get("/api/theme/draft")
  expect(response.status()).toBe(200)
  return (await response.json()) as ThemeState
}

/** Saves a draft through the API and publishes it: the whole app then uses it. */
export async function publishTheme(request: APIRequestContext, document: ThemeDocument) {
  // A page that was just left may still send the save it had waiting; when
  // it lands between reading and writing, read again and write again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { draft } = await readTheme(request)
    const saved = await request.put("/api/theme/draft", {
      data: { revision: draft.revision, document },
    })
    if (saved.status() === 409) continue
    expect(saved.status()).toBe(200)
    const state = (await saved.json()) as ThemeState
    const published = await request.post("/api/theme/publish", {
      data: { revision: state.draft.revision },
    })
    if (published.status() === 409) continue
    expect(published.status()).toBe(200)
    return
  }
  throw new Error("The theme kept changing while it was being published.")
}

/**
 * Puts the built-in look back, published and as the draft. The theme is the
 * one thing every test of a worker shares, so every test that changes it
 * calls this afterwards. The page is closed first, so a save it had waiting
 * goes out before, not after.
 */
export async function restoreTheme(page: Page, request: APIRequestContext) {
  await page.goto("about:blank")
  await publishTheme(request, EMPTY_THEME)
}

export async function openThemes(page: Page) {
  await page.goto("/themes")
  await expect(page.getByTestId("theme-editor")).toBeVisible()
}

export const themeStatus = (page: Page) => page.getByTestId("theme-status")
export const themeSaveStatus = (page: Page) => page.getByTestId("theme-save-status")
export const preview = (page: Page) => page.getByTestId("theme-preview")

export async function waitUntilDraftSaved(page: Page) {
  await expect(themeSaveStatus(page)).toHaveAttribute("data-status", "saved")
}

/** Types a colour into a role's picker and closes it. */
export async function setColour(page: Page, testId: string, hex: string) {
  await page.getByTestId(testId).click()
  const field = page.getByTestId(`${testId}-hex`)
  await field.fill(hex)
  await page.keyboard.press("Escape")
  await expect(page.getByTestId(`${testId}-popup`)).toBeHidden()
}

/** Publishes from the editor and waits until it is done. */
export async function publishFromEditor(page: Page) {
  await page.getByTestId("theme-publish").click()
  await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
}

/** A computed style of an element, as the browser has it once its transitions are over. */
export async function styleOf(locator: Locator, property: string) {
  await settled(locator)
  return locator.evaluate(
    (element, name) => getComputedStyle(element).getPropertyValue(name),
    property,
  )
}

/** Waits until the element's transitions are over, so that a style read is the final one. */
function settled(locator: Locator) {
  // Only transitions: they end. A spinner's animation never does.
  return locator.evaluate((element) =>
    Promise.all(
      element
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined)),
    ).then(() => {}),
  )
}

/** Any CSS colour as `rgb(r, g, b)`, painted to a canvas so every syntax compares alike. */
export const rgbOf = async (locator: Locator, property: string) => {
  await settled(locator)
  return locator.evaluate((element, name) => {
    const context = document.createElement("canvas").getContext("2d")!
    context.fillStyle = getComputedStyle(element).getPropertyValue(name)
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data
    return `rgb(${r}, ${g}, ${b})`
  }, property)
}

/** WCAG contrast of two `rgb(r, g, b)` colours. */
export function contrast(one: string, other: string): number {
  const luminance = (colour: string) => {
    const [r, g, b] = (colour.match(/\d+/g) ?? []).slice(0, 3).map((part) => {
      const value = Number(part) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const a = luminance(one)
  const b = luminance(other)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** A hex colour as `rgb(r, g, b)`. */
export function rgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`
}

/** Whether the page scrolls sideways or any element is cut off at the right. */
export const overflowsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
