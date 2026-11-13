import { QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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
    description: "How to reach you.",
    components: [
      {
        id: "c_1",
        type: "text-field",
        name: "fullName",
        bind: "person.fullName",
        settings: { label: "Full name", required: true },
      },
      {
        id: "c_2",
        type: "text-field",
        name: "city",
        bind: "person.city",
        settings: { label: "City" },
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

const notFound = () =>
  json({ error: { code: "form_not_found", message: "There is no form with the id nope." } }, 404)

/** Answers each API path with the handler given for it. */
function stubApi(handlers: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (url: string) => {
    const handler = handlers[url]
    if (!handler) throw new TypeError(`Failed to fetch ${url}`)
    return handler()
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

describe("/forms", () => {
  it("lists every form with its name, description and last-updated time", async () => {
    stubApi({ "/api/forms": () => json({ forms: SUMMARIES }) })
    renderAt("/forms")

    const list = await screen.findByTestId("forms-list")
    const items = within(list).getAllByTestId("forms-item")
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByTestId("forms-item-name")).toHaveTextContent("Contact")
    expect(within(items[0]).getByTestId("forms-item-description")).toHaveTextContent(
      "How to reach you.",
    )
    const updated = within(items[0]).getByTestId("forms-item-updated")
    expect(updated).toHaveTextContent(/^Updated 13 Nov 2026, \d{2}:\d{2}$/)
    expect(updated.querySelector("time")).toHaveAttribute("datetime", SUMMARIES[0].updatedAt)
    // A form with no description simply has none.
    expect(within(items[1]).queryByTestId("forms-item-description")).not.toBeInTheDocument()
    expect(screen.getByTestId("page-title")).toHaveTextContent("Forms")
    expect(screen.getByTestId("nav-forms")).toHaveAttribute("aria-current", "page")
  })

  it("opens a form at /forms/<id>", async () => {
    stubApi({
      "/api/forms": () => json({ forms: SUMMARIES }),
      "/api/forms/contact": () => json(RECORD),
    })
    const router = renderAt("/forms")

    const [first] = await screen.findAllByTestId("forms-item")
    expect(first).toHaveAttribute("href", "/forms/contact")
    await userEvent.click(first)

    expect(router.state.location.pathname).toBe("/forms/contact")
    expect(await screen.findByTestId("form")).toBeInTheDocument()
  })

  it("has an empty state when there are no forms", async () => {
    stubApi({ "/api/forms": () => json({ forms: [] }) })
    renderAt("/forms")

    expect(await screen.findByTestId("forms-empty")).toHaveTextContent("No forms yet")
    expect(screen.queryByTestId("forms-list")).not.toBeInTheDocument()
  })

  it("shows an error with Retry when the list cannot be loaded, and recovers", async () => {
    let serverIsUp = false
    stubApi({
      "/api/forms": () => {
        if (!serverIsUp) throw new TypeError("Failed to fetch")
        return json({ forms: SUMMARIES })
      },
    })
    renderAt("/forms")

    expect(await screen.findByTestId("forms-error")).toHaveTextContent("Can't load the forms")

    serverIsUp = true
    await userEvent.click(screen.getByTestId("forms-error-retry"))

    expect(await screen.findByTestId("forms-list")).toBeInTheDocument()
    expect(screen.queryByTestId("forms-error")).not.toBeInTheDocument()
  })
})

describe("/forms/<id>", () => {
  it("shows the form's name as the one page title, and renders the form in edit mode", async () => {
    stubApi({ "/api/forms/contact": () => json(RECORD) })
    renderAt("/forms/contact")

    expect(await screen.findByTestId("form")).toHaveAttribute("data-mode", "edit")
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent("Contact")
    expect(screen.getByTestId("page-description")).toHaveTextContent("How to reach you.")
    await waitFor(() => expect(document.title).toBe(`Contact · ${APP_NAME}`))
    expect(screen.getByTestId("header-title")).toHaveTextContent("Forms")
    expect(screen.getByTestId("nav-forms")).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("textbox", { name: "Full name" })).toBeInTheDocument()
    expect(screen.getByTestId("form-mode-edit")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("form-mode-read-only")).toHaveAttribute("aria-pressed", "false")
    expect(screen.getByTestId("form-back-link")).toHaveAttribute("href", "/forms")
  })

  it("shows a success message and the submitted data, nested, after a valid submit", async () => {
    stubApi({ "/api/forms/contact": () => json(RECORD) })
    renderAt("/forms/contact")
    const name = await screen.findByRole("textbox", { name: "Full name" })

    // Two text inputs and no submit button: Enter alone does not submit, as
    // in any HTML form. Submit the way a Submit button would.
    const submit = () => fireEvent.submit(screen.getByTestId("form"))

    submit()
    expect(screen.getByTestId("field-fullName-error")).toBeInTheDocument()
    expect(screen.queryByTestId("form-submit-success")).not.toBeInTheDocument()
    expect(screen.queryByTestId("form-submitted-data")).not.toBeInTheDocument()

    await userEvent.type(name, "Ada Lovelace")
    submit()

    expect(screen.getByTestId("form-submit-success")).toHaveTextContent("Form submitted")
    const data = screen.getByTestId("form-submitted-data")
    expect(JSON.parse(data.textContent ?? "")).toEqual({
      person: { fullName: "Ada Lovelace", city: null },
    })
    // Formatted, not on one line.
    expect(data.textContent).toContain('\n  "person": {\n    "fullName": "Ada Lovelace"')
  })

  it("switches to read-only and back without losing what was entered", async () => {
    stubApi({ "/api/forms/contact": () => json(RECORD) })
    renderAt("/forms/contact")
    await userEvent.type(await screen.findByRole("textbox", { name: "Full name" }), "Ada")

    await userEvent.click(screen.getByTestId("form-mode-read-only"))

    expect(screen.getByTestId("form")).toHaveAttribute("data-mode", "read-only")
    expect(screen.getByTestId("form-mode-read-only")).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByTestId("field-fullName-value")).toHaveTextContent("Ada")
    expect(screen.getByTestId("field-city-value")).toHaveTextContent("No value")

    await userEvent.click(screen.getByTestId("form-mode-edit"))

    expect(screen.getByRole("textbox", { name: "Full name" })).toHaveValue("Ada")
  })

  it("shows a not-found state with a link back to Forms for an unknown id", async () => {
    stubApi({ "/api/forms/nope": notFound, "/api/forms": () => json({ forms: [] }) })
    const router = renderAt("/forms/nope")

    expect(await screen.findByTestId("form-not-found")).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.queryByTestId("form")).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId("form-not-found-link"))

    expect(router.state.location.pathname).toBe("/forms")
  })

  it("shows an error with Retry when the form cannot be loaded, and recovers", async () => {
    let serverIsUp = false
    stubApi({
      "/api/forms/contact": () => {
        if (!serverIsUp) throw new TypeError("Failed to fetch")
        return json(RECORD)
      },
    })
    renderAt("/forms/contact")

    expect(await screen.findByTestId("form-error")).toHaveTextContent("Can't load this form")
    expect(screen.queryByTestId("form-not-found")).not.toBeInTheDocument()

    serverIsUp = true
    await userEvent.click(screen.getByTestId("form-error-retry"))

    expect(await screen.findByTestId("form")).toBeInTheDocument()
  })

  it("says so when the form is saved in a format this build cannot read", async () => {
    const future = { ...RECORD, document: { formatVersion: 2, title: "From the future" } }
    stubApi({ "/api/forms/contact": () => json(future) })
    renderAt("/forms/contact")

    expect(await screen.findByTestId("form-unsupported-version")).toHaveTextContent(
      "format version 2",
    )
    expect(screen.getByTestId("page-title")).toHaveTextContent("Form")
  })

  it("encodes the id in the request path", async () => {
    const fetchMock = stubApi({ "/api/forms/a%2Fb%3Fc": notFound })
    renderAt("/forms/a%2Fb%3Fc")

    expect(await screen.findByTestId("form-not-found")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith("/api/forms/a%2Fb%3Fc", expect.anything())
  })
})
