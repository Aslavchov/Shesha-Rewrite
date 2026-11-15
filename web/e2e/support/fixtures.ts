import { test as base, expect } from "@playwright/test"

import { type AppServer, freePort, removeInstall, startServer } from "./server.ts"

type TestFixtures = {
  /** Console errors, console warnings and uncaught exceptions seen by the page. */
  consoleProblems: string[]
  /**
   * Call in a test that makes the server refuse a request on purpose, with the
   * status expected. The browser itself reports every refused request on the
   * console, and nothing a page does can stop it; that one line is then not
   * counted as a problem.
   */
  expectRefusal: (status: number) => void
  /** The statuses given to `expectRefusal`. */
  expectedRefusals: Set<number>
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

  // oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructuring pattern here.
  expectedRefusals: async ({}, provide) => {
    await provide(new Set())
  },

  expectRefusal: async ({ expectedRefusals }, provide) => {
    await provide((status) => expectedRefusals.add(status))
  },

  consoleProblems: [
    async ({ page, expectedRefusals }, provide) => {
      const problems: string[] = []
      page.on("console", (message) => {
        if (message.type() !== "error" && message.type() !== "warning") return
        const refused = message.text().match(REFUSED_REQUEST)
        if (refused && expectedRefusals.has(Number(refused[1]))) return
        problems.push(`console ${message.type()}: ${message.text()}`)
      })
      page.on("pageerror", (error) => problems.push(`uncaught: ${error.message}`))
      await provide(problems)
    },
    // Listening from the start of every test: a fixture first asked for in
    // `afterEach` would only start listening once the test was over.
    { auto: true },
  ],
})

/** What the browser writes to the console when the server answers a request with an error status. */
const REFUSED_REQUEST = /^Failed to load resource: the server responded with a status of (\d+)/

export { expect }

/**
 * The pages reachable from the sidebar, in order. `arrival` is how the page's
 * empty state says when it will be built (docs/roadmap.md); pages that are
 * built (Home, Forms since Phase 1, Designer since Phase 2) have none.
 */
export const NAV = [
  { id: "home", path: "/", title: "Home", arrival: null },
  { id: "forms", path: "/forms", title: "Forms", arrival: null },
  { id: "designer", path: "/designer", title: "Designer", arrival: null },
  { id: "entities", path: "/entities", title: "Entities", arrival: "Arrives in Phase 5." },
  { id: "themes", path: "/themes", title: "Themes", arrival: "Arrives in Phase 4." },
  { id: "settings", path: "/settings", title: "Settings", arrival: "Arrives after v1." },
] as const

/** The form `--demo` seeds (spec section 10). Its id is fixed. */
export const DEMO_FORM = {
  id: "person-details",
  path: "/forms/person-details",
  name: "Person details",
  description:
    "Demo form covering every Phase 1 component. The Email label is blue on purpose: it shows a style override.",
} as const
