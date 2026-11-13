import { QueryClient } from "@tanstack/react-query"

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The server is on this machine, so being "offline" says nothing
        // about whether it can be reached: never pause requests.
        networkMode: "always",
        // Failures are shown with a Retry button rather than retried silently.
        retry: false,
      },
    },
  })
}
