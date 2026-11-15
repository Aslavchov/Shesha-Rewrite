import type { Page } from "@playwright/test"

import { createForm, field, openDesigner, waitUntilSaved } from "./support/designer.ts"
import { DEMO_FORM, expect, test } from "./support/fixtures.ts"
import {
  contrast,
  EMPTY_THEME,
  openThemes,
  overflowsSideways,
  preview,
  publishFromEditor,
  publishTheme,
  readTheme,
  restoreTheme,
  rgb,
  rgbOf,
  setColour,
  styleOf,
  themeStatus,
  waitUntilDraftSaved,
} from "./support/theme.ts"

/** Phase 4: the theme system (spec section 10). */

const TEAL = "#0F766E"
const BRAND = "#003BB2"

// Every check requires a clean console, and leaves the built-in look behind:
// the theme is shared by every test this worker runs.
test.afterEach(async ({ page, request, consoleProblems }) => {
  expect(consoleProblems).toEqual([])
  await restoreTheme(page, request)
})

const submit = (page: Page) => page.getByTestId("field-submit")
const previewPrimary = (page: Page) => preview(page).getByTestId("theme-preview-primary")

async function openDemoForm(page: Page) {
  await page.goto(DEMO_FORM.path)
  await expect(submit(page)).toBeVisible()
}

async function setDarkMode(page: Page, dark: boolean) {
  const isDark = await page.locator("html").evaluate((html) => html.classList.contains("dark"))
  if (isDark !== dark) await page.getByTestId("theme-toggle").click()
}

test.describe("C4-1 Editor", () => {
  test("shows the current theme with a live preview and nothing unpublished", async ({ page }) => {
    await openThemes(page)
    await expect(preview(page)).toBeVisible()
    await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
    await expect(themeStatus(page)).toHaveText("Published")
    // The preview shows the shell and real components.
    await expect(preview(page).getByTestId("theme-preview-sidebar")).toBeVisible()
    await expect(preview(page).getByTestId("field-textField1")).toBeVisible()
    expect(await rgbOf(previewPrimary(page), "background-color")).toBe(rgb(BRAND))
  })
})

test.describe("C4-2 Primary colour", () => {
  test("the preview follows while editing and the rest of the page does not; publishing restyles the app", async ({
    page,
  }) => {
    await openThemes(page)
    await setColour(page, "theme-color-primary", TEAL)

    expect(await rgbOf(previewPrimary(page), "background-color")).toBe(rgb(TEAL))
    // The editor's own controls keep the published theme.
    expect(await rgbOf(page.getByTestId("theme-publish"), "background-color")).toBe(rgb(BRAND))
    await expect(themeStatus(page)).toHaveAttribute("data-status", "unpublished")

    await publishFromEditor(page)
    // The page around the editor follows at once.
    expect(await rgbOf(page.getByTestId("theme-publish"), "background-color")).toBe(rgb(TEAL))

    await page.getByTestId("nav-forms").click()
    await expect(page.getByTestId("page-title")).toHaveText("Forms")
    await openDemoForm(page)
    expect(await rgbOf(submit(page), "background-color")).toBe(rgb(TEAL))
    // Focus rings and the shell use it too.
    const html = page.locator("html")
    expect(await rgbOf(html, "--ring")).toBe(rgb(TEAL))
    expect(await rgbOf(html, "--sidebar-primary")).toBe(rgb(TEAL))
    await page.getByTestId("field-firstName-control").focus()
    await page.keyboard.press("Tab")
    const focused = page.locator(":focus-visible")
    expect(await rgbOf(focused, "outline-color")).toBe(rgb(TEAL))
    // A link uses it: the back link of the form page.
    await page.goto("/designer")
    expect(await rgbOf(html, "--primary")).toBe(rgb(TEAL))
  })
})

