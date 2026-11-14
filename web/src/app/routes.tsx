import type { RouteObject } from "react-router"

import { AppShell } from "./layout/app-shell"
import { DESIGNER_PAGE, FORMS_PAGE, HOME_PAGE, UPCOMING_PAGES } from "./pages"
import { DesignerListPage } from "./pages/designer/designer-list-page"
import { DesignerPage } from "./pages/designer/designer-page"
import { FormPage } from "./pages/forms/form-page"
import { FormsPage } from "./pages/forms/forms-page"
import { HomePage } from "./pages/home-page"
import { NotFoundPage } from "./pages/not-found-page"
import { UpcomingPage } from "./pages/upcoming-page"

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: HOME_PAGE.path, element: <HomePage /> },
      { path: FORMS_PAGE.path, element: <FormsPage /> },
      { path: `${FORMS_PAGE.path}/:formId`, element: <FormPage /> },
      { path: DESIGNER_PAGE.path, element: <DesignerListPage /> },
      ...UPCOMING_PAGES.map((page) => ({ path: page.path, element: <UpcomingPage page={page} /> })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
  // The designer for one form takes the whole window, without the app shell.
  { path: `${DESIGNER_PAGE.path}/:formId`, element: <DesignerPage /> },
]
