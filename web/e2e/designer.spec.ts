import type { Page } from "@playwright/test"

import { INSTANCES } from "./support/demo-form.ts"
import {
  canvasOrder,
  columns,
  container,
  createForm,
  dragAndDrop,
  dragTo,
  dropIndicator,
  field,
  type Instance,
  layoutOf,
  liveRegion,
  openDesigner,
  outlineOrder,
  pointIn,
  readForm,
  saveStatus,
  settle,
  waitUntilSaved,
} from "./support/designer.ts"
import { DEMO_FORM, expect, test } from "./support/fixtures.ts"

// Every check in this file requires a clean console (spec section 10).
test.afterEach(({ consoleProblems }) => {
  expect(consoleProblems).toEqual([])
})

const canvas = (page: Page, name: string) => page.getByTestId(`canvas-${name}`)
const outline = (page: Page, name: string) => page.getByTestId(`outline-${name}`)
const toolbox = (page: Page, type: string) => page.getByTestId(`toolbox-item-${type}`)

/** Every instance of a stored form, at any depth. */
function flatten(components: Instance[]): Instance[] {
  return components.flatMap((instance) => [
    instance,
    ...flatten(Object.values(instance.regions ?? {}).flat()),
  ])
}

test.describe("C2-1 New form", () => {
  test("New form asks for a name, creates the form and opens it in the designer", async ({
    page,
  }) => {
    await page.goto("/forms")
    await page.getByTestId("forms-new").click()
    await page.getByTestId("forms-new-name").fill("Test form")
    await page.getByTestId("forms-new-description").fill("Made by the acceptance check.")
    await page.getByTestId("forms-new-create").click()

    await expect(page).toHaveURL(/\/designer\/[0-9a-f]{32}$/)
    await expect(page.getByTestId("designer-page")).toBeVisible()
    await expect(page.getByTestId("page-title")).toHaveText("Test form")
    // An empty canvas, with a clear place to drop the first component.
    await expect(page.getByTestId("drop-target")).toBeVisible()
    await expect(page.getByTestId("drop-target")).toContainText("Drag a component here")
    expect(await canvasOrder(page)).toEqual([])
    await expect(saveStatus(page)).toHaveAttribute("data-status", "saved")

    await page.getByTestId("designer-back").click()
    await expect(page).toHaveURL("/designer")
    await page.getByTestId("nav-forms").click()
    const item = page.getByTestId("forms-item").filter({ hasText: "Test form" })
    await expect(item).toHaveCount(1)
    await expect(item).toContainText("Made by the acceptance check.")
  })

  test("a form needs a name, and the description is optional", async ({ page, request }) => {
    await page.goto("/forms")
    await page.getByTestId("forms-new").click()
    await page.getByTestId("forms-new-name").fill("   ")
    await page.getByTestId("forms-new-create").click()

    await expect(page.getByTestId("forms-new-name-error")).toHaveText("Give the form a name.")
    await expect(page.getByTestId("forms-new-name")).toBeFocused()
    await expect(page).toHaveURL("/forms")

    await page.getByTestId("forms-new-name").fill("  Only a name  ")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\/designer\/[0-9a-f]{32}$/)

    const id = page.url().split("/").at(-1) ?? ""
    const stored = await readForm(request, id)
    expect(stored.document).toEqual({ formatVersion: 1, name: "Only a name", components: [] })
  })

  test("Designer lists the forms to open, and Forms offers Open in designer", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Listed in both", [field("alpha")])

    await page.goto("/")
    await page.getByTestId("nav-designer").click()
    await expect(page).toHaveURL("/designer")
    await expect(page.getByTestId("page-title")).toHaveText("Designer")
    await expect(page.getByTestId("forms-new")).toBeVisible()
    await page.getByTestId("forms-item").filter({ hasText: "Listed in both" }).click()
    await expect(page).toHaveURL(`/designer/${id}`)
    await expect(canvas(page, "alpha")).toBeVisible()

    await page.goto("/forms")
    const row = page.getByRole("listitem").filter({ hasText: "Listed in both" })
    await row.getByTestId("forms-open-designer").click()
    await expect(page).toHaveURL(`/designer/${id}`)
    await expect(page.getByTestId("designer-page")).toBeVisible()

    // And from the designer, the form itself is one press away.
    await page.getByTestId("designer-open-form").click()
    await expect(page).toHaveURL(`/forms/${id}`)
    await expect(page.getByTestId("form")).toBeVisible()
  })

  test("an address with no form behind it says so", async ({ page, expectRefusal }) => {
    expectRefusal(404)
    await page.goto("/designer/nope")
    await expect(page.getByTestId("designer-not-found")).toBeVisible()
    await page.getByTestId("designer-not-found-link").click()
    await expect(page).toHaveURL("/designer")
  })
})

