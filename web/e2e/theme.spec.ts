import type { Locator, Page } from "@playwright/test"

import { expect, test } from "./support/fixtures.ts"

const html = (page: Page) => page.locator("html")

/** Relative luminance (0 black, 1 white) of an element's computed background. */
function backgroundLuminance(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    // Paint the colour to a canvas so any CSS colour syntax becomes plain RGB.
    const context = document.createElement("canvas").getContext("2d")!
    context.fillStyle = getComputedStyle(element).backgroundColor
    context.fillRect(0, 0, 1, 1)
    const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  })
}

test.describe("C0-5 Theme toggle", () => {
  test("light is the default on a first visit, even when the system prefers dark", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await page.goto("/")

    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/)
    expect(await backgroundLuminance(page.locator("body"))).toBeGreaterThan(0.9)
  })

  test("the toggle switches the whole app to dark, and dark survives a reload", async ({
    page,
  }) => {
    await page.goto("/")
    const surfaces = {
      page: page.locator("body"),
      sidebar: page.getByTestId("sidebar"),
      card: page.getByTestId("token-preview"),
      nestedCard: page.getByTestId("token-preview-card"),
    }
    for (const [name, surface] of Object.entries(surfaces)) {
      expect(await backgroundLuminance(surface), `${name} in light`).toBeGreaterThan(0.8)
    }

    await page.getByTestId("theme-toggle").click()

    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/)
    for (const [name, surface] of Object.entries(surfaces)) {
      await expect
        .poll(() => backgroundLuminance(surface), { message: `${name} in dark` })
        .toBeLessThan(0.05)
    }

    await page.reload()

    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/)
    for (const [name, surface] of Object.entries(surfaces)) {
      expect(await backgroundLuminance(surface), `${name} after reload`).toBeLessThan(0.05)
    }
  })

  test("toggling again returns to light, and light survives a reload", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("theme-toggle").click()
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/)

    await page.getByTestId("theme-toggle").click()
    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/)

    await page.reload()
    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/)
  })

  test("the theme carries across pages", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("theme-toggle").click()

    await page.getByTestId("nav-settings").click()
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/)

    await page.goto("/nope")
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/)
  })
})

test.describe("C0-8 Brand values applied", () => {
  test("the primary button is Shesha blue and the page is set in Inter", async ({ page }) => {
    await page.goto("/")
    await page.evaluate(() => document.fonts.ready)

    const primary = page.getByTestId("token-preview-primary")
    await expect(primary).toHaveCSS("background-color", "rgb(0, 59, 178)")

    const fontFamily = await page
      .locator("body")
      .evaluate((body) => getComputedStyle(body).fontFamily)
    expect(fontFamily).toMatch(/^Inter\b/)
    for (const testId of [
      "page-title",
      "token-preview-primary",
      "token-preview-input",
      "nav-home",
    ]) {
      const family = await page
        .getByTestId(testId)
        .evaluate((element) => getComputedStyle(element).fontFamily)
      expect(family, testId).toMatch(/^Inter\b/)
    }

    // The face is really loaded, not just named.
    expect(await page.evaluate(() => document.fonts.check("500 14px Inter"))).toBe(true)
  })

  test("the token preview shows its four samples", async ({ page }) => {
    await page.goto("/")

    const preview = page.getByTestId("token-preview")
    for (const sample of ["primary", "default", "input", "card"]) {
      await expect(preview.getByTestId(`token-preview-${sample}`)).toBeVisible()
    }
    await page.getByTestId("token-preview-input").fill("Hello")
    await expect(page.getByTestId("token-preview-input")).toHaveValue("Hello")
  })
})
