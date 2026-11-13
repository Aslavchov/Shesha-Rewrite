import type { Page } from "@playwright/test"

import { expect, NAV, test } from "./support/fixtures.ts"

/** The focused element's test id, and whether it shows a solid focus ring. */
function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return null
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      testId: element.getAttribute("data-testid"),
      hasRing:
        style.outlineStyle === "solid" &&
        parseFloat(style.outlineWidth) >= 2 &&
        !/rgba?\(0, 0, 0, 0\)|transparent/.test(style.outlineColor),
      isOnScreen: box.width > 1 && box.height > 1 && box.top >= 0 && box.left >= 0,
    }
  })
}

test.describe("C0-11 Keyboard", () => {
  test("Tab reaches the skip link first, then the navigation, then the theme toggle", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-version")).not.toBeEmpty()

    const expectedOrder = ["skip-link", ...NAV.map((item) => `nav-${item.id}`), "theme-toggle"]
    for (const testId of expectedOrder) {
      await page.keyboard.press("Tab")

      expect(await focused(page), testId).toEqual({ testId, hasRing: true, isOnScreen: true })
    }
  })

  test("every other focusable element on Home shows the focus ring too", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("app-version")).not.toBeEmpty()
    await page.getByTestId("theme-toggle").focus()

    for (const testId of [
      "token-preview-primary",
      "token-preview-outline",
      "token-preview-input",
    ]) {
      await page.keyboard.press("Tab")

      expect(await focused(page), testId).toEqual({ testId, hasRing: true, isOnScreen: true })
    }
  })

  test("the skip link is hidden until focused, and jumps to the main content", async ({ page }) => {
    await page.goto("/")
    const skipLink = page.getByTestId("skip-link")
    await expect(skipLink).not.toBeInViewport()

    await page.keyboard.press("Tab")
    await expect(skipLink).toBeFocused()
    await expect(skipLink).toBeInViewport()

    await page.keyboard.press("Enter")

    await expect(page.locator("main")).toBeFocused()
    // The next Tab lands inside the content, past the sidebar and header.
    await page.keyboard.press("Tab")
    expect((await focused(page))?.testId).toBe("token-preview-primary")
  })

  test("navigation works from the keyboard", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("nav-entities").focus()

    await page.keyboard.press("Enter")

    await expect(page).toHaveURL("/entities")
    await expect(page.getByTestId("page-title")).toHaveText("Entities")
  })

  test("the Not Found link and the mobile menu button show the focus ring", async ({ page }) => {
    await page.goto("/nope")
    await page.getByTestId("not-found-home-link").focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    expect(await focused(page)).toEqual({
      testId: "not-found-home-link",
      hasRing: true,
      isOnScreen: true,
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Shift+Tab")
    expect(await focused(page)).toEqual({
      testId: "nav-menu-button",
      hasRing: true,
      isOnScreen: true,
    })
  })
})