test.describe("C2-2 Drag from toolbox", () => {
  test("dragging Text field onto the empty canvas adds textField1 and saves it", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Drag from toolbox")
    await openDesigner(page, id)

    await dragTo(page, toolbox(page, "text-field"), await pointIn(page.getByTestId("drop-target")))
    // While dragging: the indicator shows where it will land, and nothing has changed yet.
    await expect(dropIndicator(page)).toBeVisible()
    await expect(dropIndicator(page)).toHaveAttribute("data-shape", "box")
    await expect(page.getByTestId("drag-label")).toHaveText("Text field")
    expect(await canvasOrder(page)).toEqual([])

    await page.mouse.up()

    await expect(dropIndicator(page)).toHaveCount(0)
    await expect(canvas(page, "textField1")).toBeVisible()
    await expect(outline(page, "textField1")).toBeVisible()
    // The canvas shows the real component.
    await expect(page.getByTestId("designer-canvas").getByTestId("field-textField1")).toContainText(
      "Text field",
    )
    await waitUntilSaved(page)

    const stored = await readForm(request, id)
    expect(stored.revision).toBe(2)
    const [added] = stored.document.components
    expect(added).toEqual({
      id: added.id,
      type: "text-field",
      name: "textField1",
      bind: "textField1",
    })
    expect(added.id).toMatch(/^c_[0-9a-hjkmnp-tv-z]{10}$/)
  })

  test("the indicator is a line between instances, and follows the pointer", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Indicator", [field("alpha"), field("beta")])
    await openDesigner(page, id)

    await dragTo(page, toolbox(page, "switch"), await pointIn(canvas(page, "beta"), 0.5, 0.2))
    await expect(dropIndicator(page)).toHaveAttribute("data-shape", "line")
    const alpha = await canvas(page, "alpha").boundingBox()
    const beta = await canvas(page, "beta").boundingBox()
    const between = await dropIndicator(page).boundingBox()
    expect(between!.y).toBeGreaterThan(alpha!.y + alpha!.height - 1)
    expect(between!.y + between!.height).toBeLessThan(beta!.y + 1)

    // Lower on the same instance: after it.
    const below = await pointIn(canvas(page, "beta"), 0.5, 0.8)
    await page.mouse.move(below.x, below.y, { steps: 4 })
    await settle(page)
    expect((await dropIndicator(page).boundingBox())!.y).toBeGreaterThan(beta!.y + beta!.height - 1)

    await page.mouse.up()
    await expect(canvas(page, "switch1")).toBeVisible()
    expect(await canvasOrder(page)).toEqual(["alpha", "beta", "switch1"])
  })

  test("Escape cancels a drag, and a press without a drag adds nothing twice", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Cancel a drag", [field("alpha")])
    await openDesigner(page, id)

    await dragTo(page, toolbox(page, "button"), await pointIn(canvas(page, "alpha"), 0.5, 0.9))
    await expect(dropIndicator(page)).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dropIndicator(page)).toHaveCount(0)
    await expect(page.getByTestId("drag-label")).toHaveCount(0)
    await page.mouse.up()
    await settle(page)

    expect(await canvasOrder(page)).toEqual(["alpha"])
    await expect(page.getByTestId("designer-undo")).toBeDisabled()
  })
})

test.describe("C2-3 Nesting", () => {
  test("a Text field dragged into the second column renders there and nests in the outline", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Nesting")
    await openDesigner(page, id)

    // Adding without dragging: pressing a toolbox item.
    await toolbox(page, "columns").click()
    await expect(canvas(page, "columns1")).toBeVisible()
    // Both empty columns show where a component would go.
    await expect(page.getByTestId("drop-target-columns1-col1")).toBeVisible()
    await expect(page.getByTestId("drop-target-columns1-col2")).toBeVisible()

    await dragTo(
      page,
      toolbox(page, "text-field"),
      await pointIn(page.getByTestId("drop-target-columns1-col2")),
    )
    await expect(dropIndicator(page)).toHaveAttribute("data-shape", "box")
    await page.mouse.up()

    // It is in the right-hand half of the Columns.
    const row = await canvas(page, "columns1").boundingBox()
    const nested = await canvas(page, "textField1").boundingBox()
    expect(nested!.x).toBeGreaterThan(row!.x + row!.width / 2)
    expect(nested!.x + nested!.width).toBeLessThanOrEqual(row!.x + row!.width + 1)

    expect(await outlineOrder(page)).toEqual([
      "columns1",
      "columns1-col1",
      "columns1-col2",
      "textField1",
    ])
    await expect(outline(page, "textField1")).toHaveAttribute("aria-level", "3")

    await waitUntilSaved(page)
    const stored = await readForm(request, id)
    expect(layoutOf(stored.document.components)).toEqual([{ columns1: { col2: ["textField1"] } }])
  })

  test("components nest at any depth: a Container in a column, a field in the Container", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Deep nesting", [columns("row")])
    await openDesigner(page, id)

    await dragAndDrop(
      page,
      toolbox(page, "container"),
      await pointIn(page.getByTestId("drop-target-row-col1")),
    )
    await dragAndDrop(
      page,
      toolbox(page, "number-field"),
      await pointIn(page.getByTestId("drop-target-container1-content")),
    )

    await waitUntilSaved(page)
    const stored = await readForm(request, id)
    expect(layoutOf(stored.document.components)).toEqual([
      { row: { col1: [{ container1: { content: ["numberField1"] } }] } },
    ])
  })
})

test.describe("C2-4 Reorder and move", () => {
  const start = () => [field("alpha"), field("beta"), columns("row", { col1: [field("inner")] })]

  test("dragging on the canvas reorders, and moves out of a column to the top level", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Reorder on canvas", start())
    await openDesigner(page, id)

    // beta above alpha.
    await dragTo(page, canvas(page, "beta"), await pointIn(canvas(page, "alpha"), 0.5, 0.2))
    await expect(dropIndicator(page)).toBeVisible()
    await expect(page.getByTestId("drag-label")).toHaveText("beta")
    await page.mouse.up()
    expect(await canvasOrder(page)).toEqual(["beta", "alpha", "row", "inner"])
    expect(await outlineOrder(page)).toEqual([
      "beta",
      "alpha",
      "row",
      "row-col1",
      "inner",
      "row-col2",
    ])
    await expect(liveRegion(page)).toHaveText("Moved beta to position 1 of 3 in the form.")

    // inner out of its column, to the top level between beta and alpha.
    await dragAndDrop(page, canvas(page, "inner"), await pointIn(canvas(page, "alpha"), 0.5, 0.2))
    expect(await canvasOrder(page)).toEqual(["beta", "inner", "alpha", "row"])
    expect(await outlineOrder(page)).toEqual([
      "beta",
      "inner",
      "alpha",
      "row",
      "row-col1",
      "row-col2",
    ])

    // And below everything, by dropping under the form.
    const below = await pointIn(canvas(page, "row"), 0.5, 1)
    await dragAndDrop(page, canvas(page, "beta"), { x: below.x, y: below.y + 40 })
    expect(await canvasOrder(page)).toEqual(["inner", "alpha", "row", "beta"])

    await waitUntilSaved(page)
    const stored = await readForm(request, id)
    expect(layoutOf(stored.document.components)).toEqual(["inner", "alpha", "row", "beta"])
    // Moving keeps the instance: same id, same settings.
    expect(stored.document.components[0]).toEqual(field("inner"))
  })

  test("dragging in the outline reorders and moves between regions", async ({ page, request }) => {
    const id = await createForm(request, "Reorder in outline", start())
    await openDesigner(page, id)

    // alpha below beta.
    await dragTo(page, outline(page, "alpha"), await pointIn(outline(page, "beta"), 0.5, 0.8))
    await expect(dropIndicator(page)).toHaveAttribute("data-shape", "line")
    await page.mouse.up()
    expect(await outlineOrder(page)).toEqual([
      "beta",
      "alpha",
      "row",
      "row-col1",
      "inner",
      "row-col2",
    ])

    // beta into the empty second column, by dropping on the column's row.
    await dragAndDrop(page, outline(page, "beta"), await pointIn(outline(page, "row-col2")))
    expect(await outlineOrder(page)).toEqual([
      "alpha",
      "row",
      "row-col1",
      "inner",
      "row-col2",
      "beta",
    ])
    expect(await canvasOrder(page)).toEqual(["alpha", "row", "inner", "beta"])

    // inner out to the top, above alpha.
    await dragAndDrop(page, outline(page, "inner"), await pointIn(outline(page, "alpha"), 0.5, 0.2))
    expect(await outlineOrder(page)).toEqual([
      "inner",
      "alpha",
      "row",
      "row-col1",
      "row-col2",
      "beta",
    ])

    await waitUntilSaved(page)
    const stored = await readForm(request, id)
    expect(layoutOf(stored.document.components)).toEqual([
      "inner",
      "alpha",
      { row: { col2: ["beta"] } },
    ])
  })

  test("a toolbox item can be dropped on the outline too", async ({ page, request }) => {
    const id = await createForm(request, "Toolbox to outline", [container("box", [field("alpha")])])
    await openDesigner(page, id)

    await dragAndDrop(
      page,
      toolbox(page, "checkbox"),
      await pointIn(outline(page, "alpha"), 0.5, 0.2),
    )

    expect(await outlineOrder(page)).toEqual(["box", "checkbox1", "alpha"])
    expect(await canvasOrder(page)).toEqual(["box", "checkbox1", "alpha"])
  })
})

