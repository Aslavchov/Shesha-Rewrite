import type { Locator, Page } from "@playwright/test"

import { createForm, field, openDesigner, settle } from "./support/designer.ts"
import { expect, test } from "./support/fixtures.ts"
import {
  openThemes,
  overflowsSideways,
  preview,
  publishTheme,
  restoreTheme,
  setColour,
  themeSaveStatus,
  themeStatus,
  waitUntilDraftSaved,
} from "./support/theme.ts"

/** Phase 5, check C5-20: the small fixes carried over from Phase 4 (spec section 8). */

const TEAL = "#0F766E"

// Every check requires a clean console, and leaves the built-in look behind:
// the theme is shared by every test this worker runs.
test.afterEach(async ({ page, request, consoleProblems }) => {
  expect(consoleProblems).toEqual([])
  await restoreTheme(page, request)
})

type Rect = { x: number; y: number; width: number; height: number }

async function rectOf(locator: Locator): Promise<Rect> {
  const box = await locator.boundingBox()
  if (!box) throw new Error("Not drawn.")
  return box
}

const rectsOf = (locator: Locator) =>
  locator.evaluateAll((elements) =>
    elements
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 || box.height > 0)
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
  )

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height

/** Whether the element with focus shows the focus ring. */
const hasFocusRing = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement
    return element !== null && getComputedStyle(element).outlineStyle !== "none"
  })

/** How many lines of text an element holds. */
const linesOf = (locator: Locator) =>
  locator.evaluate((element) => {
    const tops = new Set<number>()
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of range.getClientRects()) {
        if (rect.width > 0) tops.add(Math.round(rect.top))
      }
    }
    return tops.size
  })

/**
 * What the parts of a component draw, less the part pointed at and whatever
 * is around or inside it: a control's box, and the words of a label or a
 * help text, which may end long before the box they are in does.
 */
function drawnParts(elements: Element[], pointed: string) {
  const first = elements.find((element) => element.getAttribute("data-form-slot") === pointed)
  if (first === undefined) return []
  const rects: { x: number; y: number; width: number; height: number }[] = []
  for (const element of elements) {
    if (element === first || element.contains(first) || first.contains(element)) continue
    const style = getComputedStyle(element)
    const boxed =
      element.matches("input, select, textarea, button") ||
      Number.parseFloat(style.borderTopWidth) > 0 ||
      !/^(|transparent|rgba\(.*,\s*0\))$/.test(style.backgroundColor)
    const range = document.createRange()
    range.selectNodeContents(element)
    const drawn = boxed ? [element.getBoundingClientRect()] : [...range.getClientRects()]
    for (const { x, y, width, height } of drawn) {
      if (width > 0 && height > 0) rects.push({ x, y, width, height })
    }
  }
  return rects
}

test("C5-20 focus stays on Publish and on Discard once they have nothing left to do", async ({
  page,
}) => {
  await openThemes(page)
  const publish = page.getByTestId("theme-publish")
  const discard = page.getByTestId("theme-discard")

  await setColour(page, "theme-color-primary", TEAL)
  await publish.focus()
  await page.keyboard.press("Enter")
  await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
  // Unavailable now, and still where the keyboard is, with its ring.
  await expect(publish).toHaveAttribute("aria-disabled", "true")
  await expect(publish).toBeFocused()
  expect(await hasFocusRing(page)).toBe(true)
  // The next key goes on from there, not from the top of the page.
  await page.keyboard.press("Shift+Tab")
  await expect(discard).toBeFocused()
  await expect(discard).toHaveAttribute("aria-disabled", "true")

  await setColour(page, "theme-color-primary", "#7C3AED")
  await expect(themeStatus(page)).toHaveAttribute("data-status", "unpublished")
  await discard.focus()
  await page.keyboard.press("Enter")
  await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
  await expect(discard).toHaveAttribute("aria-disabled", "true")
  await expect(discard).toBeFocused()
  expect(await hasFocusRing(page)).toBe(true)
  // Unavailable means it does nothing: the discard can still be undone.
  await page.keyboard.press("Enter")
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByTestId("theme-reset-default")).toBeFocused()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByTestId("theme-undo")).toBeFocused()
  await expect(page.getByTestId("theme-undo")).not.toHaveAttribute("aria-disabled")
})

