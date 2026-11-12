#!/usr/bin/env node
// Regenerate web/src/generated from the Rust types in crates/contracts.
//
//   node scripts/generate-types.mjs           regenerate
//   node scripts/generate-types.mjs --check   regenerate, then fail if anything changed
import { capture, run } from "./lib/project.mjs"

const GENERATED_DIR = "web/src/generated"

run("cargo", ["run", "--locked", "--package", "contracts", "--bin", "generate-types"])

if (process.argv.includes("--check")) {
  const changes = capture("git", ["status", "--porcelain", "--", GENERATED_DIR])
  if (changes === null) {
    console.error("Could not ask git whether the generated files changed.")
    process.exit(1)
  }
  if (changes !== "") {
    console.error(`\n${GENERATED_DIR} is out of date:\n${changes}\n`)
    run("git", ["--no-pager", "diff", "--", GENERATED_DIR])
    console.error("\nRun `node scripts/generate-types.mjs` and commit the result.")
    process.exit(1)
  }
  console.log(`${GENERATED_DIR} is up to date.`)
}
