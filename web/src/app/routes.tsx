import type { RouteObject } from "react-router"

import { AppShell } from "./layout/app-shell"
import { FORMS_PAGE, HOME_PAGE, NOT_FOUND_TITLE, UPCOMING_PAGES } from "./pages"
import { FormPage } from "./pages/forms/form-page"
import { FormsPage } from "./pages/forms/forms-page"
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
      { path: FORMS_PAGE.path, element: <FormsPage />, handle: handle(FORMS_PAGE.title) },
      {
        path: `${FORMS_PAGE.path}/:formId`,
        element: <FormPage />,
        // The header names the section; the page's own heading names the form.
        handle: handle(FORMS_PAGE.title),
      },
      ...UPCOMING_PAGES.map((page) => ({
        path: page.path,
        element: <UpcomingPage page={page} />,
        handle: handle(page.title),
      })),
      { path: "*", element: <NotFoundPage />, handle: handle(NOT_FOUND_TITLE) },
    ],
  },
]