test("C5-20 the component grid is one Tab stop moved with the arrow keys, and no name is cut off or broken mid-word at 16 px text", async ({
  page,
  request,
}) => {
  await publishTheme(request, { formatVersion: 1, textSize: 16 })

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await openThemes(page)
    const items = page.getByRole("list", { name: "Components" }).getByRole("button")
    const count = await items.count()
    expect(count).toBeGreaterThan(10)

    // One Tab stop.
    expect(await items.evaluateAll((all) => all.filter((b) => b.tabIndex === 0).length)).toBe(1)
    const columns = await items.evaluateAll((all) => {
      const top = all[0].getBoundingClientRect().top
      return all.filter((item) => item.getBoundingClientRect().top === top).length
    })
    // Fewer columns as the text grows, never so few that a name has no room.
    expect(columns).toBeGreaterThanOrEqual(1)

    await items.first().focus()
    await page.keyboard.press("ArrowRight")
    await expect(items.nth(1)).toBeFocused()
    expect(await hasFocusRing(page)).toBe(true)
    await page.keyboard.press("ArrowDown")
    await expect(items.nth(1 + columns)).toBeFocused()
    await page.keyboard.press("ArrowLeft")
    await expect(items.nth(columns)).toBeFocused()
    await page.keyboard.press("ArrowUp")
    await expect(items.first()).toBeFocused()
    await page.keyboard.press("End")
    await expect(items.last()).toBeFocused()
    await page.keyboard.press("Home")
    await expect(items.first()).toBeFocused()

    // Tab leaves the grid in one step, and Shift+Tab comes back to where it was.
    await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Tab")
    expect(
      await items.evaluateAll((all) => all.some((item) => item === document.activeElement)),
    ).toBe(false)
    await page.keyboard.press("Shift+Tab")
    await expect(items.nth(1)).toBeFocused()
    // Enter chooses the one with focus.
    await page.keyboard.press("Enter")
    await expect(items.nth(1)).toHaveAttribute("aria-pressed", "true")
    await expect(page.getByTestId("theme-component-defaults")).toBeVisible()

    // Every name is whole: nothing clipped, nothing ending in an ellipsis.
    const cut = await page
      .locator('[data-testid^="theme-component-"][data-testid$="-name"]')
      .evaluateAll((names) =>
        names
          .filter((name) => {
            const button = name.closest("button")
            const style = getComputedStyle(name)
            return (
              name.scrollWidth > name.clientWidth ||
              name.scrollHeight > name.clientHeight ||
              style.textOverflow === "ellipsis" ||
              button === null ||
              button.scrollWidth > button.clientWidth ||
              button.scrollHeight > button.clientHeight
            )
          })
          .map((name) => name.textContent),
      )
    expect(cut).toEqual([])

    // A name breaks only between words: every word lies on one line.
    const broken = await page
      .locator('[data-testid^="theme-component-"][data-testid$="-name"]')
      .evaluateAll((names) => {
        const split: string[] = []
        for (const name of names) {
          const text = name.firstChild
          if (text === null) continue
          let start = 0
          for (const word of (text.textContent ?? "").split(" ")) {
            const range = document.createRange()
            range.setStart(text, start)
            range.setEnd(text, start + word.length)
            start += word.length + 1
            const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
            if (lines.size > 1) split.push(word)
          }
        }
        return split
      })
    expect(broken).toEqual([])
    expect(await overflowsSideways(page)).toBe(false)
    await page.goto("about:blank")
  }
})

test("C5-20 the status bar stays readable when a save error shows", async ({
  page,
  expectRefusal,
}) => {
  expectRefusal(500)
  const reason =
    "The theme could not be stored because the server could not write to its data folder just now."
  await page.route("**/api/theme/draft", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback()
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal", message: reason } }),
    })
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await openThemes(page)
  await setColour(page, "theme-color-primary", TEAL)
  await expect(themeSaveStatus(page)).toHaveAttribute("data-status", "error")
  await expect(themeSaveStatus(page)).toContainText(reason)

  const note = page.getByTestId("theme-status-note")
  for (const width of [1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await settle(page)
    // The status is one line, and the texts keep a width they can be read at:
    // none is squeezed to a word per line.
    expect(await linesOf(themeStatus(page)), `status at ${width}`).toBe(1)
    expect(await linesOf(note), `note at ${width}`).toBeLessThanOrEqual(3)
    expect(await linesOf(themeSaveStatus(page)), `error at ${width}`).toBeLessThanOrEqual(
      width >= 768 ? 2 : 4,
    )
    expect((await rectOf(note)).width, `note at ${width}`).toBeGreaterThanOrEqual(200)
    expect((await rectOf(themeSaveStatus(page))).width, `error at ${width}`).toBeGreaterThanOrEqual(
      180,
    )
    // Nothing lies on anything else, and every button is whole and in the bar.
    const bar = await rectOf(page.getByTestId("theme-action-bar"))
    const parts = [
      await rectOf(themeStatus(page)),
      await rectOf(note),
      await rectOf(themeSaveStatus(page)),
    ]
    for (const id of ["save-retry", "undo", "redo", "reset-default", "discard", "publish"]) {
      const button = page.getByTestId(`theme-${id}`)
      expect(
        await button.evaluate((element) => element.scrollWidth <= element.clientWidth),
        `${id} at ${width}`,
      ).toBe(true)
      parts.push(await rectOf(button))
    }
    for (const [index, part] of parts.entries()) {
      expect(part.x, `inside at ${width}`).toBeGreaterThanOrEqual(bar.x)
      expect(part.x + part.width, `inside at ${width}`).toBeLessThanOrEqual(bar.x + bar.width)
      for (const other of parts.slice(index + 1)) {
        expect(overlaps(part, other), `overlap at ${width}`).toBe(false)
      }
    }
    expect(await overflowsSideways(page)).toBe(false)
  }
  await page.unroute("**/api/theme/draft")
})