test.describe("C2-5 Refused drops", () => {
  test("a Columns cannot be dropped into one of its own columns", async ({ page, request }) => {
    const id = await createForm(request, "Refused drops", [
      columns("row", { col1: [container("box")] }),
      field("alpha"),
    ])
    await openDesigner(page, id)
    const emptyColumn = page.getByTestId("drop-target-row-col2")
    // The part of the Columns that no child covers: its empty second column.
    const grip = await pointIn(emptyColumn, 0.5, 0.5)
    expect(await canvasOrder(page)).toEqual(["row", "box", "alpha"])

    // Into its own second column.
    await dragTo(page, grip, await pointIn(emptyColumn, 0.3, 0.6))
    await expect(page.getByTestId("drag-label")).toHaveText("row")
    await expect(dropIndicator(page)).toHaveCount(0)
    // Into the Container inside its first column.
    const inside = await pointIn(page.getByTestId("drop-target-box-content"))
    await page.mouse.move(inside.x, inside.y, { steps: 6 })
    await settle(page)
    await expect(dropIndicator(page)).toHaveCount(0)
    // A place that would take it shows the indicator again: the refusal is about the target.
    const after = await pointIn(canvas(page, "alpha"), 0.5, 0.9)
    await page.mouse.move(after.x, after.y, { steps: 6 })
    await settle(page)
    await expect(dropIndicator(page)).toBeVisible()
    await page.mouse.move(inside.x, inside.y, { steps: 6 })
    await settle(page)
    await expect(dropIndicator(page)).toHaveCount(0)
    await page.mouse.up()
    await settle(page)

    // The same in the outline.
    await dragTo(page, outline(page, "row"), await pointIn(outline(page, "row-col2")))
    await expect(dropIndicator(page)).toHaveCount(0)
    await page.mouse.up()
    await settle(page)

    // Nothing changed, so nothing was saved and there is nothing to undo.
    expect(await canvasOrder(page)).toEqual(["row", "box", "alpha"])
    await expect(page.getByTestId("designer-undo")).toBeDisabled()
    await expect(saveStatus(page)).toHaveAttribute("data-status", "saved")
    expect((await readForm(request, id)).revision).toBe(1)
  })

  test("no drop may nest deeper than the server reads", async ({ page, request }) => {
    // Containers nested as deep as the server accepts a save of: 42 levels.
    let chain: Instance = container("box0")
    for (let level = 1; level < 42; level++) chain = container(`box${level}`, [chain])
    const id = await createForm(request, "As deep as it goes", [chain])
    await openDesigner(page, id)

    // One more container inside the innermost would be one level too many.
    await dragTo(
      page,
      toolbox(page, "container"),
      await pointIn(page.getByTestId("drop-target-box0-content")),
    )
    await expect(dropIndicator(page)).toHaveCount(0)
    await page.mouse.up()
    await settle(page)
    expect((await canvasOrder(page)).length).toBe(42)

    // By the keyboard it is refused in words.
    await canvas(page, "box0").focus()
    await toolbox(page, "container").focus()
    await page.keyboard.press("Enter")
    await expect(liveRegion(page)).toHaveText(
      "Added Container container1 at position 2 of 2 in box1.",
    )
    // One step up would be inside box0, which is too deep: the step passes over it.
    await page.keyboard.press("Alt+ArrowUp")
    await expect(liveRegion(page)).toHaveText("Moved container1 to position 1 of 2 in box1.")

    await waitUntilSaved(page)
    expect(flatten((await readForm(request, id)).document.components)).toHaveLength(43)
  })
})

