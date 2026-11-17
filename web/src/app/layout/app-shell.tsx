import * as React from "react"
import { Outlet, useLocation, useNavigate } from "react-router"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { type RowNavigation, RowNavigationContext } from "@/data/navigation"
import { APP_NAME } from "@/generated"

import { formPath } from "../pages"
import { navigated, settled } from "@/lib/heading-focus"
import { AppHeader } from "./app-header"
import { AppSidebar } from "./app-sidebar"
import { MAIN_CONTENT_ID, SkipLink } from "./skip-link"

/** Where a form opened from another page goes back to (Phase 5). */
export type BackTarget = { readonly to: string; readonly label: string }

/**
 * How components open a form for a row: the app's own routes, remembering
 * the page the person was on so the form can offer the way back to it.
 */
function useRowNavigationValue(): RowNavigation {
  const navigate = useNavigate()
  const location = useLocation()
  const here = `${location.pathname}${location.search}`
  return React.useMemo(
    () => ({
      href: (formId, rowId) => formPath(formId, rowId),
      open: (formId, rowId) => {
        // The page says what it is called in the document's title.
        const label = document.title.replace(` · ${APP_NAME}`, "")
        const back: BackTarget = { to: here, label }
        void navigate(formPath(formId, rowId), { state: { back } })
      },
    }),
    [navigate, here],
  )
}

/** The frame around every route: skip link, sidebar, header and <main>. */
export function AppShell() {
  const rows = useRowNavigationValue()
  const { key } = useLocation()
  // Every move to another page, but not the first page the app opens on:
  // there, focus starts at the top of the document as it always does.
  // A layout effect: it runs before the new page's own effects, which look
  // for the mark.
  const first = React.useRef(key)
  React.useLayoutEffect(() => {
    if (key !== first.current) navigated(key)
  }, [key])
  React.useEffect(() => {
    window.addEventListener("pointerdown", settled, true)
    return () => window.removeEventListener("pointerdown", settled, true)
  }, [])
  return (
    <>
      <SkipLink />
      <SidebarProvider data-testid="app-shell">
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col outline-none">
            <RowNavigationContext value={rows}>
              <Outlet />
            </RowNavigationContext>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}
