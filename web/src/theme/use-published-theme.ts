import * as React from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { ThemeRecord } from "@/generated"
import { apiGet } from "@/lib/api"

import { readInlinedTheme } from "./apply"

/**
 * The published theme, for the whole app (ADR 0010). The server writes it
 * into the page, and a small script applies it before first paint; from then
 * on this keeps the page in step with the server: after a publish in this
 * tab at once, and after one made elsewhere when the window is looked at
 * again.
 */

const PUBLISHED_THEME = ["theme", "published"] as const

/** How long a published theme is trusted before the server is asked again. */
const FRESH_FOR_MS = 30_000

export const fetchPublishedTheme = (signal?: AbortSignal) =>
  apiGet<ThemeRecord>("/api/theme", signal)

export function usePublishedTheme() {
  return useQuery({
    queryKey: PUBLISHED_THEME,
    queryFn: ({ signal }) => fetchPublishedTheme(signal),
    initialData: () => readInlinedTheme() ?? undefined,
    staleTime: FRESH_FOR_MS,
  })
}

/** Tells the app which theme is published now: the theme editor calls it after publishing. */
export function useSetPublishedTheme() {
  const queryClient = useQueryClient()
  return React.useCallback(
    (record: ThemeRecord) => queryClient.setQueryData(PUBLISHED_THEME, record),
    [queryClient],
  )
}
