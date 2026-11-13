import { defineConfig, devices } from "@playwright/test"

const isCI = Boolean(process.env.CI)

/*
 * End-to-end tests run against the release binary, not a dev server: each
 * worker starts its own copy of the binary (see e2e/support/server.ts).
 * Point E2E_BINARY at it, or use `node scripts/e2e.mjs` from the repo root.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [["github"], ["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    launchOptions: {
      // Use a specific Chromium build instead of the one Playwright downloads.
      executablePath: process.env.E2E_CHROMIUM || undefined,
    },
  },
})
