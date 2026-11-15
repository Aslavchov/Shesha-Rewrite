import { QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { APP_NAME } from "@/generated"

import { createQueryClient } from "./api/query-client"
import { NAV_PAGES, UPCOMING_PAGES } from "./pages"
import { routes } from "./routes"

const INFO = { name: APP_NAME, version: "9.8.7", commit: "abc1234" }

/** Answers /api/info with `handler`. The Forms page gets an empty list. */
function stubInfo(handler: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (url: string) =>
    url.startsWith("/api/forms") ? new Response(JSON.stringify({ forms: [] })) : handler(),
  )
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const infoOk = () => new Response(JSON.stringify(INFO), { status: 200 })

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

afterEach(() => vi.unstubAllGlobals())

describe("app shell", () => {
  it("shows the product name and the six navigation items inside a nav landmark", () => {
    stubInfo(infoOk)
    renderAt("/")

    const sidebar = screen.getByRole("navigation", { name: "Main" })
    expect(sidebar).toHaveAttribute("data-testid", "sidebar")
    expect(within(sidebar).getByText(APP_NAME)).toBeInTheDocument()
    expect(within(sidebar).getAllByRole("link")).toHaveLength(6)
    for (const id of ["home", "forms", "designer", "entities", "themes", "settings"]) {
      expect(screen.getByTestId(`nav-${id}`)).toBeInTheDocument()
    }
  })

  it("puts the skip link first and points it at <main>", () => {
    stubInfo(infoOk)
    renderAt("/")

    const skipLink = screen.getByTestId("skip-link")
    const main = screen.getByRole("main")

    expect(document.querySelector("a, button, input")).toBe(skipLink)
    expect(skipLink).toHaveAttribute("href", `#${main.id}`)
  })

  it.each(NAV_PAGES)("renders $path with its title once, as the page's one h1", (page) => {
    stubInfo(infoOk)
    renderAt(page.path)

    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(page.title)
    expect(screen.getByTestId("page-title")).toBe(headings[0])
    expect(screen.getByRole("main")).toContainElement(headings[0])
    // The header does not repeat it.
    expect(screen.queryByTestId("header-title")).not.toBeInTheDocument()
    expect(within(screen.getByRole("banner")).queryByText(page.title)).not.toBeInTheDocument()
    expect(screen.getByTestId(`nav-${page.id}`)).toHaveAttribute("aria-current", "page")
  })

  it.each([
    ["entities", "Arrives in Phase 5."],
    ["settings", "Arrives after v1."],
  ])("%s has an empty state saying what is coming and when: %s", (id, arrival) => {
    const page = UPCOMING_PAGES.find((candidate) => candidate.id === id)
    stubInfo(infoOk)
    renderAt(page?.path ?? "")

    expect(screen.getByTestId("empty-state-description")).toHaveTextContent(
      `${page?.upcoming?.summary} ${arrival}`,
    )
  })

  it.each(["/forms", "/designer"])("%s is a built page, not an upcoming one", async (path) => {
    stubInfo(infoOk)
    renderAt(path)

    expect(UPCOMING_PAGES.map((page) => page.path)).not.toContain(path)
    expect(await screen.findByTestId("forms-empty")).toBeInTheDocument()
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument()
  })

  it("/themes is a built page: the theme editor, not an upcoming one", async () => {
    stubInfo(infoOk)
    renderAt("/themes")

    expect(UPCOMING_PAGES.map((page) => page.path)).not.toContain("/themes")
    expect(screen.getByTestId("page-title")).toHaveTextContent("Themes")
    expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument()
    // The stub answers the theme with something that is not one: the page says it could not load.
    expect(await screen.findByTestId("theme-error")).toBeInTheDocument()
  })

  it("navigates when a sidebar item is clicked", async () => {
    stubInfo(infoOk)
    const router = renderAt("/")

    await userEvent.click(screen.getByTestId("nav-entities"))

    expect(router.state.location.pathname).toBe("/entities")
    expect(screen.getByTestId("page-title")).toHaveTextContent("Entities")
  })

  it("shows Not Found for an unknown route, with a link back to Home", async () => {
    stubInfo(infoOk)
    const router = renderAt("/nope")

    expect(screen.getByTestId("not-found")).toBeInTheDocument()
    await userEvent.click(screen.getByTestId("not-found-home-link"))

    expect(router.state.location.pathname).toBe("/")
    expect(screen.getByTestId("page-title")).toHaveTextContent("Home")
  })

  it("switches theme from the header toggle", async () => {
    stubInfo(infoOk)
    renderAt("/")

    await userEvent.click(screen.getByTestId("theme-toggle"))

    expect(document.documentElement).toHaveClass("dark")
    expect(screen.getByTestId("theme-toggle")).toHaveAccessibleName("Switch to light theme")
  })
})

describe("home page", () => {
  it("shows the name, version and commit from /api/info", async () => {
    const fetchMock = stubInfo(infoOk)
    renderAt("/")

    expect(await screen.findByTestId("app-version")).toHaveTextContent(INFO.version)
    expect(screen.getByTestId("app-commit")).toHaveTextContent(INFO.commit)
    expect(screen.getByTestId("app-name")).toHaveTextContent(INFO.name)
    expect(fetchMock).toHaveBeenCalledWith("/api/info", expect.anything())
  })

  it("shows the token preview samples", () => {
    stubInfo(infoOk)
    renderAt("/")

    const preview = screen.getByTestId("token-preview")
    for (const id of ["primary", "outline", "input", "card"]) {
      expect(within(preview).getByTestId(`token-preview-${id}`)).toBeInTheDocument()
    }
  })

  it("shows an error with Retry when the server is unreachable, and recovers on Retry", async () => {
    let serverIsUp = false
    stubInfo(() => {
      if (!serverIsUp) throw new TypeError("Failed to fetch")
      return infoOk()
    })
    renderAt("/")

    const error = await screen.findByTestId("server-error")
    expect(error).toHaveTextContent("Can't reach the server")
    // The rest of the page is still there: no blank screen.
    expect(screen.getByTestId("token-preview")).toBeInTheDocument()

    await userEvent.click(screen.getByTestId("server-retry"))
    expect(await screen.findByTestId("server-error")).toBeInTheDocument()

    serverIsUp = true
    await waitFor(() => expect(screen.getByTestId("server-retry")).toBeEnabled())
    await userEvent.click(screen.getByTestId("server-retry"))

    expect(await screen.findByTestId("app-version")).toHaveTextContent(INFO.version)
    expect(screen.queryByTestId("server-error")).not.toBeInTheDocument()
  })
})
