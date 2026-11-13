#!/usr/bin/env node
// Build the release binary: the frontend first, then the Rust server with the
// frontend embedded. CI runs exactly this.
//
//   node scripts/build.mjs [--target <rust target triple>]
//
// Output: dist/<binary>-<os>-<arch>/<binary>[.exe]
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs"
import path from "node:path"

import {
  capture,
  option,
  repoRoot,
  run,
  section,
  SERVER_PACKAGE,
  setOutputs,
  webDir,
} from "./lib/project.mjs"
import { defaultTarget, releaseOutput } from "./lib/release.mjs"

const target = option(process.argv, "--target") ?? defaultTarget()
const output = releaseOutput(target)

// The commit shown by /api/info. CI passes the real head commit (on pull
// requests the checkout is a merge commit); locally the server's build script
// asks git.
const commit = process.env.BUILD_COMMIT || capture("git", ["rev-parse", "--short", "HEAD"]) || "dev"

section("Frontend", () => {
  if (!existsSync(path.join(webDir, "node_modules"))) run("npm", ["ci"], { cwd: webDir })
  run("npm", ["run", "build"], { cwd: webDir })
})

section(`Server (${target ?? "host target"})`, () => {
  const args = ["build", "--release", "--locked", "--package", SERVER_PACKAGE]
  if (target !== null) {
    if (target.endsWith("-musl") && capture("musl-gcc", ["--version"]) === null) {
      console.error(
        "The static Linux build needs musl-gcc. On Debian or Ubuntu: sudo apt-get install musl-tools",
      )
      process.exit(1)
    }
    run("rustup", ["target", "add", target])
    args.push("--target", target)
  }
  run("cargo", args, {
    env: {
      BUILD_COMMIT: commit,
      // Keep macOS binaries runnable on every Apple Silicon release of macOS.
      ...(process.platform === "darwin" ? { MACOSX_DEPLOYMENT_TARGET: "11.0" } : {}),
    },
  })
})

const built = path.join(repoRoot, "target", ...(target ? [target] : []), "release", output.fileName)
rmSync(output.dir, { recursive: true, force: true })
mkdirSync(output.dir, { recursive: true })
copyFileSync(built, output.file)

const megabytes = (statSync(output.file).size / 1024 / 1024).toFixed(1)
console.log(`\nBuilt ${path.relative(repoRoot, output.file)} (${megabytes} MB, commit ${commit})`)
setOutputs({ artifact: output.artifact, dir: path.relative(repoRoot, output.dir) })