test.describe("C2-6 Selection", () => {
  test("the canvas, the outline and the properties area always show the same selection", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Selection", [
      field("alpha"),
      columns("row", { col1: [field("beta", "date-picker")] }),
    ])
    await openDesigner(page, id)
    const properties = page.getByTestId("designer-properties")
    await expect(properties).toContainText("Nothing is selected")
    // Since Phase 3, nothing selected means the form's own properties.
    await expect(page.getByTestId("props-form-name")).toHaveValue("Selection")

    await canvas(page, "alpha").click()
    await expect(canvas(page, "alpha")).toHaveAttribute("aria-pressed", "true")
    await expect(outline(page, "alpha")).toHaveAttribute("aria-selected", "true")
    await expect(page.getByTestId("designer-properties-name")).toHaveText("alpha")
    await expect(page.getByTestId("designer-properties-type")).toHaveText("Text field")
    await expect(page.getByTestId("props-name")).toHaveValue("alpha")

    await outline(page, "beta").click()
    await expect(outline(page, "beta")).toHaveAttribute("aria-selected", "true")
    await expect(outline(page, "alpha")).toHaveAttribute("aria-selected", "false")
    await expect(canvas(page, "beta")).toHaveAttribute("aria-pressed", "true")
    await expect(canvas(page, "alpha")).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByTestId("designer-properties-name")).toHaveText("beta")
    await expect(page.getByTestId("designer-properties-type")).toHaveText("Date picker")

    // A container is selected by pressing a part of it that no child covers.
    await page.getByTestId("drop-target-row-col2").click({ force: true })
    await expect(canvas(page, "row")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("designer-properties-type")).toHaveText("Columns")

    await page.keyboard.press("Escape")
    await expect(canvas(page, "row")).toHaveAttribute("aria-pressed", "false")
    await expect(
      page.getByTestId("designer-outline").locator('[aria-selected="true"]'),
    ).toHaveCount(0)
    await expect(properties).toContainText("Nothing is selected")
    await expect(page.getByTestId("designer-delete")).toBeDisabled()
    await expect(page.getByTestId("designer-duplicate")).toBeDisabled()
  })

  test("the selected instance is outlined, and hovering shows which one a press would select", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Outlines", [field("alpha"), field("beta")])
    await openDesigner(page, id)
    // Since Phase 3 the ring is drawn a little outside the box (section 5).
    const ring = (name: string) =>
      canvas(page, name)
        .locator("[data-slot=canvas-outline]")
        .evaluate((element) => getComputedStyle(element).boxShadow)

    expect(await ring("alpha")).toBe("none")
    await canvas(page, "alpha").hover()
    const hovered = await ring("alpha")
    expect(hovered).not.toBe("none")
    expect(await ring("beta")).toBe("none")

    await canvas(page, "alpha").click()
    await canvas(page, "beta").hover()
    const selected = await ring("alpha")
    expect(selected).not.toBe("none")
    expect(selected).not.toBe(hovered)

    // A press on the canvas outside every instance clears the selection.
    await page.getByTestId("designer-canvas").click({ position: { x: 8, y: 8 } })
    await expect(canvas(page, "alpha")).toHaveAttribute("aria-pressed", "false")
  })

  test("the canvas cannot be typed into: its form is the real one, made inert", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Inert canvas", [field("alpha")])
    await openDesigner(page, id)
    const control = page.getByTestId("designer-canvas").getByTestId("field-alpha-control")
    await expect(control).toBeVisible()

    await canvas(page, "alpha").click()
    await page.keyboard.type("hello")

    await expect(control).toHaveValue("")
    expect(await control.evaluate((element) => element.closest("[inert]") !== null)).toBe(true)
  })
})

test.describe("C2-7 Commands", () => {
  test("delete, undo, redo and undo again: the instance comes back in place, the same", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Commands", [
      field("alpha"),
      field("beta"),
      field("gamma"),
    ])
    await openDesigner(page, id)
    const idOf = (name: string) => canvas(page, name).getAttribute("data-canvas-item")

    await canvas(page, "beta").click()
    await page.getByTestId("designer-delete").click()
    expect(await canvasOrder(page)).toEqual(["alpha", "gamma"])
    await expect(liveRegion(page)).toHaveText("Deleted beta.")
    // The selection moves to the next sibling.
    await expect(canvas(page, "gamma")).toHaveAttribute("aria-pressed", "true")

    await page.getByTestId("designer-undo").click()
    expect(await canvasOrder(page)).toEqual(["alpha", "beta", "gamma"])
    expect(await idOf("beta")).toBe("c_beta")
    await expect(canvas(page, "beta")).toHaveAttribute("aria-pressed", "true")
    await expect(liveRegion(page)).toHaveText("Undid: Delete beta.")

    await page.getByTestId("designer-redo").click()
    expect(await canvasOrder(page)).toEqual(["alpha", "gamma"])
    await expect(page.getByTestId("designer-redo")).toBeDisabled()

    await page.getByTestId("designer-undo").click()
    expect(await canvasOrder(page)).toEqual(["alpha", "beta", "gamma"])
    await expect(page.getByTestId("designer-undo")).toBeDisabled()

    // Back where it started: what is stored is what was stored.
    await waitUntilSaved(page)
    const stored = await readForm(request, id)
    expect(stored.document.components).toEqual([field("alpha"), field("beta"), field("gamma")])
  })

  test("duplicating a Columns copies its child, and both copies get new unique names", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Duplicate", [
      columns("columns1", { col2: [field("textField1")] }),
    ])
    await openDesigner(page, id)

    await outline(page, "columns1").click()
    await page.getByTestId("designer-duplicate").click()

    expect(await outlineOrder(page)).toEqual([
      "columns1",
      "columns1-col1",
      "columns1-col2",
      "textField1",
      "columns2",
      "columns2-col1",
      "columns2-col2",
      "textField2",
    ])
    await expect(canvas(page, "columns2")).toHaveAttribute("aria-pressed", "true")
    await expect(liveRegion(page)).toHaveText(
      "Duplicated columns1 as columns2, at position 2 of 2 in the form.",
    )

    await waitUntilSaved(page)
    const stored = await readForm(request, id)
    const all = flatten(stored.document.components)
    expect(new Set(all.map((instance) => instance.id)).size).toBe(4)
    const copy = stored.document.components[1].regions!.col2[0]
    expect(copy).toMatchObject({
      name: "textField2",
      bind: "textField2",
      settings: { label: "textField1" },
    })
  })

  test("undo and redo have the platform's shortcuts, and cover every kind of change", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Undo everything", [field("alpha"), columns("row")])
    await openDesigner(page, id)

    await toolbox(page, "button").click()
    await dragAndDrop(
      page,
      canvas(page, "alpha"),
      await pointIn(page.getByTestId("drop-target-row-col1")),
    )
    await canvas(page, "button1").click()
    await page.keyboard.press("Control+d")
    await page.keyboard.press("Delete")
    expect(await canvasOrder(page)).toEqual(["row", "alpha", "button1"])

    for (const expected of [
      ["row", "alpha", "button1", "button2"],
      ["row", "alpha", "button1"],
      ["alpha", "row", "button1"],
      ["alpha", "row"],
    ]) {
      await page.keyboard.press("Control+z")
      expect(await canvasOrder(page)).toEqual(expected)
    }
    await expect(page.getByTestId("designer-undo")).toBeDisabled()

    await page.keyboard.press("Control+y")
    expect(await canvasOrder(page)).toEqual(["alpha", "row", "button1"])
    await page.keyboard.press("Control+Shift+z")
    expect(await canvasOrder(page)).toEqual(["row", "alpha", "button1"])
  })
})

