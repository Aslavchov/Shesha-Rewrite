import { useQuery } from "@tanstack/react-query"

import type { AppInfo } from "@/generated"
import { apiGet } from "@/lib/api"

/** How often Home re-checks the server, so a stopped server is noticed. */
const RECHECK_INTERVAL_MS = 5_000

export function useAppInfo() {
  return useQuery({
    queryKey: ["info"],
    queryFn: ({ signal }) => apiGet<AppInfo>("/api/info", signal),
    refetchInterval: RECHECK_INTERVAL_MS,
  })
}
