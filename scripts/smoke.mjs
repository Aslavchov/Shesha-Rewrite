#!/usr/bin/env node
// Smoke-test a release binary on the machine that built it: start it, check
// that the API and the embedded frontend answer, and stop it. CI runs this on
// Linux, Windows and macOS; the full end-to-end suite runs on Linux only.
//
//   node scripts/smoke.mjs [--binary <path>]
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import readline from "node:readline"

import { capture, option } from "./lib/project.mjs"
import { releaseOutput } from "./lib/release.mjs"

const binary = path.resolve(option(process.argv, "--binary") ?? releaseOutput().file)
if (!existsSync(binary)) {
  console.error(`No binary at ${binary}. Build it first: node scripts/build.mjs`)
  process.exit(1)
}

function check(condition, message) {
  if (!condition) throw new Error(message)
  console.log(`ok  ${message}`)
}

if (process.platform === "linux") {
  // glibc's ldd says one of these for a binary with no dynamic dependencies.
  const report = capture("sh", ["-c", `ldd "${binary}" 2>&1 || true`]) ?? ""
  check(
    /statically linked|not a dynamic executable/.test(report),
    "the Linux binary is statically linked",
  )
}

const dataDir = mkdtempSync(path.join(tmpdir(), "smoke-data-"))
const child = spawn(binary, ["--demo", "--port", "0", "--data-dir", dataDir], {
  stdio: ["ignore", "pipe", "inherit"],
})
const exited = new Promise((resolve) => child.once("exit", resolve))

try {
  const startedAt = performance.now()
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no address line within 10s")), 10_000)
    child.once("error", reject)
    child.once("exit", (code) => reject(new Error(`the binary exited early with code ${code}`)))
    readline.createInterface({ input: child.stdout }).once("line", (line) => {
      clearTimeout(timer)
      const url = line.match(/running at (http:\/\/localhost:\d+)$/)?.[1]
      if (url) resolve(url)
      else reject(new Error(`unexpected first line: ${line}`))
    })
  })
  const startupMs = Math.round(performance.now() - startedAt)
  check(startupMs < 3_000, `printed ${address} within 3 seconds (${startupMs} ms)`)

  // The server listens on IPv4 loopback; name it explicitly so the check does
  // not depend on how this machine resolves "localhost".
  const origin = address.replace("localhost", "127.0.0.1")

  const health = await fetch(`${origin}/api/health`)
  const body = await health.json()
  check(health.status === 200 && body.status === "ok" && body.db === "ok", "/api/health is ok")

  const info = await (await fetch(`${origin}/api/info`)).json()
  check(
    typeof info.commit === "string" && info.commit.length > 0,
    `/api/info: ${JSON.stringify(info)}`,
  )

  const page = await fetch(`${origin}/some/deep/link`)
  const html = await page.text()
  check(
    page.status === 200 && html.includes('<div id="root">'),
    "deep links return the embedded frontend",
  )
} catch (error) {
  console.error(`FAILED  ${error.message}`)
  process.exitCode = 1
} finally {
  child.kill()
  await exited
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 })
}
