// Where release builds go and what they are called.
import path from "node:path"

import { binaryName, repoRoot } from "./project.mjs"

const OS_LABELS = { linux: "linux", darwin: "macos", win32: "windows" }
const ARCH_LABELS = { x64: "x86_64", arm64: "arm64" }

/**
 * The Rust target for a release build on this machine. Linux builds target
 * musl so the binary is statically linked and runs on any distribution;
 * elsewhere the host's own target is used (null).
 */
export function defaultTarget() {
  return process.platform === "linux" && process.arch === "x64" ? "x86_64-unknown-linux-musl" : null
}

/** `<os>-<arch>` for a Rust target triple, or for this machine when there is none. */
export function platformLabel(target) {
  if (target === null) {
    return `${OS_LABELS[process.platform]}-${ARCH_LABELS[process.arch]}`
  }
  const os = target.includes("linux") ? "linux" : target.includes("windows") ? "windows" : "macos"
  const arch = target.startsWith("aarch64") ? "arm64" : "x86_64"
  return `${os}-${arch}`
}

/**
 * Release output: dist/<binary>-<os>-<arch>/<binary>[.exe]. The folder name is
 * also the name of the CI artifact.
 */
export function releaseOutput(target = defaultTarget()) {
  const name = binaryName()
  const artifact = `${name}-${platformLabel(target)}`
  const fileName = platformLabel(target).startsWith("windows") ? `${name}.exe` : name
  const dir = path.join(repoRoot, "dist", artifact)
  return { name, artifact, dir, fileName, file: path.join(dir, fileName) }
}
