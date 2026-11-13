#!/usr/bin/env node
// Run the app for development: the Rust server, plus the Vite dev server with
// /api proxied to it. Open the Vite address it prints. Ctrl+C stops both.
//
//   node scripts/dev.mjs
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import readline from "node:readline"

import { isWindows, repoRoot, run, SERVER_PACKAGE, webDir } from "./lib/project.mjs"

if (!existsSync(path.join(webDir, "node_modules"))) run("npm", ["ci"], { cwd: webDir })

const children = []
let stopping = false

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exitCode = code
}

function start(command, args, options) {
  const child = spawn(command, args, { shell: isWindows, ...options })
  children.push(child)
  child.on("exit", (code) => {
    if (!stopping) console.error(`\n"${command}" stopped; shutting down.`)
    stop(code ?? 1)
  })
  return child
}

process.on("SIGINT", () => stop())
process.on("SIGTERM", () => stop())

// The server prints one line with its address once it is ready. It may have
// moved to another port if the default was busy, so Vite is started only
// then, pointed at the address the server actually printed.
const server = start("cargo", ["run", "--package", SERVER_PACKAGE], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "inherit"],
})

readline.createInterface({ input: server.stdout }).on("line", (line) => {
  const address = line.match(/https?:\/\/\S+/)?.[0]
  if (!address) return
  console.log(`API server ready at ${address}`)
  start("npm", ["run", "dev"], {
    cwd: webDir,
    stdio: "inherit",
    env: { ...process.env, API_ORIGIN: address.replace("localhost", "127.0.0.1") },
  })
})
