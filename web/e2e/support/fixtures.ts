import { test as base, expect } from "@playwright/test"

import { type AppServer, freePort, removeInstall, startServer } from "./server.ts"

type TestFixtures = {
  /** Console errors, console warnings and uncaught exceptions seen by the page. */
  consoleProblems: string[]
}

type WorkerFixtures = {
  /** One release binary per worker, started with --demo as the acceptance checks ask. */
  server: AppServer
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  server: [
    // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern here.
    async ({}, provide) => {
      const server = await startServer(["--demo", "--port", String(await freePort())])
      await provide(server)
      await server.stop()
      removeInstall(server.dir)
    },
    { scope: "worker" },
  ],

  baseURL: async ({ server }, provide) => {
    await provide(server.url)
  },

  consoleProblems: async ({ page }, provide) => {
    const problems: string[] = []
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        problems.push(`console ${message.type()}: ${message.text()}`)
      }
    })
    page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`))
    await provide(problems)
  },
})

export { expect }

/** The pages reachable from the sidebar, in order. */
export const NAV = [
  { id: "home", path: "/", title: "Home" },
  { id: "forms", path: "/forms", title: "Forms" },
  { id: "designer", path: "/designer", title: "Designer" },
  { id: "entities", path: "/entities", title: "Entities" },
  { id: "themes", path: "/themes", title: "Themes" },
  { id: "settings", path: "/settings", title: "Settings" },
] as const
