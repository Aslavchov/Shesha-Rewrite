import { afterEach, describe, expect, it, vi } from "vitest"

import { apiGet, ApiRequestError, INVALID_RESPONSE, NETWORK_ERROR } from "./api"

function respondWith(body: string, status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  )
}

async function failureOf(promise: Promise<unknown>): Promise<ApiRequestError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiRequestError)
  return error as ApiRequestError
}

describe("apiGet", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("returns the parsed body of a successful response", async () => {
    respondWith(JSON.stringify({ name: "App", version: "1.2.3", commit: "abc1234" }), 200)

    await expect(apiGet("/api/info")).resolves.toEqual({
      name: "App",
      version: "1.2.3",
      commit: "abc1234",
    })
  })

  it("turns the standard error shape into an ApiRequestError", async () => {
    respondWith(JSON.stringify({ error: { code: "not_found", message: "No such route." } }), 404)

    const error = await failureOf(apiGet("/api/nope"))

    expect(error).toMatchObject({ code: "not_found", message: "No such route.", status: 404 })
  })

  it("reports an unreachable server as a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
    )

    const error = await failureOf(apiGet("/api/info"))

    expect(error).toMatchObject({ code: NETWORK_ERROR, status: null })
  })

  it("reports a body that is not JSON as an invalid response", async () => {
    respondWith("<html>proxy error</html>", 502)

    const error = await failureOf(apiGet("/api/info"))

    expect(error).toMatchObject({ code: INVALID_RESPONSE, status: 502 })
  })

  it("reports an error status without the error shape as an invalid response", async () => {
    respondWith(JSON.stringify({ oops: true }), 500)

    const error = await failureOf(apiGet("/api/info"))

    expect(error).toMatchObject({ code: INVALID_RESPONSE, status: 500 })
  })

  it("lets a cancelled request through as an AbortError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Aborted", "AbortError")
      }),
    )

    await expect(apiGet("/api/info")).rejects.toMatchObject({ name: "AbortError" })
  })
})
