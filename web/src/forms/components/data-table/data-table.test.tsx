import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RowNavigationContext } from "@/data/navigation"
import { fakeApi, PERSON, withData } from "@/data/testing"
import { createRegistry, FormRenderer } from "@/forms/runtime"

import { formDocument, instance } from "../../testing/render-form"
import { dataTable } from "."
import { forgetViews, nextSort, pageStatus, queryFor } from "./view"

beforeEach(forgetViews)

const SURNAMES = ["Botha", "Adams", "Cele", "Dlamini", "Erasmus", "Fourie", "Govender"]
const ROWS = SURNAMES.map((surname, index) => ({
  entity: "person",
  id: `p${index + 1}`,
  values: { surname, status: index % 2 === 0 ? "active" : "inactive", company: null },
}))

function renderTable(settings: Record<string, unknown> = {}) {
  const api = fakeApi({ rows: ROWS.map((row) => ({ ...row, values: { ...row.values } })) })
  const open = vi.fn()
  const navigation = { href: (form: string, row: string | null) => `/forms/${form}/${row}`, open }
  const document = formDocument([
    instance(
      "data-table",
      "people",
      { entity: "person", pageSize: 3, allowDelete: true, ...settings },
      { bind: null },
    ),
  ])
  render(
    <RowNavigationContext value={navigation}>
      <FormRenderer document={document} registry={createRegistry([dataTable])} mode="edit" />
    </RowNavigationContext>,
    { wrapper: withData(api) },
  )
  return { api, open, user: userEvent.setup() }
}

const status = () => screen.getByTestId("table-page-status")
const surnames = () =>
  [...document.querySelectorAll('td[data-column="surname"]')].map((cell) => cell.textContent)

