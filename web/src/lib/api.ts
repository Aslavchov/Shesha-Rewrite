import type { ApiError, ErrorDetail } from "@/generated"

/**
 * Every failed API call surfaces as this error. `code` is the server's
 * snake_case error code, or one of the client-side codes below when the
 * server could not be reached or answered with something unexpected.
 */
export class ApiRequestError extends Error {
  readonly code: string
  /** HTTP status, or `null` when no response arrived at all. */
  readonly status: number | null
  /** The located problems the server listed, if any (ADR 0007). */
  readonly details: readonly ErrorDetail[]

  constructor(
    code: string,
    message: string,
    status: number | null,
    details: readonly ErrorDetail[] = [],
  ) {
    super(message)
    this.name = "ApiRequestError"
    this.code = code
    this.status = status
    this.details = details
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

type RequestOptions = {
  /** Sent as JSON. */
  body?: unknown
  signal?: AbortSignal
  /** Lets the request outlive the page: for a save made as the page goes away. */
  keepalive?: boolean
}

/** Calls a JSON endpoint under /api. Throws `ApiRequestError` on any failure. */
async function apiRequest<T>(
  method: string,
  path: string,
  { body, signal, keepalive }: RequestOptions = {},
): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      keepalive,
    })
  } catch (cause) {
    // Let cancellations through untouched so callers can tell them apart.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause
    throw new ApiRequestError(NETWORK_ERROR, "The server could not be reached.", null)
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    throw new ApiRequestError(
      INVALID_RESPONSE,
      "The server sent a response that could not be read.",
      response.status,
    )
  }

  if (!response.ok) {
    if (isApiError(parsed)) {
      const { code, message, details } = parsed.error
      throw new ApiRequestError(code, message, response.status, details ?? [])
    }
    throw new ApiRequestError(
      INVALID_RESPONSE,
      `The server answered with HTTP ${response.status}.`,
      response.status,
    )
  }

  return parsed as T
}

/** GET a JSON resource under /api. */
export const apiGet = <T>(path: string, signal?: AbortSignal) =>
  apiRequest<T>("GET", path, { signal })

/** POST JSON to a resource under /api. */
export const apiPost = <T>(path: string, body: unknown) => apiRequest<T>("POST", path, { body })

/** PUT JSON to a resource under /api. */
export const apiPut = <T>(path: string, body: unknown, options: { keepalive?: boolean } = {}) =>
  apiRequest<T>("PUT", path, { body, ...options })