/** The focused element's test id, and whether it shows the app's focus ring. */
function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return null
    const style = getComputedStyle(element)
    return {
      testId: element.getAttribute("data-testid"),
      hasRing:
        style.outlineStyle === "solid" &&
        parseFloat(style.outlineWidth) >= 2 &&
        !/rgba?\(0, 0, 0, 0\)|transparent/.test(style.outlineColor),
    }
  })
}

/** Presses Tab until the element with this test id has focus. Every stop on the way must show the ring. */
async function tabTo(page: Page, testId: string) {
  for (let presses = 0; presses < 60; presses++) {
    await page.keyboard.press("Tab")
    const now = await focused(page)
    expect(now?.hasRing, `focus ring on ${now?.testId}`).toBe(true)
    if (now?.testId === testId) return
  }
  throw new Error(`Tab never reached ${testId}.`)
}

test.describe("C2-8 Keyboard only", () => {
  test("add, move into a column, move to the top, delete and undo, without the mouse", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Keyboard only", [columns("row"), field("alpha")])
    await openDesigner(page, id)

    // Add a Text field: Tab to it in the toolbox, Enter.
    await tabTo(page, "toolbox-item-text-field")
    await page.keyboard.press("Enter")
    await expect(liveRegion(page)).toHaveText(
      "Added Text field textField1 at position 3 of 3 in the form.",
    )
    await expect(canvas(page, "textField1")).toHaveAttribute("aria-pressed", "true")

    // Move it up: over alpha, then into the second column, then the first.
    await page.keyboard.press("Alt+ArrowUp")
    await expect(liveRegion(page)).toHaveText("Moved textField1 to position 2 of 3 in the form.")
    await page.keyboard.press("Alt+ArrowUp")
    await expect(liveRegion(page)).toHaveText("Moved textField1 to position 1 of 1 in col2 of row.")
    expect(await outlineOrder(page)).toEqual(["row", "row-col1", "row-col2", "textField1", "alpha"])
    await page.keyboard.press("Alt+ArrowUp")
    await expect(liveRegion(page)).toHaveText("Moved textField1 to position 1 of 1 in col1 of row.")

    // To the top of the form, and no further.
    await page.keyboard.press("Alt+ArrowUp")
    await expect(liveRegion(page)).toHaveText("Moved textField1 to position 1 of 3 in the form.")
    expect(await canvasOrder(page)).toEqual(["textField1", "row", "alpha"])
    await page.keyboard.press("Alt+ArrowUp")
    await expect(liveRegion(page)).toHaveText("textField1 is already at the top of the form.")
    // Focus never left the toolbox item, and its ring is still showing.
    expect(await focused(page)).toEqual({ testId: "toolbox-item-text-field", hasRing: true })

    // Delete acts from where the selection is shown: Tab on to the canvas.
    await tabTo(page, "canvas-textField1")
    await page.keyboard.press("Delete")
    await expect(liveRegion(page)).toHaveText("Deleted textField1.")
    expect(await canvasOrder(page)).toEqual(["row", "alpha"])
    // Focus went with the selection, to the next instance.
    expect(await focused(page)).toEqual({ testId: "canvas-row", hasRing: true })

    await page.keyboard.press("Control+z")
    await expect(liveRegion(page)).toHaveText("Undid: Delete textField1.")
    expect(await canvasOrder(page)).toEqual(["textField1", "row", "alpha"])
    expect(await focused(page)).toEqual({ testId: "canvas-textField1", hasRing: true })

    await waitUntilSaved(page)
    const stored = await readForm(request, id)
    expect(layoutOf(stored.document.components)).toEqual(["textField1", "row", "alpha"])
  })

  test("the arrow keys select on the canvas and in the outline, and duplicate has a shortcut", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Arrow keys", [
      field("alpha"),
      container("box", [field("beta")]),
      field("gamma"),
    ])
    await openDesigner(page, id)

    await tabTo(page, "canvas-alpha")
    await page.keyboard.press("ArrowDown")
    expect(await focused(page)).toEqual({ testId: "canvas-box", hasRing: true })
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowDown")
    expect(await focused(page)).toEqual({ testId: "canvas-gamma", hasRing: true })
    await expect(outline(page, "gamma")).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Home")
    expect((await focused(page))?.testId).toBe("canvas-alpha")

    // The outline is a tree: one Tab stop, arrows inside it.
    await tabTo(page, "outline-alpha")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("ArrowRight")
    expect(await focused(page)).toEqual({ testId: "outline-beta", hasRing: true })
    await page.keyboard.press("ArrowLeft")
    expect((await focused(page))?.testId).toBe("outline-box")
    await page.keyboard.press("End")
    expect((await focused(page))?.testId).toBe("outline-gamma")
    await expect(canvas(page, "gamma")).toHaveAttribute("aria-pressed", "true")

    await page.keyboard.press("Control+d")
    await expect(liveRegion(page)).toHaveText(
      "Duplicated gamma as textField1, at position 4 of 4 in the form.",
    )
    expect(await focused(page)).toEqual({ testId: "outline-textField1", hasRing: true })

    // Moving with the keyboard from the outline keeps focus on the moved row.
    await page.keyboard.press("Alt+ArrowUp")
    await page.keyboard.press("Alt+ArrowUp")
    await expect(liveRegion(page)).toHaveText("Moved textField1 to position 2 of 2 in box.")
    expect(await focused(page)).toEqual({ testId: "outline-textField1", hasRing: true })
  })

  test("the shortcuts are listed where people can find them", async ({ page, request }) => {
    const id = await createForm(request, "Shortcuts")
    await openDesigner(page, id)

    await page.getByTestId("designer-shortcuts").focus()
    await page.keyboard.press("Enter")

    const list = page.getByTestId("designer-shortcuts-list")
    await expect(list).toBeVisible()
    for (const label of ["Undo", "Redo", "Duplicate", "Delete", "Move up", "Move down"]) {
      await expect(list).toContainText(label)
    }
    await page.keyboard.press("Escape")
    await expect(list).toBeHidden()
    await expect(page.getByTestId("designer-shortcuts")).toBeFocused()
  })
})