test("C5-20 Publish, Undo and the status stay in reach while editing component defaults further down", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openThemes(page)
  const bar = page.getByTestId("theme-action-bar")
  const startsAt = (await rectOf(bar)).y

  // A component default, far down the page: every part of Card opened.
  await page.getByTestId("theme-component-card").click()
  for (const slot of ["root", "header", "title", "description", "content"]) {
    await page.getByTestId(`theme-slot-${slot}`).click()
  }
  await page.getByTestId("theme-style-content-padding").focus()
  await expect(page.getByTestId("theme-style-content-padding")).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300)

  // The bar came along: it sits right below the header now.
  const stuck = await rectOf(bar)
  const header = await rectOf(page.locator("header").first())
  expect(stuck.y).toBeLessThan(startsAt)
  expect(Math.abs(stuck.y - (header.y + header.height))).toBeLessThanOrEqual(1)
  for (const id of ["theme-status", "theme-save-status", "theme-undo", "theme-publish"]) {
    await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 })
  }
  // Nothing that scrolled past shows through it: the bar is what is there.
  const onTop = await bar.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return [0.02, 0.25, 0.5, 0.75, 0.98].every((fx) =>
      [0.05, 0.5, 0.95].every((fy) => {
        const hit = document.elementFromPoint(box.x + box.width * fx, box.y + box.height * fy)
        return hit !== null && element.contains(hit)
      }),
    )
  })
  expect(onTop).toBe(true)
  expect(await bar.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toMatch(
    /rgba\(.*, 0\)|transparent/,
  )

  // Going back up with the keyboard, no control takes focus underneath the bar.
  const editor = page.getByTestId("theme-components")
  for (let step = 0; step < 30; step++) {
    await page.keyboard.press("Shift+Tab")
    const hidden = await editor.evaluate(
      (section, barBottom) => {
        const element = document.activeElement
        if (!element || !section.contains(element)) return null
        const box = element.getBoundingClientRect()
        return box.top < barBottom ? (element.getAttribute("data-testid") ?? element.tagName) : null
      },
      (await rectOf(bar)).y + (await rectOf(bar)).height,
    )
    expect(hidden, `step ${step}`).toBeNull()
  }

  // And they work from down here: a change, then Undo and Publish without scrolling back.
  await page.getByTestId("theme-style-content-padding").focus()
  await page.getByTestId("theme-style-content-background").click()
  await page.getByTestId("theme-token-success").click()
  await page.keyboard.press("Escape")
  await expect(themeStatus(page)).toHaveAttribute("data-status", "unpublished")
  await page.getByTestId("theme-undo").click()
  await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
  await page.getByTestId("theme-redo").click()
  await waitUntilDraftSaved(page)
  await page.getByTestId("theme-publish").click()
  await expect(themeStatus(page)).toHaveAttribute("data-status", "published")
  // All of that without going back to the top of the page.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300)
  expect(Math.abs((await rectOf(bar)).y - stuck.y)).toBeLessThanOrEqual(1)
})

test("C5-20 announcements name the component they are about", async ({ page }) => {
  await openThemes(page)
  const live = page.getByTestId("theme-live")

  await page.getByTestId("theme-component-card").click()
  await page.getByTestId("theme-slot-root").click()
  await page.getByTestId("theme-style-root-background").click()
  await page.getByTestId("theme-token-success").click()
  await expect(live).toHaveText("Background of Card's whole component: Success.")
  await page.keyboard.press("Escape")
  // Undo says which component too.
  await expect(page.getByTestId("theme-undo")).toHaveAccessibleName(
    "Undo: Change background of Card's whole component",
  )

  // Another component with a part of the same name is told apart.
  await page.getByTestId("theme-component-button").click()
  await page.getByTestId("theme-slot-root").click()
  await page.getByTestId("theme-style-root-background").click()
  await page.getByTestId("theme-token-primary").click()
  await expect(live).toHaveText("Background of Button's whole component: Primary.")
  await page.keyboard.press("Escape")
  await page.getByTestId("theme-style-reset-root").click()
  await expect(live).toHaveText(
    "Every style of Button's whole component is back to the component's own.",
  )
  await waitUntilDraftSaved(page)
})

