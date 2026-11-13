import { APP_NAME } from "../src/generated/app.ts"
import { expect, test } from "./support/fixtures.ts"
import { freePort, installBinary, removeInstall, startServer } from "./support/server.ts"

test.describe("C0-7 Version shown", () => {
  test("Home shows the name, version and commit that /api/info reports", async ({
    page,
    request,
  }) => {
    const info = await (await request.get("/api/info")).json()

    await page.goto("/")

    await expect(page.getByTestId("app-version")).toHaveText(info.version)
    await expect(page.getByTestId("app-commit")).toHaveText(info.commit)
    await expect(page.getByTestId("app-name")).toHaveText(APP_NAME)
    await expect(page.getByTestId("server-error")).toHaveCount(0)
  })
})

test.describe("C0-9 Server down", () => {
  test("Home says it can't reach the server, keeps working, and recovers on Retry", async ({
    page,
  }) => {
    test.setTimeout(60_000)
    const { dir, binary } = installBinary()
    const args = ["--demo", "--port", String(await freePort())]
    let server = await startServer(args, binary)

    try {
      await page.goto(server.url)
      await expect(page.getByTestId("app-version")).not.toBeEmpty()
      const version = await page.getByTestId("app-version").textContent()

      await server.stop()

      // Home notices by itself that the server has gone.
      await expect(page.getByTestId("server-error")).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId("server-error")).toContainText("Can't reach the server")
      await expect(page.getByTestId("server-retry")).toBeVisible()

      // Retrying while it is still down keeps the message; nothing goes blank.
      await page.getByTestId("server-retry").click()
      await expect(page.getByTestId("server-error")).toBeVisible()
      await expect(page.getByTestId("app-shell")).toBeVisible()
      await expect(page.getByTestId("page-title")).toHaveText("Home")
      await expect(page.getByTestId("token-preview")).toBeVisible()

      // The app still navigates without a server.
      await page.getByTestId("nav-forms").click()
      await expect(page.getByTestId("page-title")).toHaveText("Forms")
      await page.getByTestId("nav-home").click()
      await expect(page.getByTestId("server-error")).toBeVisible()

      server = await startServer(args, binary)
      await page.getByTestId("server-retry").click()

      await expect(page.getByTestId("app-version")).toHaveText(version ?? "")
      await expect(page.getByTestId("server-error")).toHaveCount(0)
    } finally {
      await server.stop()
      removeInstall(dir)
    }
  })
})

test.describe("C0-12 No external requests", () => {
  test("every request goes to the local address, and Inter is served by the binary", async ({
    page,
    server,
  }) => {
    const requests: { url: string; status: number | undefined }[] = []
    page.on("requestfinished", async (request) => {
      requests.push({ url: request.url(), status: (await request.response())?.status() })
    })
    const failed: string[] = []
    page.on("requestfailed", (request) => failed.push(request.url()))

    await page.goto("/")
    await expect(page.getByTestId("app-version")).not.toBeEmpty()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState("networkidle")

    expect(failed).toEqual([])
    expect(requests.length).toBeGreaterThan(3)
    const elsewhere = requests.filter(({ url }) => new URL(url).origin !== server.url)
    expect(elsewhere).toEqual([])

    const fonts = requests.filter(({ url }) => /\/assets\/inter-[^/]+\.woff2$/.test(url))
    expect(fonts.length).toBeGreaterThan(0)
    for (const font of fonts) expect(font.status, font.url).toBe(200)
  })
})
