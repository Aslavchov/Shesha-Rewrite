// Shared helpers for the scripts in this folder. Plain Node, no dependencies,
// so every script runs the same way on Linux, macOS and Windows.
import { spawnSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import path from "node:path"

export const repoRoot = path.resolve(import.meta.dirname, "..", "..")
export const webDir = path.join(repoRoot, "web")
export const isWindows = process.platform === "win32"
export const isCI = process.env.GITHUB_ACTIONS === "true"

/** The Cargo package that produces the application binary. */
export const SERVER_PACKAGE = "server"

/** Print a heading for a group of commands (collapsible in GitHub Actions logs). */
export function section(title, body) {
  console.log(isCI ? `::group::${title}` : `\n== ${title} ==`)
  try {
    return body()
  } finally {
    if (isCI) console.log("::endgroup::")
  }
}

/**
 * Run a command, streaming its output. Exits this process with the command's
 * status if it fails, so a failing step stops the script.
 */
export function run(command, args = [], { cwd = repoRoot, env = {} } = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`)
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    // npm and npx are .cmd shims on Windows, which only start through a shell.
    shell: isWindows,
  })
  if (result.error) {
    console.error(`Could not start "${command}": ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status ?? 1)
}

/** Run a command and return its trimmed stdout, or null if it fails. */
export function capture(command, args = [], { cwd = repoRoot } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: isWindows })
  return result.status === 0 ? result.stdout.trim() : null
}

/**
 * The name of the server binary. Its single source is the `[[bin]]` entry in
 * crates/server/Cargo.toml; scripts and CI read it from Cargo, never repeat it.
 */
export function binaryName() {
  const metadata = capture("cargo", ["metadata", "--no-deps", "--format-version", "1"])
  if (metadata === null) {
    console.error("Could not read the workspace with `cargo metadata`. Is Rust installed?")
    process.exit(1)
  }
  const bins = JSON.parse(metadata)
    .packages.find((pkg) => pkg.name === SERVER_PACKAGE)
    ?.targets.filter((target) => target.kind.includes("bin"))
  if (bins?.length !== 1) {
    console.error(`Expected exactly one binary in the "${SERVER_PACKAGE}" package.`)
    process.exit(1)
  }
  return bins[0].name
}

export const executable = (name) => (isWindows ? `${name}.exe` : name)

/** The value of `--flag value` or `--flag=value` in argv, or undefined. */
export function option(argv, flag) {
  const index = argv.indexOf(flag)
  if (index !== -1) return argv[index + 1]
  const prefixed = argv.find((arg) => arg.startsWith(`${flag}=`))
  return prefixed?.slice(flag.length + 1)
}

/** Expose values to later steps of a GitHub Actions job. A no-op elsewhere. */
export function setOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`)
  appendFileSync(process.env.GITHUB_OUTPUT, lines.join(""))
}