test.describe("C4-3 Dark derived", () => {
  test("dark mode uses a lighter tint of the same hue, with readable text; a hand-set value replaces it", async ({
    page,
    request,
  }) => {
    await publishTheme(request, { formatVersion: 1, colors: { primary: { light: TEAL } } })
    await openDemoForm(page)
    await setDarkMode(page, true)

    const fill = await rgbOf(submit(page), "background-color")
    const text = await rgbOf(submit(page), "color")
    expect(fill).not.toBe(rgb(TEAL))
    expect(contrast(fill, text)).toBeGreaterThanOrEqual(4.5)
    // Lighter than the light value, and greenish-blue like it: more green and blue than red.
    const [r, g, b] = (fill.match(/\d+/g) ?? []).map(Number)
    expect(g).toBeGreaterThan(118)
    expect(g).toBeGreaterThan(r)
    expect(b).toBeGreaterThan(r)

    await openThemes(page)
    await setColour(page, "theme-color-primary-dark", "#99F6E4")
    await publishFromEditor(page)
    await openDemoForm(page)
    expect(await rgbOf(submit(page), "background-color")).toBe(rgb("#99F6E4"))
    await setDarkMode(page, false)
  })
})

test.describe("C4-4 Contrast", () => {
  test("text on a very light primary turns dark, and the editor warns where 4.5:1 cannot be met", async ({
    page,
  }) => {
    await openThemes(page)
    await expect(page.getByTestId("theme-contrast-warning")).toHaveCount(0)
    await setColour(page, "theme-color-primary", "#FFE600")

    const fill = await rgbOf(previewPrimary(page), "background-color")
    const text = await rgbOf(previewPrimary(page), "color")
    expect(fill).toBe(rgb("#FFE600"))
    expect(text).not.toBe("rgb(255, 255, 255)")
    expect(contrast(fill, text)).toBeGreaterThanOrEqual(4.5)
    const warning = page.getByTestId("theme-contrast-warning")
    await expect(warning).toBeVisible()
    await expect(warning).toContainText("Primary on the page background")
    await expect(warning).toContainText("in light mode")
  })
})

test.describe("C4-5 Radius", () => {
  test("controls without an override are re-rounded; a Full one stays Full", async ({ page }) => {
    const id = await createForm(page.request, "Radius check", [field("plain"), field("round")])
    await openDesigner(page, id)
    await page.getByTestId("outline-round").click()
    await page.getByTestId("props-slot-control").click()
    await page.getByTestId("props-style-control-radius").click()
    await page.getByRole("option", { name: "Full", exact: true }).click()
    await waitUntilSaved(page)

    await openThemes(page)
    await page.getByTestId("theme-radius").fill("2")
    await publishFromEditor(page)

    await page.goto(`/forms/${id}`)
    const plain = page.getByTestId("field-plain-control")
    const round = page.getByTestId("field-round-control")
    await expect(plain).toBeVisible()
    expect(await styleOf(plain, "border-top-left-radius")).toBe("2px")
    expect(await styleOf(round, "border-top-left-radius")).toBe("9999px")
    // The shell follows too: the sidebar's current item.
    expect(await styleOf(page.getByTestId("nav-forms"), "border-top-left-radius")).not.toBe("6px")
  })
})

test.describe("C4-6 Text size and density", () => {
  test("text and control heights change across the shell, the designer and forms, with nothing cut off", async ({
    page,
  }) => {
    await openDemoForm(page)
    const before = {
      text: await styleOf(page.locator("body"), "font-size"),
      control: (await page.getByTestId("field-firstName-control").boundingBox())?.height ?? 0,
    }
    expect(before.text).toBe("14px")

    await openThemes(page)
    await page.getByTestId("theme-text-size-16").click()
    await page.getByTestId("theme-density-compact").click()
    await publishFromEditor(page)

    await openDemoForm(page)
    expect(await styleOf(page.locator("body"), "font-size")).toBe("16px")
    expect(await styleOf(page.getByTestId("nav-forms"), "font-size")).toBe("16px")
    const control = (await page.getByTestId("field-firstName-control").boundingBox())?.height ?? 0
    expect(control).toBeLessThan(before.control)
    expect(await overflowsSideways(page)).toBe(false)

    await page.goto(`/designer/${DEMO_FORM.id}`)
    await expect(page.getByTestId("designer-canvas")).toBeVisible()
    expect(await overflowsSideways(page)).toBe(false)
    const label = page
      .getByTestId("designer-canvas")
      .getByTestId("field-firstName")
      .locator('[data-form-slot="label"]')
    expect(await styleOf(label, "font-size")).toBe("16px")

    await openThemes(page)
    expect(await overflowsSideways(page)).toBe(false)
  })
})

