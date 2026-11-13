import type { APIRequestContext } from "@playwright/test"

import { DEMO_FORM, expect, test } from "./support/fixtures.ts"

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

function documentNamed(name: string) {
  return {
    formatVersion: 1,
    name,
    description: `About ${name}`,
    components: [
      {
        id: "c_1",
        type: "text-field",
        name: "first",
        bind: "person.first",
        settings: { label: "First" },
      },
    ],
  }
}

/** Creates a form and removes it again when the test is done with it. */
async function createForm(request: APIRequestContext, name: string) {
  const response = await request.post("/api/forms", { data: { document: documentNamed(name) } })
  expect(response.status()).toBe(201)
  return (await response.json()) as { id: string; revision: number; updatedAt: string }
}

test.describe("C1-14 API reads", () => {
  test("/api/forms lists summaries, most recently updated first", async ({ request }) => {
    const response = await request.get("/api/forms")

    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("application/json")
    const body = await response.json()
    expect(Object.keys(body)).toEqual(["forms"])
    const demo = body.forms.find((form: { id: string }) => form.id === DEMO_FORM.id)
    expect(demo).toEqual({
      id: DEMO_FORM.id,
      name: DEMO_FORM.name,
      description: DEMO_FORM.description,
      updatedAt: expect.stringMatching(TIMESTAMP),
      revision: 1,
    })
    const updated = body.forms.map((form: { updatedAt: string }) => form.updatedAt)
    expect(updated).toEqual([...updated].sort().reverse())
  })

  test("/api/forms/<id> returns the document and its revision", async ({ request }) => {
    const response = await request.get(`/api/forms/${DEMO_FORM.id}`)

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(["document", "id", "revision", "updatedAt"])
    expect(body).toMatchObject({
      id: DEMO_FORM.id,
      revision: 1,
      updatedAt: expect.stringMatching(TIMESTAMP),
      document: { formatVersion: 1, name: DEMO_FORM.name, description: DEMO_FORM.description },
    })
    // The layout of spec section 10, top to bottom.
    expect(body.document.components.map((c: { name: string }) => c.name)).toEqual([
      "nameRow",
      "email",
      "detailsRow",
      "preferredContact",
      "notes",
      "preferences",
      "actions",
    ])
    // Sparse: an instance stores only what it changes.
    expect(body.document.components[1]).toEqual({
      id: expect.any(String),
      type: "text-field",
      name: "email",
      bind: "email",
      settings: {
        label: "Email",
        placeholder: "name@example.com",
        required: true,
        pattern: expect.any(String),
        messages: { pattern: "Enter a valid email address" },
      },
      styles: { label: { color: "#003BB2" } },
    })
  })

  test("an unknown id is 404 form_not_found", async ({ request }) => {
    const response = await request.get("/api/forms/does-not-exist")

    expect(response.status()).toBe(404)
    expect(await response.json()).toEqual({
      error: { code: "form_not_found", message: expect.stringContaining("does-not-exist") },
    })
  })
})

test.describe("C1-15 API writes", () => {
  test("create, update, stale update, invalid document, delete", async ({ request }) => {
    // Create: 201 with the stored document at revision 1.
    const created = await request.post("/api/forms", {
      data: { document: documentNamed("Leave request") },
    })
    expect(created.status()).toBe(201)
    const form = await created.json()
    expect(form).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{32}$/),
      revision: 1,
      updatedAt: expect.stringMatching(TIMESTAMP),
      document: documentNamed("Leave request"),
    })
    const url = `/api/forms/${form.id}`

    // Update: the new revision.
    const updated = await request.put(url, {
      data: { revision: 1, document: documentNamed("Leave request v2") },
    })
    expect(updated.status()).toBe(200)
    expect(await updated.json()).toMatchObject({
      id: form.id,
      revision: 2,
      document: { name: "Leave request v2" },
    })

    // Update with a stale revision: 409, nothing written.
    const stale = await request.put(url, {
      data: { revision: 1, document: documentNamed("Too late") },
    })
    expect(stale.status()).toBe(409)
    expect(await stale.json()).toEqual({
      error: { code: "revision_conflict", message: expect.stringContaining("revision 2") },
    })

    // An invalid document: 400 with every problem and its path.
    const invalid = await request.put(url, {
      data: {
        revision: 2,
        document: {
          formatVersion: 1,
          name: "Broken",
          components: [
            { id: "c_1", type: "text-field", name: "first name", bind: "first" },
            { id: "c_1", type: "text-field", name: "second", bind: "first" },
          ],
        },
      },
    })
    expect(invalid.status()).toBe(400)
    expect(await invalid.json()).toEqual({
      error: {
        code: "invalid_form",
        message: "The form document has 3 problems.",
        details: [
          { path: "components[0].name", message: expect.any(String) },
          { path: "components[1].id", message: expect.any(String) },
          { path: "components[1].bind", message: expect.any(String) },
        ],
      },
    })

    // Neither refused write changed anything.
    const current = await (await request.get(url)).json()
    expect(current).toMatchObject({ revision: 2, document: { name: "Leave request v2" } })

    // Delete: 204, and then it is gone.
    const deleted = await request.delete(url)
    expect(deleted.status()).toBe(204)
    expect(await deleted.text()).toBe("")
    expect((await request.get(url)).status()).toBe(404)
    expect((await request.delete(url)).status()).toBe(404)
  })

  test("a document in an unknown format version is refused", async ({ request }) => {
    const response = await request.post("/api/forms", {
      data: { document: { ...documentNamed("Future"), formatVersion: 2 } },
    })

    expect(response.status()).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: "invalid_form",
        message: "The form document has 1 problem.",
        details: [{ path: "formatVersion", message: expect.stringContaining("version 2") }],
      },
    })
  })

  test("a body that is not usable is 400 invalid_request", async ({ request }) => {
    const notJson = await request.post("/api/forms", {
      data: "{ not json",
      headers: { "content-type": "application/json" },
    })
    expect(notJson.status()).toBe(400)
    expect(await notJson.json()).toEqual({
      error: { code: "invalid_request", message: expect.any(String) },
    })

    const form = await createForm(request, "Needs a revision")
    const noRevision = await request.put(`/api/forms/${form.id}`, {
      data: { document: documentNamed("x") },
    })
    expect(noRevision.status()).toBe(400)
    expect((await noRevision.json()).error.code).toBe("invalid_request")
    await request.delete(`/api/forms/${form.id}`)
  })

  test("a new form appears on the Forms page and renders", async ({ page, request }) => {
    const form = await createForm(request, "Created through the API")
    try {
      await page.goto("/forms")
      const item = page.getByTestId("forms-item").filter({ hasText: "Created through the API" })
      await expect(item).toBeVisible()
      // Most recently updated first.
      await expect(page.getByTestId("forms-item").first()).toContainText("Created through the API")

      await item.click()

      await expect(page).toHaveURL(`/forms/${form.id}`)
      await expect(page.getByTestId("page-title")).toHaveText("Created through the API")
      await expect(page.getByTestId("field-first")).toBeVisible()
    } finally {
      await request.delete(`/api/forms/${form.id}`)
    }
  })
})
