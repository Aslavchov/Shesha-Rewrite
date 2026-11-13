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

/**
 * The pages reachable from the sidebar, in order. `arrival` is how the page's
 * empty state says when it will be built (docs/roadmap.md); Home has none.
 */
export const NAV = [
  { id: "home", path: "/", title: "Home", arrival: null },
  { id: "forms", path: "/forms", title: "Forms", arrival: "Arrives in Phase 1." },
  { id: "designer", path: "/designer", title: "Designer", arrival: "Arrives in Phase 2." },
  { id: "entities", path: "/entities", title: "Entities", arrival: "Arrives in Phase 5." },
  { id: "themes", path: "/themes", title: "Themes", arrival: "Arrives in Phase 4." },
  { id: "settings", path: "/settings", title: "Settings", arrival: "Arrives after v1." },
] as const
