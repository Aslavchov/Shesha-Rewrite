import { QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import { afterEach, describe, expect, it, vi } from "vitest"

import { APP_NAME, type FormRecord, type FormSummary } from "@/generated"

import { createQueryClient } from "../../api/query-client"
import { routes } from "../../routes"

const RECORD: FormRecord = {
  id: "contact",
  revision: 3,
  updatedAt: "2026-11-13T09:15:02.417Z",
  document: {
    formatVersion: 1,
    name: "Contact",
    components: [
      {
        id: "c_1",
        type: "text-field",
        name: "fullName",
        bind: "fullName",
        settings: { label: "Full name" },
      },
    ],
  },
}

const SUMMARIES: FormSummary[] = [
  {
    id: "contact",
    name: "Contact",
    description: "How to reach you.",
    updatedAt: "2026-11-13T09:15:02.417Z",
    revision: 3,
  },
  { id: "bare", name: "Bare", description: "", updatedAt: "2026-11-12T08:00:00.000Z", revision: 1 },
]

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

type Handler = (body: unknown) => Response

/** Answers each request with the handler given for its method and path: "POST /api/forms". */
function stubApi(handlers: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = handlers[`${init?.method ?? "GET"} ${url}`]
    if (!handler) throw new TypeError(`Failed to fetch ${init?.method ?? "GET"} ${url}`)
    return handler(typeof init?.body === "string" ? JSON.parse(init.body) : undefined)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

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

describe("New form", () => {
  const created: FormRecord = {
    id: "0123456789abcdef0123456789abcdef",
    revision: 1,
    updatedAt: "2026-11-13T09:15:02.417Z",
    document: { formatVersion: 1, name: "Feedback", components: [] },
  }

  it("asks for a name and a description, creates the form and opens it in the designer", async () => {
    const post = vi.fn<Handler>(() => json(created, 201))
    stubApi({
      "GET /api/forms": () => json({ forms: SUMMARIES }),
      "POST /api/forms": post,
      [`GET /api/forms/${created.id}`]: () => json(created),
    })
    const router = renderAt("/forms")

    await userEvent.click(screen.getByTestId("forms-new"))
    const dialog = await screen.findByRole("dialog", { name: "New form" })
    await userEvent.type(within(dialog).getByTestId("forms-new-name"), "  Feedback ")
    await userEvent.type(within(dialog).getByTestId("forms-new-description"), "Tell us.")
    await userEvent.click(within(dialog).getByTestId("forms-new-create"))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/designer/${created.id}`))
    // An empty document with the name trimmed, and nothing that was not decided.
    expect(post).toHaveBeenCalledExactlyOnceWith({
      document: { formatVersion: 1, name: "Feedback", description: "Tell us.", components: [] },
    })
    expect(await screen.findByTestId("designer-page")).toBeInTheDocument()
    expect(screen.getByTestId("drop-target")).toBeInTheDocument()
  })

  it("leaves the description out of the document when none is given", async () => {
    const post = vi.fn<Handler>(() => json(created, 201))
    stubApi({
      "GET /api/forms": () => json({ forms: [] }),
      "POST /api/forms": post,
      [`GET /api/forms/${created.id}`]: () => json(created),
    })
    renderAt("/forms")

    // The empty state offers New form too.
    const empty = await screen.findByTestId("forms-empty")
    await userEvent.click(within(empty).getByTestId("forms-new"))
    await userEvent.type(await screen.findByTestId("forms-new-name"), "Feedback{Enter}")

    await waitFor(() => expect(post).toHaveBeenCalledOnce())
    expect(post).toHaveBeenCalledWith({
      document: { formatVersion: 1, name: "Feedback", components: [] },
    })
  })

  it("does not create a form without a name, or with one that is too long", async () => {
    const post = vi.fn<Handler>(() => json(created, 201))
    stubApi({ "GET /api/forms": () => json({ forms: SUMMARIES }), "POST /api/forms": post })
    renderAt("/forms")
    await userEvent.click(screen.getByTestId("forms-new"))
    const name = await screen.findByTestId("forms-new-name")

    // No complaint before Create is pressed.
    expect(screen.queryByTestId("forms-new-name-error")).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId("forms-new-create"))
    expect(screen.getByTestId("forms-new-name-error")).toHaveTextContent("Give the form a name.")
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(name).toHaveFocus()

    await userEvent.click(name)
    await userEvent.paste("n".repeat(201))
    expect(screen.getByTestId("forms-new-name-error")).toHaveTextContent(
      "Use no more than 200 characters.",
    )
    await userEvent.click(screen.getByTestId("forms-new-create"))
    expect(post).not.toHaveBeenCalled()

    // The error goes as soon as the name is acceptable.
    await userEvent.clear(name)
    await userEvent.type(name, "Fine")
    expect(screen.queryByTestId("forms-new-name-error")).not.toBeInTheDocument()
  })

  it("says so when the server refuses, and stays open to try again", async () => {
    stubApi({
      "GET /api/forms": () => json({ forms: SUMMARIES }),
      "POST /api/forms": () =>
        json(
          { error: { code: "internal_error", message: "The server hit an unexpected error." } },
          500,
        ),
    })
    const router = renderAt("/forms")
    await userEvent.click(screen.getByTestId("forms-new"))
    await userEvent.type(await screen.findByTestId("forms-new-name"), "Feedback")

    await userEvent.click(screen.getByTestId("forms-new-create"))

    expect(await screen.findByTestId("forms-new-error")).toHaveTextContent(
      "The form could not be created. The server hit an unexpected error.",
    )
    expect(router.state.location.pathname).toBe("/forms")
    expect(screen.getByTestId("forms-new-name")).toHaveValue("Feedback")
  })

  it("starts from empty fields every time it is opened", async () => {
    stubApi({ "GET /api/forms": () => json({ forms: SUMMARIES }) })
    renderAt("/forms")
    await userEvent.click(screen.getByTestId("forms-new"))
    await userEvent.type(await screen.findByTestId("forms-new-name"), "Abandoned")
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await userEvent.click(screen.getByTestId("forms-new"))

    expect(await screen.findByTestId("forms-new-name")).toHaveValue("")
  })
})

describe("getting into the designer", () => {
  it("each form on the Forms page has an Open in designer action", async () => {
    stubApi({
      "GET /api/forms": () => json({ forms: SUMMARIES }),
      "GET /api/forms/bare": () => json({ ...RECORD, id: "bare" }),
    })
    const router = renderAt("/forms")

    const actions = await screen.findAllByTestId("forms-open-designer")
    expect(actions.map((action) => action.getAttribute("href"))).toEqual([
      "/designer/contact",
      "/designer/bare",
    ])
    expect(actions[1]).toHaveAccessibleName("Open Bare in designer")
    // The row itself still opens the form.
    expect(screen.getAllByTestId("forms-item")[1]).toHaveAttribute("href", "/forms/bare")

    await userEvent.click(actions[1])
    expect(router.state.location.pathname).toBe("/designer/bare")
    expect(await screen.findByTestId("designer-page")).toBeInTheDocument()
  })

  it("/designer lists the forms to open in the designer, with New form", async () => {
    stubApi({ "GET /api/forms": () => json({ forms: SUMMARIES }) })
    renderAt("/designer")

    const items = await screen.findAllByTestId("forms-item")
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/designer/contact",
      "/designer/bare",
    ])
    expect(screen.getByTestId("page-title")).toHaveTextContent("Designer")
    expect(screen.getByTestId("nav-designer")).toHaveAttribute("aria-current", "page")
    expect(screen.getByTestId("forms-new")).toBeInTheDocument()
    // Nothing here opens the form to fill in, so there is no second action.
    expect(screen.queryByTestId("forms-open-designer")).not.toBeInTheDocument()
  })
})

describe("/designer/<id>", () => {
  it("opens the form in the designer, in place of the app shell", async () => {
    stubApi({ "GET /api/forms/contact": () => json(RECORD) })
    renderAt("/designer/contact")

    expect(await screen.findByTestId("designer-page")).toBeInTheDocument()
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument()
    // One title, the form's name; the skip link still leads to <main>.
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent("Contact")
    await waitFor(() => expect(document.title).toBe(`Contact · Designer · ${APP_NAME}`))
    expect(screen.getByTestId("skip-link")).toHaveAttribute(
      "href",
      `#${screen.getByRole("main").id}`,
    )
    expect(screen.getByTestId("designer-back")).toHaveAttribute("href", "/designer")
    expect(screen.getByTestId("designer-open-form")).toHaveAttribute("href", "/forms/contact")
    expect(screen.getByTestId("theme-toggle")).toBeInTheDocument()
    expect(screen.getByTestId("outline-fullName")).toBeInTheDocument()
  })

  it("saves through the API with the revision it loaded, and reports nothing on opening", async () => {
    const put = vi.fn<Handler>((body) =>
      json({ ...RECORD, revision: 4, document: (body as { document: unknown }).document }),
    )
    const fetchMock = stubApi({
      "GET /api/forms/contact": () => json(RECORD),
      "PUT /api/forms/contact": put,
    })
    renderAt("/designer/contact")
    await screen.findByTestId("designer-page")
    expect(fetchMock).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByTestId("toolbox-item-switch"))

    await waitFor(() => expect(put).toHaveBeenCalledOnce(), { timeout: 3000 })
    const sent = put.mock.lastCall![0] as { revision: number; document: FormRecord["document"] }
    expect(sent.revision).toBe(3)
    expect(sent.document.components.map((instance) => instance.name)).toEqual([
      "fullName",
      "switch1",
    ])
    // What was already there goes back exactly as it came.
    expect(sent.document.components[0]).toEqual(RECORD.document.components[0])
    await waitFor(() =>
      expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "saved"),
    )
  })

  it("shows a not-found state with a link back for an unknown id", async () => {
    stubApi({
      "GET /api/forms/nope": () =>
        json(
          { error: { code: "form_not_found", message: "There is no form with the id nope." } },
          404,
        ),
      "GET /api/forms": () => json({ forms: [] }),
    })
    const router = renderAt("/designer/nope")

    expect(await screen.findByTestId("designer-not-found")).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    await userEvent.click(screen.getByTestId("designer-not-found-link"))
    expect(router.state.location.pathname).toBe("/designer")
  })

  it("shows an error with Retry when the form cannot be loaded, and recovers", async () => {
    let serverIsUp = false
    stubApi({
      "GET /api/forms/contact": () => {
        if (!serverIsUp) throw new TypeError("Failed to fetch")
        return json(RECORD)
      },
    })
    renderAt("/designer/contact")

    expect(await screen.findByTestId("designer-error")).toHaveTextContent("Can't load this form")

    serverIsUp = true
    await userEvent.click(screen.getByTestId("designer-error-retry"))
    expect(await screen.findByTestId("designer-page")).toBeInTheDocument()
  })

  it("does not open a form saved in a format this build cannot read", async () => {
    const future = { ...RECORD, document: { formatVersion: 2, title: "From the future" } }
    stubApi({ "GET /api/forms/contact": () => json(future) })
    renderAt("/designer/contact")

    expect(await screen.findByTestId("form-unsupported-version")).toHaveTextContent(
      "format version 2",
    )
    expect(screen.queryByTestId("designer-page")).not.toBeInTheDocument()
    expect(screen.queryByTestId("designer-toolbox")).not.toBeInTheDocument()
  })
})