test.describe("C2-9 Persistence", () => {
  test("the layout survives a reload, the form shows it, and nothing default is stored", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Persistence")
    await openDesigner(page, id)

    await toolbox(page, "columns").click()
    await dragAndDrop(
      page,
      toolbox(page, "text-field"),
      await pointIn(page.getByTestId("drop-target-columns1-col1")),
    )
    await dragAndDrop(
      page,
      toolbox(page, "select"),
      await pointIn(page.getByTestId("drop-target-columns1-col2")),
    )
    await outline(page, "columns1").click()
    await toolbox(page, "text-area").click()
    await toolbox(page, "button").click()
    await dragAndDrop(
      page,
      canvas(page, "button1"),
      await pointIn(canvas(page, "columns1"), 0.5, 0),
    )
    const order = ["button1", "columns1", "textField1", "select1", "textArea1"]
    expect(await canvasOrder(page)).toEqual(order)
    await waitUntilSaved(page)
    const outlineBefore = await outlineOrder(page)

    await page.reload()
    await expect(page.getByTestId("designer-page")).toBeVisible()
    await expect(canvas(page, "textArea1")).toBeVisible()
    expect(await canvasOrder(page)).toEqual(order)
    expect(await outlineOrder(page)).toEqual(outlineBefore)
    await expect(saveStatus(page)).toHaveAttribute("data-status", "saved")

    // The running form has the same instances in the same order.
    await page.goto(`/forms/${id}`)
    await expect(page.getByTestId("form")).toBeVisible()
    const runtime = await page
      .getByTestId("form")
      .locator("[data-testid^=field-]")
      .evaluateAll((elements) =>
        elements
          .map((element) => element.getAttribute("data-testid") ?? "")
          .filter((testId) => /^field-[^-]+$/.test(testId))
          .map((testId) => testId.replace("field-", "")),
      )
    expect(runtime).toEqual(order)

    // What is stored: ids, types, names and data paths. No settings at all.
    const stored = await readForm(request, id)
    expect(layoutOf(stored.document.components)).toEqual([
      "button1",
      { columns1: { col1: ["textField1"], col2: ["select1"] } },
      "textArea1",
    ])
    for (const instance of flatten(stored.document.components)) {
      expect(Object.keys(instance).sort(), instance.name).toEqual(
        ["bind", "id", "name", "regions", "type"].filter(
          (key) =>
            (key !== "bind" || !["button1", "columns1"].includes(instance.name)) &&
            (key !== "regions" || instance.name === "columns1"),
        ),
      )
      expect(instance.id).toMatch(/^c_[0-9a-hjkmnp-tv-z]{10}$/)
      if (instance.bind !== undefined) expect(instance.bind).toBe(instance.name)
    }
  })

  test("changes are saved by themselves, shortly after the last edit", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Autosave")
    await openDesigner(page, id)
    const saves: number[] = []
    page.on("request", (sent) => {
      if (sent.method() === "PUT")
        saves.push((sent.postDataJSON() as { revision: number }).revision)
    })

    // Three quick edits: one save, of all three, based on the revision that was loaded.
    await toolbox(page, "text-field").click()
    await toolbox(page, "text-field").click()
    await toolbox(page, "text-field").click()
    await expect(saveStatus(page)).toHaveAttribute("data-status", "saving")
    await expect(saveStatus(page)).toHaveText("Saving…")
    await waitUntilSaved(page)
    await expect(saveStatus(page)).toHaveText("Saved")
    expect(saves).toEqual([1])
    expect((await readForm(request, id)).document.components).toHaveLength(3)

    // Leaving the designer straight after an edit still saves it.
    await toolbox(page, "button").click()
    await page.getByTestId("designer-back").click()
    await expect(page).toHaveURL("/designer")
    await expect.poll(async () => (await readForm(request, id)).document.components.length).toBe(4)
    expect(saves).toEqual([1, 2])
  })
})

test.describe("C2-10 Preview", () => {
  test("Preview is the interactive form; Design comes back as it was left", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Preview", [field("alpha"), columns("row")])
    await openDesigner(page, id)
    await toolbox(page, "text-field").click()
    await dragAndDrop(
      page,
      canvas(page, "textField1"),
      await pointIn(page.getByTestId("drop-target-row-col2")),
    )
    await canvas(page, "alpha").click()
    const order = await canvasOrder(page)
    const outlineBefore = await outlineOrder(page)

    await page.getByTestId("designer-mode-preview").click()
    await expect(page.getByTestId("designer-mode-preview")).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("designer-canvas")).toHaveAttribute("data-mode", "preview")
    await expect(page.getByTestId("form")).toHaveAttribute("data-mode", "edit")
    // No design furniture: no instance boxes to select.
    expect(await canvasOrder(page)).toEqual([])

    // It can be typed into, and it validates, like the running form.
    const control = page.getByTestId("field-textField1-control")
    await control.fill("typed in preview")
    await expect(control).toHaveValue("typed in preview")
    // Nothing can be changed from the preview.
    await expect(page.getByTestId("designer-undo")).toBeDisabled()
    await expect(page.getByTestId("designer-delete")).toBeDisabled()
    await page.keyboard.press("Control+z")

    await page.getByTestId("designer-mode-design").click()
    await expect(page.getByTestId("designer-canvas")).toHaveAttribute("data-mode", "design")
    expect(await canvasOrder(page)).toEqual(order)
    expect(await outlineOrder(page)).toEqual(outlineBefore)
    // The selection is kept.
    await expect(canvas(page, "alpha")).toHaveAttribute("aria-pressed", "true")
    await expect(outline(page, "alpha")).toHaveAttribute("aria-selected", "true")
    // And so is the undo history: both changes can still be undone.
    await page.getByTestId("designer-undo").click()
    await page.getByTestId("designer-undo").click()
    expect(await canvasOrder(page)).toEqual(["alpha", "row"])
    await expect(page.getByTestId("designer-undo")).toBeDisabled()
  })
})

