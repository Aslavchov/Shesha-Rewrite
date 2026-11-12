import { expect, NAV, test } from "./support/fixtures.ts"

test.describe("C0-2 Shell loads clean", () => {
  test("shows the shell, the sidebar and six navigation items with a clean console", async ({
    page,
    consoleProblems,
  }) => {
    await page.goto("/")

    await expect(page.getByTestId("app-shell")).toBeVisible()
    await expect(page.getByTestId("sidebar")).toBeVisible()
    for (const item of NAV) {
      await expect(page.getByTestId(`nav-${item.id}`)).toBeVisible()
      await expect(page.getByTestId(`nav-${item.id}`)).toHaveText(item.title)
    }
    await expect(page.getByTestId("sidebar").getByRole("link")).toHaveCount(6)
    await expect(page.getByTestId("app-version")).not.toBeEmpty()
    expect(consoleProblems).toEqual([])
  })

  test("every route, including Not Found, renders without console errors or warnings", async ({
    page,
    consoleProblems,
  }) => {
    for (const route of [...NAV.map((item) => item.path), "/nope"]) {
      await page.goto(route)
      await expect(page.getByTestId("page-title")).toBeVisible()
      await page.waitForLoadState("networkidle")
    }

    expect(consoleProblems).toEqual([])
  })

  test("every page has a nav landmark, a main landmark and exactly one h1", async ({ page }) => {
    for (const item of NAV) {
      await page.goto(item.path)

      await expect(page.locator("nav")).toHaveCount(1)
      await expect(page.locator("nav")).toHaveAttribute("data-testid", "sidebar")
      await expect(page.locator("main")).toHaveCount(1)
      await expect(page.locator("h1")).toHaveCount(1)
      await expect(page.locator("main h1")).toHaveText(item.title)
      await expect(page).toHaveTitle(new RegExp(`^${item.title} · `))
    }
  })

  test("every page except Home has an empty state that names the phase bringing it", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("empty-state")).toHaveCount(0)

    for (const item of NAV.filter((entry) => entry.id !== "home")) {
      await page.goto(item.path)

      await expect(page.getByTestId("empty-state")).toBeVisible()
      await expect(page.getByTestId("empty-state-description")).toHaveText(
        /\S.+ Arrives in Phase \d+\.$/,
      )
    }
  })
})

test.describe("C0-3 Navigation", () => {
  test("each item changes the URL, the page title and the header title", async ({ page }) => {
    await page.goto("/")

    for (const item of [...NAV.slice(1), NAV[0]]) {
      await page.getByTestId(`nav-${item.id}`).click()

      await expect(page).toHaveURL(item.path)
      await expect(page.getByTestId("page-title")).toHaveText(item.title)
      await expect(page.getByTestId("header-title")).toHaveText(item.title)
      await expect(page.getByTestId(`nav-${item.id}`)).toHaveAttribute("aria-current", "page")
    }
  })

  test("Back returns to the previous page, and Forward goes on again", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("nav-forms").click()
    await page.getByTestId("nav-entities").click()
    await expect(page.getByTestId("page-title")).toHaveText("Entities")

    await page.goBack()
    await expect(page).toHaveURL("/forms")
    await expect(page.getByTestId("page-title")).toHaveText("Forms")

    await page.goBack()
    await expect(page).toHaveURL("/")
    await expect(page.getByTestId("page-title")).toHaveText("Home")

    await page.goForward()
    await expect(page).toHaveURL("/forms")
    await expect(page.getByTestId("page-title")).toHaveText("Forms")
  })
})

test.describe("C0-4 Deep links", () => {
  test("a page loads directly from its own URL", async ({ page }) => {
    const response = await page.goto("/themes")

    expect(response?.status()).toBe(200)
    await expect(page.getByTestId("page-title")).toHaveText("Themes")
    await expect(page.getByTestId("nav-themes")).toHaveAttribute("aria-current", "page")
  })

  test("an unknown URL shows Not Found, with a link back to Home", async ({ page }) => {
    await page.goto("/nope")

    await expect(page.getByTestId("not-found")).toBeVisible()
    await expect(page.getByTestId("app-shell")).toBeVisible()

    await page.getByTestId("not-found-home-link").click()

    await expect(page).toHaveURL("/")
    await expect(page.getByTestId("page-title")).toHaveText("Home")
    await expect(page.getByTestId("not-found")).toHaveCount(0)
  })
})