test.describe("C4-7 Component default", () => {
  test("new and existing Buttons use the theme's background; one with its own keeps it", async ({
    page,
  }) => {
    const id = await createForm(page.request, "Buttons", [
      { id: "c_plain", type: "button", name: "plain" },
      {
        id: "c_own",
        type: "button",
        name: "own",
        styles: { root: { background: "#7C2D12" } },
      },
    ])

    await openThemes(page)
    await page.getByTestId("theme-component-button").click()
    await page.getByTestId("theme-slot-root").click()
    await page.getByTestId("theme-style-root-background").click()
    await page.getByTestId("theme-token-success").click()
    const success = await rgbOf(page.locator("html"), "--success")
    expect(await rgbOf(preview(page).getByTestId("field-button1"), "background-color")).toBe(
      success,
    )
    await publishFromEditor(page)

    await page.goto(`/forms/${id}`)
    expect(await rgbOf(page.getByTestId("field-plain"), "background-color")).toBe(success)
    expect(await rgbOf(page.getByTestId("field-own"), "background-color")).toBe(rgb("#7C2D12"))

    await openDesigner(page, id)
    await page.getByTestId("toolbox-item-button").click()
    const added = page.getByTestId("designer-canvas").getByTestId("field-button1")
    await expect(added).toBeVisible()
    expect(await rgbOf(added, "background-color")).toBe(success)
  })
})

test.describe("C4-8 Source shown", () => {
  test("an unset background shows the theme's value as from the theme; overriding marks it set; reset brings it back", async ({
    page,
    request,
  }) => {
    await publishTheme(request, {
      formatVersion: 1,
      components: { button: { root: { background: { token: "success" } } } },
    })
    await openDesigner(page, DEMO_FORM.id)
    await page.getByTestId("outline-submit").click()
    await page.getByTestId("props-slot-root").click()

    const source = page.getByTestId("props-style-source-root-background")
    const editor = page.getByTestId("props-style-root-background")
    await expect(source).toHaveText("From the theme")
    await expect(editor).toContainText("From the theme: Success")
    // Said in words to screen readers, not only shown.
    await expect(editor).toHaveAccessibleDescription("From the theme")

    await editor.click()
    await page.getByTestId("props-token-warning").click()
    await expect(source).toHaveText("Set here")
    const drawn = page.getByTestId("designer-canvas").getByTestId("field-submit")
    expect(await rgbOf(drawn, "background-color")).toBe(
      await rgbOf(page.locator("html"), "--warning"),
    )

    await page.getByTestId("props-style-reset-root-background").click()
    await expect(source).toHaveText("From the theme")
    expect(await rgbOf(drawn, "background-color")).toBe(
      await rgbOf(page.locator("html"), "--success"),
    )
    await waitUntilSaved(page)
  })
})

test.describe("C4-9 Same properties", () => {
  for (const type of ["text-field", "select", "card"]) {
    test(`the theme editor and the instance panel list the same slots and style properties for ${type}`, async ({
      page,
    }) => {
      const instance =
        type === "card"
          ? { id: "c_sample", type, name: "sample" }
          : { id: "c_sample", type, name: "sample", bind: "sample" }
      const id = await createForm(page.request, `Same ${type}`, [instance])

      const listed = async (prefix: string) => {
        const slots = await page
          .locator(`[data-testid^="${prefix}-slot-section-"]`)
          .evaluateAll((sections) =>
            sections.map(
              (section) => section.getAttribute("data-testid")?.split("-slot-section-")[1],
            ),
          )
        const properties: string[] = []
        for (const slot of slots) {
          await page.getByTestId(`${prefix}-slot-${slot}`).click()
          const ids = await page
            .locator(`[data-testid^="${prefix}-style-source-${slot}-"]`)
            .evaluateAll((items) => items.map((item) => item.getAttribute("data-testid")))
          properties.push(...ids.map((testId) => testId?.replace(`${prefix}-`, "") ?? ""))
        }
        return { slots, properties }
      }

      await openDesigner(page, id)
      await page.getByTestId("outline-sample").click()
      const panel = await listed("props")

      await openThemes(page)
      await page.getByTestId(`theme-component-${type}`).click()
      const theme = await listed("theme")

      expect(panel.slots.length).toBeGreaterThan(0)
      expect(theme).toEqual(panel)
    })
  }
})