test.describe("C2-11 Existing form", () => {
  /** Where each instance of the form is, relative to the form itself. */
  const boxes = (page: Page) =>
    page.getByTestId("form").evaluate((form) => {
      const origin = form.getBoundingClientRect()
      const found: Record<string, number[]> = {}
      for (const element of form.querySelectorAll("[data-testid^=field-]")) {
        const testId = element.getAttribute("data-testid") ?? ""
        if (!/^field-[^-]+$/.test(testId)) continue
        const box = element.getBoundingClientRect()
        found[testId] = [box.x - origin.x, box.y - origin.y, box.width, box.height].map(
          (value) => Math.round(value * 10) / 10,
        )
      }
      return found
    })

  test("Person details looks on the canvas as it does when it runs", async ({ page }) => {
    await page.goto(DEMO_FORM.path)
    await expect(page.getByTestId("form")).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const running = await boxes(page)
    expect(Object.keys(running)).toHaveLength(INSTANCES.length)

    await openDesigner(page, DEMO_FORM.id)
    await expect(canvas(page, "reset")).toBeVisible()
    await page.evaluate(() => document.fonts.ready)

    // Every instance, in the same place and at the same size, to a tenth of a pixel.
    expect(await boxes(page)).toEqual(running)
    // Including the blue Email label: the style override reaches the canvas.
    const label = page.getByTestId("designer-canvas").locator('[data-testid="field-email"] label')
    expect(await label.evaluate((element) => getComputedStyle(element).color)).toBe(
      "rgb(0, 59, 178)",
    )
    // Each instance has its box on the canvas, exactly over it, and its row in the outline.
    expect(await canvasOrder(page)).toEqual([...INSTANCES])
    for (const name of INSTANCES) await expect(outline(page, name)).toBeVisible()
    const email = await canvas(page, "email").boundingBox()
    const drawn = await page.getByTestId("designer-canvas").getByTestId("field-email").boundingBox()
    expect(email).toEqual(drawn)
  })

  test("opening a form changes nothing: the revision moves only on an edit", async ({
    page,
    request,
  }) => {
    const id = await createForm(request, "Opened, not edited", [
      field("alpha"),
      columns("row", { col1: [field("beta")] }),
    ])
    const saves: string[] = []
    page.on("request", (sent) => {
      if (sent.method() !== "GET") saves.push(`${sent.method()} ${sent.url()}`)
    })

    await openDesigner(page, id)
    // Looking around is not editing: select, preview, come back.
    await canvas(page, "alpha").click()
    await outline(page, "beta").click()
    await page.getByTestId("designer-mode-preview").click()
    await page.getByTestId("designer-mode-design").click()
    await page.keyboard.press("Escape")
    await page.waitForTimeout(1500)

    expect(saves).toEqual([])
    await expect(saveStatus(page)).toHaveAttribute("data-status", "saved")
    expect((await readForm(request, id)).revision).toBe(1)

    await canvas(page, "alpha").click()
    await page.keyboard.press("Delete")
    await expect.poll(async () => (await readForm(request, id)).revision).toBe(2)
  })

  test("the seeded form opens in the designer without being saved", async ({ page, request }) => {
    const before = await readForm(request, DEMO_FORM.id)

    await openDesigner(page, DEMO_FORM.id)
    await expect(canvas(page, "email")).toBeVisible()
    await page.waitForTimeout(1200)

    const after = await readForm(request, DEMO_FORM.id)
    expect(after.revision).toBe(before.revision)
    expect(after.document).toEqual(before.document)
  })
})

test.describe("C2-12 Conflict", () => {
  test("a change made in a second tab is not saved over the first; it offers a reload", async ({
    page,
    context,
    request,
  }) => {
    const id = await createForm(request, "Two tabs", [field("alpha")])
    const second = await context.newPage()
    const secondProblems: string[] = []
    second.on("console", (message) => {
      // The refused save is a 409 the browser reports; that one is expected here.
      if (message.type() === "error" && !message.text().includes("409")) {
        secondProblems.push(message.text())
      }
    })
    await openDesigner(page, id)
    await openDesigner(second, id)

    // The first tab changes the form, and that is saved.
    await toolbox(page, "text-field").click()
    await waitUntilSaved(page)

    // The second tab, still on the old revision, changes it too.
    await toolbox(second, "button").click()
    await expect(second.getByTestId("designer-conflict")).toBeVisible()
    await expect(second.getByTestId("designer-conflict")).toContainText(
      "This form was changed somewhere else",
    )
    await expect(saveStatus(second)).toHaveAttribute("data-status", "conflict")
    await expect(saveStatus(second)).toContainText("Not saved")
    // Nothing was overwritten: the server has the first tab's change, and only that.
    const stored = await readForm(request, id)
    expect(stored.revision).toBe(2)
    expect(layoutOf(stored.document.components)).toEqual(["alpha", "textField1"])
    // And autosave has stopped: the designer cannot be changed until it is reloaded.
    expect(
      await toolbox(second, "button").evaluate((element) => element.closest("[inert]") !== null),
    ).toBe(true)
    await second.waitForTimeout(1200)
    expect((await readForm(request, id)).revision).toBe(2)

    // Reloading brings the form as it is now, and saving works again.
    await second.getByTestId("designer-conflict-reload").click()
    await expect(second.getByTestId("designer-conflict")).toHaveCount(0)
    expect(await canvasOrder(second)).toEqual(["alpha", "textField1"])
    await expect(saveStatus(second)).toHaveAttribute("data-status", "saved")
    await toolbox(second, "button").click()
    await waitUntilSaved(second)
    const after = await readForm(request, id)
    expect(after.revision).toBe(3)
    expect(layoutOf(after.document.components)).toEqual(["alpha", "textField1", "button1"])

    expect(secondProblems).toEqual([])
    await second.close()
  })
})

test.describe("C2-13 Many components", () => {
  test("with fifty instances, dragging the last one to the top scrolls the canvas on the way", async ({
    page,
    request,
  }) => {
    const names = Array.from({ length: 50 }, (_, index) => `item${index + 1}`)
    const id = await createForm(
      request,
      "Fifty",
      names.map((name) => field(name)),
    )
    await openDesigner(page, id)
    const pane = page.getByTestId("designer-canvas")
    const scrollTop = () => pane.evaluate((element) => element.scrollTop)

    await canvas(page, "item50").scrollIntoViewIfNeeded()
    expect(await scrollTop()).toBeGreaterThan(1000)

    // Drag it to just inside the top edge of the canvas, and hold it there.
    const paneBox = (await pane.boundingBox())!
    const edge = { x: paneBox.x + paneBox.width / 2, y: paneBox.y + 12 }
    await dragTo(page, canvas(page, "item50"), edge)
    await expect.poll(scrollTop, { timeout: 20_000 }).toBe(0)

    // Now the first instance is in view: drop above it.
    const top = await pointIn(canvas(page, "item1"), 0.5, 0.2)
    await page.mouse.move(top.x, top.y, { steps: 5 })
    await settle(page)
    await expect(dropIndicator(page)).toBeVisible()
    await page.mouse.up()

    expect((await canvasOrder(page)).slice(0, 3)).toEqual(["item50", "item1", "item2"])
    await waitUntilSaved(page)
    expect((await readForm(request, id)).document.components[0].name).toBe("item50")
  })
})