test("C5-20 a slot's name tag covers no part of its component, and its outline stops at the name badge", async ({
  page,
}) => {
  const id = await createForm(page.request, "Slot tags", [
    field("before"),
    { ...field("a"), settings: { label: "a", helpText: "Something to help." } },
    field("after"),
    {
      ...field("choice", "radio-group"),
      settings: {
        label: "choice",
        helpText: "Pick one.",
        options: [
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
          { value: "three", label: "Three" },
        ],
      },
    },
  ])
  await openDesigner(page, id)
  const canvas = page.getByTestId("designer-canvas")
  const badge = page.getByTestId("canvas-name-badge")
  const tag = page.getByTestId("canvas-slot-tag")

  for (const [name, slots] of [
    ["a", ["root", "label", "control", "description"]],
    ["choice", ["root", "label", "item", "description"]],
  ] as const) {
    await page.getByTestId(`outline-${name}`).click()
    await expect(badge).toBeVisible()
    // The badge as it is drawn with nothing pointed at.
    await page.getByTestId("designer-properties").hover({ position: { x: 4, y: 4 } })
    await expect(tag).toHaveCount(0)
    const badgeBox = await rectOf(badge)
    const plain = await page.screenshot({ clip: badgeBox })

    const parts = canvas.locator(`[data-design-item="c_${name}"] [data-form-slot]`)
    for (const slot of slots) {
      await page.getByTestId(`props-slot-${slot}`).hover()
      await expect(tag).toBeVisible()
      await expect(tag).toHaveText(slot)
      await settle(page)
      const tagBox = await rectOf(tag)

      // The tag covers nothing of the component: not the part it names, not
      // the control, not the words of any other part. (A part around the
      // named one, like the whole component, is not something it could be
      // outside of.)
      const named = await rectsOf(
        canvas.locator(`[data-design-item="c_${name}"]`).locator(`[data-form-slot="${slot}"]`),
      )
      expect(named.length, `${name} ${slot}`).toBeGreaterThan(0)
      const others = await parts.evaluateAll(drawnParts, slot)
      for (const part of [...named, ...others]) {
        expect(overlaps(tagBox, part), `${name} ${slot} tag over a part`).toBe(false)
      }
      expect(overlaps(tagBox, await rectOf(badge)), `${name} ${slot} tag over the badge`).toBe(
        false,
      )
      // It is on the paper, where it can be seen.
      await expect(tag).toBeInViewport({ ratio: 1 })

      // The outline does not run through the badge: the badge looks as it did.
      expect(
        (await page.screenshot({ clip: badgeBox })).equals(plain),
        `${name} ${slot} outline through the badge`,
      ).toBe(true)
    }
    // The outline of the whole component is still drawn, right up to the badge.
    await page.getByTestId("props-slot-root").hover()
    const highlight = page.getByTestId("canvas-slot-highlight")
    await expect(highlight).toBeVisible()
    expect(await highlight.evaluate((element) => getComputedStyle(element).clipPath)).toMatch(
      /^polygon\(evenodd/,
    )
  }
})

test("C5-20 in the theme preview a part's name tag covers no part of the sample", async ({
  page,
}) => {
  await openThemes(page)
  const tag = page.getByTestId("theme-slot-tag")
  for (const [type, sample, slots] of [
    ["text-field", "textField1", ["root", "label", "control"]],
    ["radio-group", "radioGroup1", ["root", "label"]],
    ["select", "select1", ["root", "label", "trigger"]],
  ] as const) {
    await page.getByTestId(`theme-component-${type}`).click()
    const root = preview(page).getByTestId(`field-${sample}`)
    await expect(root).toBeVisible()
    for (const slot of slots) {
      await page.getByTestId(`theme-slot-${slot}`).hover()
      await expect(tag).toBeVisible()
      await settle(page)
      const tagBox = await rectOf(tag)
      const own = preview(page).locator(
        `[data-testid="field-${sample}"], [data-testid="field-${sample}"] [data-form-slot]`,
      )
      const named = await rectOf(own.and(page.locator(`[data-form-slot="${slot}"]`)).first())
      const parts = [named, ...(await own.evaluateAll(drawnParts, slot))]
      expect(parts.length, `${type} ${slot}`).toBeGreaterThan(0)
      for (const part of parts) {
        expect(overlaps(tagBox, part), `${type} ${slot}`).toBe(false)
      }
    }
  }
})
