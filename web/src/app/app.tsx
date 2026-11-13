import * as React from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { createBrowserRouter } from "react-router"
import { RouterProvider } from "react-router/dom"

import { createQueryClient } from "./api/query-client"
import { routes } from "./routes"

export function App() {
  const [queryClient] = React.useState(createQueryClient)
  const [router] = React.useState(() => createBrowserRouter(routes))

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