test.describe("C4-10 Dark tokens", () => {
  test("a theme colour follows the mode; a custom hex stays the same", async ({ page }) => {
    await openThemes(page)
    await page.getByTestId("theme-component-text-field").click()
    await page.getByTestId("theme-slot-label").click()
    await page.getByTestId("theme-style-label-color").click()
    await page.getByTestId("theme-token-primary").click()
    await page.getByTestId("theme-component-card").click()
    await page.getByTestId("theme-slot-root").click()
    await setColour(page, "theme-style-root-background", "#FFF7ED")
    await waitUntilDraftSaved(page)

    const label = preview(page).getByTestId("field-textField1").getByText("Text field")
    const card = preview(page).getByTestId("field-card1")
    const lightLabel = await rgbOf(label, "color")
    expect(await rgbOf(card, "background-color")).toBe(rgb("#FFF7ED"))

    await page.getByTestId("theme-preview-mode-dark").click()
    await expect(preview(page)).toHaveAttribute("data-mode", "dark")
    expect(await rgbOf(label, "color")).not.toBe(lightLabel)
    expect(await rgbOf(card, "background-color")).toBe(rgb("#FFF7ED"))

    // The same once published, in the app's own dark mode.
    await publishFromEditor(page)
    const id = await createForm(page.request, "Tokens", [
      field("name"),
      { id: "c_box", type: "card", name: "box" },
    ])
    await page.goto(`/forms/${id}`)
    const formLabel = page.getByTestId("field-name").getByText("name", { exact: true })
    const lightForm = await rgbOf(formLabel, "color")
    await setDarkMode(page, true)
    expect(await rgbOf(formLabel, "color")).not.toBe(lightForm)
    expect(await rgbOf(page.getByTestId("field-box"), "background-color")).toBe(rgb("#FFF7ED"))
    await setDarkMode(page, false)
  })
})

test.describe("C4-11 Draft and publish", () => {
  test("another tab shows the published theme; the draft survives a reload; discard restores", async ({
    page,
    context,
  }) => {
    await openThemes(page)
    await setColour(page, "theme-color-primary", TEAL)
    await waitUntilDraftSaved(page)

    const other = await context.newPage()
    await other.goto(DEMO_FORM.path)
    await expect(other.getByTestId("field-submit")).toBeVisible()
    expect(await rgbOf(other.getByTestId("field-submit"), "background-color")).toBe(rgb(BRAND))
    await other.close()

    await page.reload()
    await expect(page.getByTestId("theme-editor")).toBeVisible()
    await expect(themeStatus(page)).toHaveAttribute("data-status", "unpublished")
    expect(await rgbOf(previewPrimary(page), "background-color")).toBe(rgb(TEAL))

    await page.getByTestId("theme-discard").click()
    await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
    expect(await rgbOf(previewPrimary(page), "background-color")).toBe(rgb(BRAND))
    await waitUntilDraftSaved(page)
    expect((await readTheme(page.request)).unpublished).toBe(false)
  })
})

test.describe("C4-12 Conflict", () => {
  test("the second tab shows the conflict and offers a reload; nothing is overwritten", async ({
    page,
    context,
    expectRefusal,
  }) => {
    await openThemes(page)
    const second = await context.newPage()
    const problems: string[] = []
    second.on("console", (message) => {
      if (message.type() === "error" && !/status of 409/.test(message.text())) {
        problems.push(message.text())
      }
    })
    await openThemes(second)

    await setColour(page, "theme-color-primary", TEAL)
    await waitUntilDraftSaved(page)

    expectRefusal(409)
    await setColour(second, "theme-color-primary", "#BE123C")
    await expect(second.getByTestId("theme-conflict")).toBeVisible()
    await expect(second.getByTestId("theme-save-status")).toHaveAttribute("data-status", "conflict")
    const stored = await readTheme(page.request)
    expect(stored.draft.document).toEqual({
      formatVersion: 1,
      colors: { primary: { light: "#0f766e" } },
    })

    await second.getByTestId("theme-conflict-reload").click()
    await expect(second.getByTestId("theme-conflict")).toHaveCount(0)
    expect(await rgbOf(second.getByTestId("theme-preview-primary"), "background-color")).toBe(
      rgb(TEAL),
    )
    expect(problems).toEqual([])
    await second.close()
  })
})

