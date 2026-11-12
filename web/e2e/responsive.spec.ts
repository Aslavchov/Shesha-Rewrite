import type { Page } from "@playwright/test"

import { expect, NAV, test } from "./support/fixtures.ts"

const hasHorizontalScroll = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement
    return root.scrollWidth > root.clientWidth
  })

test.describe("C0-10 Mobile width", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("the sidebar is hidden behind a menu button and opens as an overlay", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByTestId("sidebar")).toBeHidden()
    await expect(page.getByTestId("nav-menu-button")).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)

    await page.getByTestId("nav-menu-button").click()

    const sidebar = page.getByTestId("sidebar")
    await expect(sidebar).toBeVisible()
    for (const item of NAV) await expect(page.getByTestId(`nav-${item.id}`)).toBeVisible()
    // An overlay: it sits on top of the page inside a modal dialog, not beside the content.
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page.getByRole("dialog").getByTestId("sidebar")).toBeVisible()
    // It slides in from the left edge; wait for it to settle there.
    await expect.poll(async () => (await sidebar.boundingBox())?.x).toBe(0)
    expect((await sidebar.boundingBox())?.width).toBeLessThan(390)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("choosing a page from the overlay navigates and closes it", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("nav-menu-button").click()

    await page.getByTestId("nav-forms").click()

    await expect(page).toHaveURL("/forms")
    await expect(page.getByTestId("page-title")).toHaveText("Forms")
    await expect(page.getByTestId("sidebar")).toBeHidden()
  })

  test("Escape closes the overlay and returns focus to the menu button", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("nav-menu-button").click()
    await expect(page.getByTestId("sidebar")).toBeVisible()

    await page.keyboard.press("Escape")

    await expect(page.getByTestId("sidebar")).toBeHidden()
    await expect(page.getByTestId("nav-menu-button")).toBeFocused()
  })

  test("no page scrolls sideways", async ({ page }) => {
    for (const route of [...NAV.map((item) => item.path), "/nope"]) {
      await page.goto(route)
      await expect(page.getByTestId("page-title")).toBeVisible()

      expect(await hasHorizontalScroll(page), route).toBe(false)
    }
  })
})

test.describe("C0-10 Desktop width", () => {
  test("the sidebar is always shown and there is no menu button", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByTestId("sidebar")).toBeVisible()
    await expect(page.getByTestId("nav-menu-button")).toBeHidden()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("the layout switches at 768px", async ({ page }) => {
    await page.goto("/")

    await page.setViewportSize({ width: 767, height: 800 })
    await expect(page.getByTestId("sidebar")).toBeHidden()
    await expect(page.getByTestId("nav-menu-button")).toBeVisible()

    await page.setViewportSize({ width: 768, height: 800 })
    await expect(page.getByTestId("sidebar")).toBeVisible()
    await expect(page.getByTestId("nav-menu-button")).toBeHidden()
  })
})
