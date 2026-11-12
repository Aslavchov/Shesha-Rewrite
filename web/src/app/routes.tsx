import type { RouteObject } from "react-router"

import { AppShell } from "./layout/app-shell"
import { HOME_PAGE, NOT_FOUND_TITLE, UPCOMING_PAGES } from "./pages"
import { HomePage } from "./pages/home-page"
import { NotFoundPage } from "./pages/not-found-page"
import { UpcomingPage } from "./pages/upcoming-page"

/** Data attached to each route; the shell reads it to title the header. */
export type RouteHandle = { title: string }

const handle = (title: string): RouteHandle => ({ title })

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: HOME_PAGE.path, element: <HomePage />, handle: handle(HOME_PAGE.title) },
      ...UPCOMING_PAGES.map((page) => ({
        path: page.path,
        element: <UpcomingPage page={page} />,
        handle: handle(page.title),
      })),
      { path: "*", element: <NotFoundPage />, handle: handle(NOT_FOUND_TITLE) },
    ],
  },
]
