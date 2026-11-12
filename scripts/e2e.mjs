#!/usr/bin/env node
// Run the Playwright end-to-end tests against a release binary.
//
//   node scripts/e2e.mjs [--binary <path>] [-- <playwright arguments>]
//
// Without --binary it uses the output of `node scripts/build.mjs`.
import { existsSync } from "node:fs"
import path from "node:path"

import { option, run, webDir } from "./lib/project.mjs"
import { releaseOutput } from "./lib/release.mjs"

const binary = path.resolve(option(process.argv, "--binary") ?? releaseOutput().file)
if (!existsSync(binary)) {
  console.error(`No binary at ${binary}. Build it first: node scripts/build.mjs`)
  process.exit(1)
}

const separator = process.argv.indexOf("--")
const playwrightArgs = separator === -1 ? [] : process.argv.slice(separator + 1)

if (!existsSync(path.join(webDir, "node_modules"))) run("npm", ["ci"], { cwd: webDir })
run("npx", ["playwright", "test", ...playwrightArgs], {
  cwd: webDir,
  env: { E2E_BINARY: binary },
})