test.describe("Instances the form does not show", () => {
  test("children in a region beyond the column count are kept, and marked hidden in the outline", async ({
    page,
    request,
  }) => {
    // Two columns, with something still stored in a third.
    const id = await createForm(request, "Hidden column", [
      columns("row", { col1: [field("shown")], col3: [field("lost")] }, { columns: 2 }),
    ])
    await openDesigner(page, id)

    // Not on the canvas, but in the outline, marked.
    expect(await canvasOrder(page)).toEqual(["row", "shown"])
    expect(await outlineOrder(page)).toEqual([
      "row",
      "row-col1",
      "shown",
      "row-col2",
      "row-col3",
      "lost",
    ])
    await expect(outline(page, "lost")).toHaveAttribute("data-hidden", "true")
    await expect(outline(page, "lost")).toContainText("Hidden")
    await expect(outline(page, "row-col3")).toContainText("Hidden")
    await expect(outline(page, "shown")).not.toContainText("Hidden")

    await outline(page, "lost").click()
    await expect(page.getByTestId("designer-properties-hidden")).toBeVisible()

    // Changing something else does not lose it.
    await toolbox(page, "button").click()
    await waitUntilSaved(page)
    expect(layoutOf((await readForm(request, id)).document.components)).toEqual([
      { row: { col1: ["shown"], col3: ["lost"] } },
      "button1",
    ])

    // And it can be brought back into the form.
    await dragAndDrop(page, outline(page, "lost"), await pointIn(outline(page, "row-col2")))
    await expect(outline(page, "lost")).not.toHaveAttribute("data-hidden", "true")
    await expect(canvas(page, "lost")).toBeVisible()
  })
})

test.describe("C2-14 Small fixes from earlier phases", () => {
  test("empty and not-found states are as tall as their content, not the page", async ({
    page,
    expectRefusal,
  }) => {
    // The form that is not found is a 404 from the API.
    expectRefusal(404)
    for (const [path, testId] of [
      // Entities was built in Phase 5; Settings is still to come.
      ["/settings", "empty-state"],
      ["/nope", "not-found"],
      ["/forms/nope", "form-not-found"],
    ]) {
      await page.goto(path)
      const state = page.getByTestId(testId)
      await expect(state).toBeVisible()
      const box = (await state.boundingBox())!
      // The window is 720 tall; stretched, the box filled most of it.
      expect(box.height, path).toBeLessThan(320)
    }
  })

  test("on a form page, the Edit / Read-only switch sits with the form it controls", async ({
    page,
  }) => {
    await page.goto(DEMO_FORM.path)
    const modeSwitch = (await page.getByRole("group", { name: "Form mode" }).boundingBox())!
    const form = (await page.locator('[data-slot="card"]').first().boundingBox())!

    // Directly above the form's card, starting at its left edge.
    expect(Math.abs(modeSwitch.x - form.x)).toBeLessThan(1)
    const gap = form.y - (modeSwitch.y + modeSwitch.height)
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThan(16)

    await page.getByTestId("form-mode-read-only").click()
    await expect(page.getByTestId("form")).toHaveAttribute("data-mode", "read-only")
  })

  test("each page shows its title once, the designer included", async ({ page, request }) => {
    await page.goto(DEMO_FORM.path)
    await expect(page.getByTestId("page-title")).toHaveText(DEMO_FORM.name)
    await expect(page.getByTestId("header-title")).toHaveCount(0)
    await expect(page.locator("h1")).toHaveCount(1)
    await expect(page.locator("header").getByText("Forms", { exact: true })).toHaveCount(0)

    const id = await createForm(request, "Titled once")
    await openDesigner(page, id)
    await expect(page.locator("h1")).toHaveCount(1)
    await expect(page.getByText("Titled once", { exact: true })).toHaveCount(1)
    await expect(page).toHaveTitle(/^Titled once · Designer · /)
  })

  test("Text area shows a character count when it has a maximum length", async ({ page }) => {
    await page.goto(DEMO_FORM.path)
    const count = page.getByTestId("field-notes-count")
    await expect(count).toHaveText("0 / 500 characters")

    const notes = page.getByTestId("field-notes-control")
    await notes.fill("Hello")
    await expect(count).toHaveText("5 / 500 characters")
    // The count is part of what describes the control.
    const describedBy = (await notes.getAttribute("aria-describedby")) ?? ""
    expect(describedBy.split(" ")).toContain(await count.getAttribute("id"))

    await notes.fill("x".repeat(501))
    await expect(count).toHaveText("501 / 500 characters")
    await expect(count).toHaveAttribute("data-over", "true")
  })

  test("a Text area without a maximum length shows no count", async ({ page, request }) => {
    const id = await createForm(request, "No count", [field("free", "text-area")])
    await page.goto(`/forms/${id}`)
    await expect(page.getByTestId("field-free-control")).toBeVisible()
    await expect(page.getByTestId("field-free-count")).toHaveCount(0)
  })
})

test.describe("C2-17 The designer in both themes, and narrow", () => {
  test("nothing in the designer is clipped or scrolls sideways at 1280 pixels", async ({
    page,
  }) => {
    await openDesigner(page, DEMO_FORM.id)
    for (const theme of ["light", "dark"]) {
      if (theme === "dark") await page.getByTestId("theme-toggle").click()
      const overflow = await page.evaluate(() => {
        const root = document.documentElement
        return root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight
      })
      expect(overflow, theme).toBe(false)
      for (const testId of [
        "designer-toolbox",
        "designer-canvas",
        "designer-outline",
        "designer-properties",
        "designer-undo",
        "designer-redo",
        "designer-mode-design",
        "designer-mode-preview",
        "designer-save-status",
      ]) {
        await expect(page.getByTestId(testId), testId).toBeInViewport()
      }
    }
  })
})
