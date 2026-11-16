import * as React from "react"
import { QueryClient, useQueryClient } from "@tanstack/react-query"

import { type DataApi, serverApi } from "./api"
import { type DataClient, DataContext } from "./client"

/** Provides the data API, sharing the app's query cache. */
export function DataProvider({
  api = serverApi,
  children,
}: {
  api?: DataApi
  children: React.ReactNode
}) {
  const queries = useQueryClient()
  const client = React.useMemo(() => ({ api, queries }), [api, queries])
  return <DataContext value={client}>{children}</DataContext>
}

/** Provides a data API with a cache of its own: for tests and isolated previews. */
export function IsolatedDataProvider({
  api,
  children,
}: {
  api: DataApi
  children: React.ReactNode
}) {
  const [client] = React.useState<DataClient>(() => ({
    api,
    queries: new QueryClient({
      defaultOptions: { queries: { networkMode: "always", retry: false, gcTime: 0 } },
    }),
  }))
  return <DataContext value={client}>{children}</DataContext>
}
