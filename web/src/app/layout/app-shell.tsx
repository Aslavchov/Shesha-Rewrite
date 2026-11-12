import { Outlet, useMatches } from "react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

import type { RouteHandle } from "../routes"
import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { MAIN_CONTENT_ID, SkipLink } from "./skip-link"

/** The frame around every route: skip link, sidebar, header and <main>. */
export function AppShell() {
  // The deepest matched route carries the title of the page being shown.
  const handle = useMatches().at(-1)?.handle as RouteHandle | undefined

  return (
    <>
      <SkipLink />
      <SidebarProvider data-testid="app-shell">
        <AppSidebar />
        <SidebarInset>
          <AppHeader title={handle?.title ?? ""} />
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col outline-none">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