describe("data table", () => {
  it("lists a page of rows, with every property as a column by default", async () => {
    renderTable()
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    expect(surnames()).toEqual(["Botha", "Adams", "Cele"])
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader")
    expect(headers.map((header) => header.textContent)).toEqual([
      ...PERSON.properties.map((property) => property.displayName),
      "Actions",
    ])
  })

  it("shows chosen columns, with their own headers, in their order", async () => {
    renderTable({ columns: [{ property: "status" }, { property: "surname", header: "Family" }] })
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader")
    expect(headers.map((header) => header.textContent)).toEqual(["Status", "Family", "Actions"])
    // A reference list column shows the item as a status tag.
    expect(
      document.querySelector('td[data-column="status"] [data-slot=status-tag]'),
    ).toHaveTextContent("Active")
  })

  it("pages on the server", async () => {
    const { api, user } = renderTable()
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    expect(screen.getByTestId("table-page-prev")).toHaveAttribute("aria-disabled", "true")
    await user.click(screen.getByTestId("table-page-next"))
    await waitFor(() => expect(status()).toHaveTextContent("4–6 of 7"))
    expect(api.queries.at(-1)?.query).toMatchObject({ page: 2, pageSize: 3 })
    await user.click(screen.getByTestId("table-page-next"))
    await waitFor(() => expect(status()).toHaveTextContent("7–7 of 7"))
    expect(screen.getByTestId("table-page-next")).toHaveAttribute("aria-disabled", "true")
  })

  it("sorts on the server and says the order with aria-sort", async () => {
    const { user } = renderTable()
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    const button = screen.getByTestId("table-sort-surname")
    const header = button.closest("th")!
    expect(header).toHaveAttribute("aria-sort", "none")
    await user.click(button)
    await waitFor(() => expect(surnames()).toEqual(["Adams", "Botha", "Cele"]))
    expect(header).toHaveAttribute("aria-sort", "ascending")
    await user.click(button)
    await waitFor(() => expect(surnames()).toEqual(["Govender", "Fourie", "Erasmus"]))
    expect(header).toHaveAttribute("aria-sort", "descending")
    await waitFor(() =>
      expect(screen.getByTestId("table-live")).toHaveTextContent(
        "Sorted by Surname, descending. 1–3 of 7.",
      ),
    )
  })

  it("searches on the server, and says when nothing matches", async () => {
    const { api, user } = renderTable()
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    await user.type(screen.getByTestId("table-search"), "dlam")
    await waitFor(() => expect(status()).toHaveTextContent("1–1 of 1"))
    expect(api.queries.at(-1)?.query.search).toBe("dlam")
    await user.clear(screen.getByTestId("table-search"))
    await user.type(screen.getByTestId("table-search"), "zzz")
    await waitFor(() =>
      expect(screen.getByTestId("table-empty")).toHaveTextContent("Nothing matches"),
    )
    await user.click(screen.getByTestId("table-clear"))
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
  })

  it("opens a row in the entity's default form, from the keyboard too", async () => {
    const { open, user } = renderTable()
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    const link = screen.getByTestId("table-open-p1")
    expect(link).toHaveAttribute("href", "/forms/person-form/p1")
    link.focus()
    await user.keyboard("{Enter}")
    expect(open).toHaveBeenLastCalledWith("person-form", "p1")
    await user.click(screen.getByTestId("table-row-p2").querySelector('td[data-column="born"]')!)
    expect(open).toHaveBeenLastCalledWith("person-form", "p2")
    await user.click(screen.getByTestId("table-new"))
    expect(open).toHaveBeenLastCalledWith("person-form", null)
  })

  it("asks before deleting, naming the row; cancel keeps it, OK removes it", async () => {
    const { api, user } = renderTable()
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    await user.click(screen.getByTestId("table-delete-p1"))
    const dialog = await screen.findByTestId("confirm-dialog")
    expect(dialog).toHaveTextContent("Delete Botha?")
    expect(screen.getByTestId("confirm-cancel")).toHaveFocus()
    await user.click(screen.getByTestId("confirm-cancel"))
    await waitFor(() => expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument())
    expect(api.rows).toHaveLength(7)

    await user.click(screen.getByTestId("table-delete-p1"))
    await user.click(await screen.findByTestId("confirm-ok"))
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 6"))
    expect(api.rows.map((row) => row.id)).not.toContain("p1")
  })

  it("leaves out New, Delete, search and filters when they are switched off", async () => {
    renderTable({ allowNew: false, allowDelete: false, search: false, filters: false })
    await waitFor(() => expect(status()).toHaveTextContent("1–3 of 7"))
    for (const id of ["table-new", "table-delete-p1", "table-search", "table-filters"]) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument()
    }
  })

  it("says what is missing without an entity", () => {
    renderTable({ entity: null })
    expect(screen.getByTestId("table-people")).toHaveTextContent("This table has no entity yet")
  })
})

describe("the table's view", () => {
  it("cycles a header through ascending, descending and none", () => {
    const view = { page: 1, sort: null, search: "", filters: {} }
    const ascending = { ...view, sort: nextSort(view, "a") }
    expect(ascending.sort).toEqual({ property: "a", direction: "asc" })
    const descending = { ...view, sort: nextSort(ascending, "a") }
    expect(descending.sort).toEqual({ property: "a", direction: "desc" })
    expect(nextSort(descending, "a")).toBeNull()
    expect(nextSort(descending, "b")).toEqual({ property: "b", direction: "asc" })
  })

  it("turns typed filters into the query's typed filters", () => {
    const born = PERSON.properties.find((property) => property.name === "born")!
    const statusProperty = PERSON.properties.find((property) => property.name === "status")!
    const query = queryFor(
      {
        page: 2,
        sort: null,
        search: " x ",
        filters: { born: { from: "1990-01-01", to: "" }, status: { value: "active" } },
      },
      [born, statusProperty],
      10,
      { search: true, filters: true },
    )
    expect(query).toEqual({
      select: ["born", "status"],
      filter: [
        { property: "born", op: "gte", value: "1990-01-01" },
        { property: "status", op: "eq", value: "active" },
      ],
      search: "x",
      page: 2,
      pageSize: 10,
    })
  })

  it("says where a page is", () => {
    expect(pageStatus(1, 10, 10, 50)).toBe("1–10 of 50")
    expect(pageStatus(5, 10, 10, 50)).toBe("41–50 of 50")
    expect(pageStatus(1, 10, 0, 0)).toBe("No rows")
  })
})
