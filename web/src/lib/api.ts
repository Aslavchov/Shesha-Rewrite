import type { ApiError } from "@/generated"

/**
 * Every failed API call surfaces as this error. `code` is the server's
 * snake_case error code, or one of the client-side codes below when the
 * server could not be reached or answered with something unexpected.
 */
export class ApiRequestError extends Error {
  readonly code: string
  /** HTTP status, or `null` when no response arrived at all. */
  readonly status: number | null

  constructor(code: string, message: string, status: number | null) {
    super(message)
    this.name = "ApiRequestError"
    this.code = code
    this.status = status
  }
}

export const NETWORK_ERROR = "network_error"
export const INVALID_RESPONSE = "invalid_response"

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false
  const error = (value as { error?: unknown }).error
  if (typeof error !== "object" || error === null) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === "string" && typeof message === "string"
}

/** GET a JSON resource under /api. Throws `ApiRequestError` on any failure. */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { headers: { Accept: "application/json" }, signal })
  } catch (cause) {
    // Let cancellations through untouched so callers can tell them apart.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause
    throw new ApiRequestError(NETWORK_ERROR, "The server could not be reached.", null)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiRequestError(
      INVALID_RESPONSE,
      "The server sent a response that could not be read.",
      response.status,
    )
  }

  if (!response.ok) {
    if (isApiError(body)) {
      throw new ApiRequestError(body.error.code, body.error.message, response.status)
    }
    throw new ApiRequestError(
      INVALID_RESPONSE,
      `The server answered with HTTP ${response.status}.`,
      response.status,
    )
  }

  return body as T
}