test.describe("C4-13 Reset to default", () => {
  test("the built-in look returns: Shesha blue and Inter", async ({ page, request }) => {
    await publishTheme(request, {
      formatVersion: 1,
      colors: { primary: { light: TEAL } },
      radius: 2,
      textSize: 16,
    })
    await openThemes(page)
    await page.getByTestId("theme-reset-default").click()
    await expect(themeStatus(page)).toHaveAttribute("data-status", "unpublished")
    await publishFromEditor(page)
    expect((await readTheme(request)).published.document).toEqual(EMPTY_THEME)

    await openDemoForm(page)
    expect(await rgbOf(submit(page), "background-color")).toBe(rgb(BRAND))
    expect(await styleOf(page.locator("body"), "font-family")).toMatch(/^Inter,/)
    expect(await styleOf(page.locator("body"), "font-size")).toBe("14px")
  })
})

test.describe("C4-14 No flash", () => {
  test("a reload never shows the built-in look first", async ({ page, request }) => {
    await publishTheme(request, { formatVersion: 1, colors: { primary: { light: TEAL } } })
    // The app's script is held back, so the page is seen as the browser first
    // paints it: before React, before any request.
    await page.route("**/assets/*.js", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: "" }),
    )
    await page.goto(DEMO_FORM.path)
    expect(await rgbOf(page.locator("html"), "--primary")).toBe(rgb(TEAL))
    await page.unroute("**/assets/*.js")

    // And with the app running, the theme is there from the first frame on.
    await page.addInitScript(() => {
      const seen: string[] = []
      ;(window as unknown as { seen: string[] }).seen = seen
      const record = () => {
        seen.push(getComputedStyle(document.documentElement).getPropertyValue("--theme-primary"))
        if (seen.length < 30) requestAnimationFrame(record)
      }
      requestAnimationFrame(record)
    })
    await page.reload()
    await expect(submit(page)).toBeVisible()
    const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen)
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((value) => value.trim() === "#0f766e")).toBe(true)
  })
})

test.describe("C4-15 Invalid theme", () => {
  test("a bad colour is refused with details; a theme with only an unknown type is kept and flagged", async ({
    page,
    request,
  }) => {
    const { draft } = await readTheme(request)
    const refused = await request.put("/api/theme/draft", {
      data: {
        revision: draft.revision,
        document: {
          formatVersion: 1,
          colors: { primary: { light: "blue" } },
          components: { gauge: { root: { radius: "full" } } },
        },
      },
    })
    expect(refused.status()).toBe(400)
    const body = (await refused.json()) as {
      error: { code: string; details: { path: string; message: string }[] }
    }
    expect(body.error.code).toBe("invalid_theme")
    expect(body.error.details.map((detail) => detail.path)).toEqual(["colors.primary.light"])

    const kept = await request.put("/api/theme/draft", {
      data: {
        revision: draft.revision,
        document: { formatVersion: 1, components: { gauge: { root: { radius: "full" } } } },
      },
    })
    expect(kept.status()).toBe(200)

    await openThemes(page)
    const flagged = page.getByTestId("theme-component-gauge")
    await expect(flagged).toHaveAttribute("data-unknown", "true")
    await expect(flagged).toContainText("is not a component this version of the app knows")
  })
})

