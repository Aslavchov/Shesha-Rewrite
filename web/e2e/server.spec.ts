import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

import { APP_NAME } from "../src/generated/app.ts"
import { expect, test } from "./support/fixtures.ts"
import {
  dataDirName,
  freePort,
  installBinary,
  removeInstall,
  startServer,
} from "./support/server.ts"

const SEMVER = /^\d+\.\d+\.\d+$/

test.describe("C0-1 Starts", () => {
  test("prints one address line within 3 seconds and creates its data folder next to itself", async ({
    request,
  }) => {
    const server = await startServer(["--demo"])
    try {
      expect(server.startupMs).toBeLessThan(3_000)

      // Give it something to log about, then make sure stdout still has just the one line.
      expect((await request.get(`${server.url}/api/health`)).ok()).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(server.stdout).toEqual([`${APP_NAME} running at http://localhost:${server.port}`])

      const dataDir = path.join(server.dir, dataDirName())
      expect(existsSync(dataDir)).toBe(true)
      expect(readdirSync(dataDir).some((file) => file.endsWith(".db"))).toBe(true)
    } finally {
      await server.stop()
      removeInstall(server.dir)
    }
  })

  test("moves to the next free port when the requested one is busy, and prints the one used", async ({
    server,
  }) => {
    const second = await startServer(["--port", String(server.port)])
    try {
      expect(second.port).toBeGreaterThan(server.port)
      expect(second.stdout).toEqual([`${APP_NAME} running at http://localhost:${second.port}`])
    } finally {
      await second.stop()
      removeInstall(second.dir)
    }
  })

  test("--data-dir puts the database somewhere else", async () => {
    const { dir, binary } = installBinary()
    const dataDir = path.join(dir, "custom", "data")
    const server = await startServer(
      ["--port", String(await freePort()), "--data-dir", dataDir],
      binary,
    )
    try {
      expect(readdirSync(dataDir).some((file) => file.endsWith(".db"))).toBe(true)
      expect(existsSync(path.join(dir, dataDirName()))).toBe(false)
    } finally {
      await server.stop()
      removeInstall(dir)
    }
  })

  test("--help lists the flags and exits without starting", () => {
    const { dir, binary } = installBinary()
    try {
      const help = spawnSync(binary, ["--help"], { encoding: "utf8" })

      expect(help.status).toBe(0)
      for (const flag of ["--port", "--data-dir", "--demo", "--help"]) {
        expect(help.stdout).toContain(flag)
      }
      expect(existsSync(path.join(dir, dataDirName()))).toBe(false)
    } finally {
      removeInstall(dir)
    }
  })

  test("shuts down cleanly on Ctrl+C", async () => {
    test.skip(process.platform === "win32", "Node cannot send Ctrl+C to a child on Windows")
    const server = await startServer(["--port", String(await freePort())])
    try {
      const exit = await server.stop("SIGINT")

      expect(exit).toEqual({ code: 0, signal: null })
    } finally {
      removeInstall(server.dir)
    }
  })
})

test.describe("C0-6 API", () => {
  test("/api/health reports the server and database as ok", async ({ request }) => {
    const response = await request.get("/api/health")

    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("application/json")
    const body = await response.json()
    expect(body).toEqual({ status: "ok", version: expect.stringMatching(SEMVER), db: "ok" })
  })

  test("/api/info reports the name, version and commit", async ({ request }) => {
    const response = await request.get("/api/info")

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      name: APP_NAME,
      version: expect.stringMatching(SEMVER),
      commit: expect.stringMatching(/^([0-9a-f]{7,40}|dev)$/),
    })
  })

  test("any other /api path is a 404 in the standard error shape", async ({ request }) => {
    for (const apiPath of ["/api/nope", "/api/health/extra", "/api/"]) {
      const response = await request.get(apiPath)

      expect(response.status(), apiPath).toBe(404)
      expect(response.headers()["content-type"]).toContain("application/json")
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: expect.any(String) },
      })
    }
  })

  test("a wrong method on an API route uses the standard error shape too", async ({ request }) => {
    const response = await request.post("/api/info")

    expect(response.status()).toBe(405)
    expect(await response.json()).toEqual({
      error: { code: "method_not_allowed", message: expect.any(String) },
    })
  })
})
