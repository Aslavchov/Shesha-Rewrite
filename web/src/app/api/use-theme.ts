import { useQuery } from "@tanstack/react-query"

import type {
  SaveThemeDraftRequest,
  ThemeDocument,
  ThemeRevisionRequest,
  ThemeState,
} from "@/generated"
import { ApiRequestError, apiGet, apiPost, apiPut, INVALID_RESPONSE } from "@/lib/api"

/** The theme API (ADR 0010): the draft is edited, the published theme is what the app uses. */

const DRAFT_URL = "/api/theme/draft"

const isRecord = (value: unknown): value is { revision: unknown; document: unknown } =>
  typeof value === "object" && value !== null

/** Whether a response is a theme state: the editor reads nothing else. */
function checked(state: ThemeState): ThemeState {
  const { draft, published } = state as Partial<ThemeState>
  for (const record of [draft, published]) {
    if (
      !isRecord(record) ||
      typeof record.revision !== "number" ||
      typeof record.document !== "object" ||
      record.document === null
    ) {
      throw new ApiRequestError(
        INVALID_RESPONSE,
        "The server sent a theme that could not be read.",
        200,
      )
    }
  }
  return state
}

/** The draft and the published theme as the server has them now. */
export const fetchThemeState = async (signal?: AbortSignal) =>
  checked(await apiGet<ThemeState>(DRAFT_URL, signal))

/**
 * The theme, to edit. Like a form in the designer, it is read once per visit
 * and never refreshed behind the editor's back: a newer draft on the server
 * is a conflict the editor handles itself.
 */
export function useThemeToEdit() {
  return useQuery({
    queryKey: ["theme", "editor"],
    queryFn: ({ signal }) => fetchThemeState(signal),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/** Comfortably under the 64 KiB a browser allows a keepalive request. */
const KEEPALIVE_LIMIT = 20_000

export function saveThemeDraft(
  revision: number,
  document: ThemeDocument,
  options: { keepalive: boolean },
) {
  const body: SaveThemeDraftRequest = { revision, document }
  const keepalive = options.keepalive && JSON.stringify(body).length <= KEEPALIVE_LIMIT
  return apiPut<ThemeState>(DRAFT_URL, body, { keepalive }).then(checked)
}

/** Makes the draft the theme the whole app uses. */
export const publishTheme = (revision: number) =>
  apiPost<ThemeState>("/api/theme/publish", { revision } satisfies ThemeRevisionRequest).then(
    checked,
  )

/** Puts the draft back to the published theme. */
export const discardThemeDraft = (revision: number) =>
  apiPost<ThemeState>("/api/theme/discard", { revision } satisfies ThemeRevisionRequest).then(
    checked,
  )