test.describe("C4-16 Keyboard", () => {
  test("change the primary colour through the swatches, set a component default, undo and publish without the mouse", async ({
    page,
  }) => {
    await openThemes(page)
    const live = page.getByTestId("theme-live")
    const focusRing = async () => {
      const outline = await page.evaluate(() => {
        const element = document.activeElement
        return element ? getComputedStyle(element).outlineStyle : "none"
      })
      expect(outline).not.toBe("none")
    }

    // The primary colour: open the picker, arrow to Teal, choose it.
    await page.getByTestId("theme-color-primary").focus()
    await focusRing()
    await page.keyboard.press("Enter")
    const swatch = (hex: string) => page.getByTestId(`theme-swatch-${hex}`)
    await expect(swatch("003bb2")).toBeFocused()
    await focusRing()
    for (let step = 0; step < 9; step++) await page.keyboard.press("ArrowRight")
    await expect(swatch("0f766e")).toBeFocused()
    await focusRing()
    await page.keyboard.press("Enter")
    await expect(live).toHaveText("Primary: #0F766E.")
    expect(await rgbOf(previewPrimary(page), "background-color")).toBe(rgb(TEAL))

    // A component default: Button's background, the success colour.
    await page.getByTestId("theme-component-button").focus()
    await page.keyboard.press("Enter")
    await page.getByTestId("theme-slot-root").focus()
    await page.keyboard.press("Enter")
    await page.getByTestId("theme-style-root-background").focus()
    await focusRing()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("theme-token-foreground")).toBeFocused()
    for (let step = 0; step < 5; step++) await page.keyboard.press("ArrowRight")
    await expect(page.getByTestId("theme-token-success")).toBeFocused()
    await page.keyboard.press("Enter")
    await expect(live).toHaveText("Background of whole component: Success.")

    // Undo takes back the default only.
    await page.keyboard.press("ControlOrMeta+z")
    await expect(live).toHaveText(/^Undid: /)
    await expect(page.getByTestId("theme-style-source-root-background")).toHaveText(
      "Component default",
    )

    await page.getByTestId("theme-publish").focus()
    await focusRing()
    await page.keyboard.press("Enter")
    await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
    await expect(live).toHaveText("Published. The whole app uses this theme now.")
  })
})

test.describe("C4-17 Small fixes", () => {
  test("the designer's colour swatches are one Tab stop and move with the arrow keys", async ({
    page,
  }) => {
    const id = await createForm(page.request, "Swatches", [field("a")])
    await openDesigner(page, id)
    await page.getByTestId("outline-a").click()
    await page.getByTestId("props-slot-label").click()
    await page.getByTestId("props-style-label-color").click()
    const swatches = page.getByTestId("props-style-label-color-popup").locator("fieldset button")
    await expect(swatches.first()).toBeFocused()
    expect(await swatches.evaluateAll((all) => all.filter((b) => b.tabIndex === 0).length)).toBe(1)
    await page.keyboard.press("ArrowDown")
    await expect(swatches.nth(2)).toBeFocused()
    await page.keyboard.press("ArrowLeft")
    await expect(swatches.nth(1)).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(page.getByTestId("props-style-label-color-hex")).toBeFocused()
  })

  test("a Card's region outline stays inside the card's border", async ({ page }) => {
    const id = await createForm(page.request, "Card region", [
      { id: "c_box", type: "card", name: "box", regions: { content: [field("inside")] } },
    ])
    await openDesigner(page, id)
    const card = await page.getByTestId("designer-canvas").getByTestId("field-box").boundingBox()
    const edge = await page.locator("[data-canvas-region]").first().boundingBox()
    if (!card || !edge) throw new Error("Not drawn.")
    expect(edge.x).toBeGreaterThan(card.x)
    expect(edge.y).toBeGreaterThan(card.y)
    expect(edge.x + edge.width).toBeLessThan(card.x + card.width)
    expect(edge.y + edge.height).toBeLessThan(card.y + card.height)
  })

  test("the slot name tag never covers the instance's name badge", async ({ page }) => {
    const id = await createForm(page.request, "Tags", [field("a")])
    await openDesigner(page, id)
    await page.getByTestId("outline-a").click()
    const badge = page.getByTestId("canvas-name-badge")
    await expect(badge).toBeVisible()
    for (const slot of ["root", "label", "control"]) {
      await page.getByTestId(`props-slot-${slot}`).hover()
      const tag = page.getByTestId("canvas-slot-tag")
      await expect(tag).toBeVisible()
      const one = await badge.boundingBox()
      const other = await tag.boundingBox()
      if (!one || !other) throw new Error("Not drawn.")
      const overlaps =
        one.x < other.x + other.width &&
        other.x < one.x + one.width &&
        one.y < other.y + other.height &&
        other.y < one.y + one.height
      expect(overlaps, slot).toBe(false)
    }
  })

  test("at 1280 × 900 the properties get more than half of the right column", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openDesigner(page, DEMO_FORM.id)
    const outline = await page.getByTestId("designer-outline").locator("..").boundingBox()
    const properties = await page.getByTestId("designer-properties").boundingBox()
    if (!outline || !properties) throw new Error("Not drawn.")
    expect(properties.height / (outline.height + properties.height)).toBeGreaterThan(0.6)
  })
})
