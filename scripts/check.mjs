#!/usr/bin/env node
// Run the project's checks. CI runs the same groups, one per job.
//
//   node scripts/check.mjs                 every group
//   node scripts/check.mjs web server      only the groups named
//
// Groups: web, server, types, style. The end-to-end tests need a release
// binary and have their own script: node scripts/e2e.mjs.
import { existsSync } from "node:fs"
import path from "node:path"

import { run, section, webDir } from "./lib/project.mjs"

const groups = {
  web() {
    if (!existsSync(path.join(webDir, "node_modules"))) run("npm", ["ci"], { cwd: webDir })
    run("npm", ["run", "typecheck"], { cwd: webDir })
    run("npm", ["run", "lint"], { cwd: webDir })
    run("npm", ["run", "test"], { cwd: webDir })
    run("npm", ["run", "build"], { cwd: webDir })
  },
  server() {
    run("cargo", ["fmt", "--all", "--check"])
    run("cargo", ["clippy", "--workspace", "--all-targets", "--locked", "--", "-D", "warnings"])
    run("cargo", ["test", "--workspace", "--locked"])
  },
  types() {
    run("node", ["scripts/generate-types.mjs", "--check"])
  },
  style() {
    run("node", ["--test", "scripts/style-guard.test.mjs"])
    run("node", ["scripts/style-guard.mjs"])
  },
}

const requested = process.argv.slice(2)
const unknown = requested.filter((name) => !(name in groups))
if (unknown.length > 0) {
  console.error(
    `Unknown group: ${unknown.join(", ")}. Choose from: ${Object.keys(groups).join(", ")}`,
  )
  process.exit(1)
}

for (const name of requested.length > 0 ? requested : Object.keys(groups)) {
  section(`check: ${name}`, groups[name])
}
console.log("\nAll checks passed.")
