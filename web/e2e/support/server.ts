import { type ChildProcess, spawn } from "node:child_process"
import { chmodSync, copyFileSync, mkdtempSync, rmSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import readline from "node:readline"

/** A running copy of the release binary. */
export type AppServer = {
  /** The address the binary printed, e.g. http://localhost:7400 */
  url: string
  port: number
  /** Folder holding this copy of the binary. */
  dir: string
  /** Everything the binary wrote to stdout so far, line by line. */
  stdout: string[]
  /** Milliseconds from launch to the address line being printed. */
  startupMs: number
  /** Stop the binary and report how it exited. */
  stop(signal?: NodeJS.Signals): Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

/** The release binary under test. */
export function binaryPath(): string {
  const binary = process.env.E2E_BINARY
  if (!binary) {
    throw new Error("E2E_BINARY is not set. Run the tests with: node scripts/e2e.mjs")
  }
  return path.resolve(binary)
}

/** The data folder the binary creates next to itself: `<binary name>-data`. */
export function dataDirName(): string {
  return `${path.basename(binaryPath()).replace(/\.exe$/, "")}-data`
}

/** Copy the binary into a fresh folder, so each test sees its own data folder. */
export function installBinary(): { dir: string; binary: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "e2e-app-"))
  const binary = path.join(dir, path.basename(binaryPath()))
  copyFileSync(binaryPath(), binary)
  chmodSync(binary, 0o755)
  return { dir, binary }
}

export function removeInstall(dir: string) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
}

/** Ask the operating system for a port nothing is listening on. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once("error", reject)
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      probe.close(() => (typeof address === "object" && address ? resolve(address.port) : reject()))
    })
  })
}

const ADDRESS_LINE = /running at (http:\/\/localhost:(\d+))$/

/**
 * Start the binary and wait for it to print its address.
 * `args` are passed as given; `binary` defaults to a fresh install.
 */
export async function startServer(
  args: string[],
  binary: string = installBinary().binary,
): Promise<AppServer> {
  const startedAt = performance.now()
  const child: ChildProcess = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] })
  const stdout: string[] = []
  const stderr: string[] = []
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }))
  })
  readline.createInterface({ input: child.stderr! }).on("line", (line) => stderr.push(line))

  const address = await new Promise<{ url: string; port: number }>((resolve, reject) => {
    const fail = (reason: string) =>
      reject(new Error(`${reason}\nstdout:\n${stdout.join("\n")}\nstderr:\n${stderr.join("\n")}`))
    const timer = setTimeout(() => fail("The binary did not print its address within 10s."), 10_000)
    readline.createInterface({ input: child.stdout! }).on("line", (line) => {
      stdout.push(line)
      const match = line.match(ADDRESS_LINE)
      if (match) {
        clearTimeout(timer)
        resolve({ url: match[1], port: Number(match[2]) })
      }
    })
    child.once("error", (error) => fail(`The binary could not be started: ${error.message}`))
    void exited.then(({ code }) => fail(`The binary exited early with code ${code}.`))
  })

  return {
    ...address,
    dir: path.dirname(binary),
    stdout,
    startupMs: performance.now() - startedAt,
    async stop(signal = "SIGTERM") {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal)
      return exited
    },
  }
}
