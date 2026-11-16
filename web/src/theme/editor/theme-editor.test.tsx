import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AUTOSAVE_DELAY_MS } from "@/designer/save"
import { registry } from "@/forms/registry"
import { THEME_FORMAT_VERSION, type ThemeDocument, type ThemeState } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import { type ThemeApi, ThemeEditor } from "./theme-editor"

const EMPTY: ThemeDocument = { formatVersion: THEME_FORMAT_VERSION }

function stateOf(draft: ThemeDocument, published: ThemeDocument = EMPTY, revision = 1): ThemeState {
  return {
    published: { revision: 1, updatedAt: "2026-11-15T09:00:00.000Z", document: published },
    draft: { revision, updatedAt: "2026-11-15T09:00:00.000Z", document: draft },
    unpublished: JSON.stringify(draft) !== JSON.stringify(published),
  }
}

function renderEditor(initial: ThemeState = stateOf(EMPTY), overrides: Partial<ThemeApi> = {}) {
  let server = initial
  const api: ThemeApi = {
    save: vi.fn(async (revision, document) => {
      server = stateOf(document, server.published.document, revision + 1)
      return server
    }),
    publish: vi.fn(async () => {
      server = {
        ...server,
        published: { ...server.published, revision: 2, document: server.draft.document },
        unpublished: false,
      }
      return server
    }),
    discard: vi.fn(async () => {
      server = stateOf(
        server.published.document,
        server.published.document,
        server.draft.revision + 1,
      )
      return server
    }),
    load: vi.fn(async () => server),
    ...overrides,
  }
  const onPublished = vi.fn()
  render(
    <ThemeEditor
      state={initial}
      registry={registry}
      api={api}
      initialMode="light"
      onPublished={onPublished}
    />,
  )
  const user = vi.isFakeTimers()
    ? userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    : userEvent.setup()
  return { api, onPublished, user }
}

afterEach(() => vi.useRealTimers())

const status = () => screen.getByTestId("theme-status")
const preview = () => screen.getByTestId("theme-preview")

async function typePrimary(user: ReturnType<typeof userEvent.setup>, hex: string) {
  await user.click(screen.getByTestId("theme-color-primary"))
  const field = screen.getByTestId("theme-color-primary-hex")
  await user.clear(field)
  await user.type(field, hex)
  await user.keyboard("{Escape}")
}

describe("the theme editor (spec 4)", () => {
  it("opens on the current theme with nothing unpublished (C4-1)", () => {
    renderEditor()
    expect(status()).toHaveAttribute("data-status", "published")
    expect(preview()).toHaveAttribute("data-theme-scope", "light")
    // The preview renders one of every registered component.
    for (const definition of registry.values()) {
      expect(within(preview()).getAllByTestId(/^field-/).length).toBeGreaterThan(0)
      expect(screen.getByTestId(`theme-component-${definition.type}`)).toBeInTheDocument()
    }
  })

  it("shows a change in the preview at once, saves the draft, and only the preview follows (C4-2)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { api, user } = renderEditor()
    await typePrimary(user, "#0F766E")

    expect(preview().style.getPropertyValue("--theme-primary")).toBe("#0f766e")
    expect(document.documentElement.style.getPropertyValue("--theme-primary")).toBe("")
    expect(status()).toHaveAttribute("data-status", "unpublished")

    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 10))
    expect(api.save).toHaveBeenLastCalledWith(
      1,
      { formatVersion: 1, colors: { primary: { light: "#0f766e" } } },
      { keepalive: false },
    )
  })

  it("makes typing one colour one undo step", async () => {
    const { user } = renderEditor()
    await typePrimary(user, "#0F766E")
    await user.click(screen.getByTestId("theme-undo"))
    expect(preview().style.getPropertyValue("--theme-primary")).toBe("initial")
    expect(status()).toHaveAttribute("data-status", "published")
    await user.click(screen.getByTestId("theme-redo"))
    expect(preview().style.getPropertyValue("--theme-primary")).toBe("#0f766e")
  })

  it("warns where a colour cannot reach 4.5:1 (C4-4)", async () => {
    const { user } = renderEditor()
    expect(screen.queryByTestId("theme-contrast-warning")).not.toBeInTheDocument()
    await typePrimary(user, "#FFE600")
    expect(screen.getByTestId("theme-contrast-warning")).toHaveTextContent(/light mode/)
  })

  it("publishes the saved draft, and tells the app (C4-2)", async () => {
    const { api, onPublished, user } = renderEditor(stateOf({ ...EMPTY, radius: 12 }, EMPTY))
    expect(status()).toHaveAttribute("data-status", "unpublished")
    await user.click(screen.getByTestId("theme-publish"))
    expect(api.publish).toHaveBeenCalledWith(1)
    expect(onPublished).toHaveBeenCalledWith(
      expect.objectContaining({ document: { ...EMPTY, radius: 12 } }),
    )
    expect(status()).toHaveAttribute("data-status", "published")
    expect(screen.getByTestId("theme-live")).toHaveTextContent("Published.")
  })

  it("discards the draft back to the published theme (C4-11)", async () => {
    const { api, user } = renderEditor(stateOf({ ...EMPTY, radius: 12 }, EMPTY))
    await user.click(screen.getByTestId("theme-discard"))
    expect(api.discard).toHaveBeenCalledWith(1)
    expect(status()).toHaveAttribute("data-status", "published")
    expect(screen.getByTestId("theme-radius")).toHaveValue("8")
  })

  it("resets to the built-in look as a draft that still needs publishing (C4-13)", async () => {
    const teal = { ...EMPTY, colors: { primary: { light: "#0f766e" } } }
    const { user } = renderEditor(stateOf(teal, teal))
    await user.click(screen.getByTestId("theme-reset-default"))
    expect(preview().style.getPropertyValue("--theme-primary")).toBe("initial")
    expect(status()).toHaveAttribute("data-status", "unpublished")
  })

  it("stops saving on a conflict and offers a reload (C4-12)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const conflict = new ApiRequestError("revision_conflict", "Changed elsewhere.", 409)
    const { api, user } = renderEditor(stateOf(EMPTY), {
      save: vi.fn(async () => Promise.reject(conflict)),
    })
    await typePrimary(user, "#0F766E")
    await act(async () => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 10))
    expect(await screen.findByTestId("theme-conflict")).toBeInTheDocument()

    await user.click(screen.getByTestId("theme-conflict-reload"))
    expect(api.load).toHaveBeenCalled()
    expect(screen.queryByTestId("theme-conflict")).not.toBeInTheDocument()
  })

  it("keeps and flags a component type it does not know (C4-15)", () => {
    renderEditor(stateOf({ ...EMPTY, components: { gauge: { root: { radius: "full" } } } }))
    expect(screen.getByTestId("theme-component-gauge")).toHaveTextContent(
      "is not a component this version of the app knows",
    )
  })

  it.each(["text-field", "select", "card"])(
    "lists the same slots and style properties for %s as the instance panel (C4-9)",
    async (type) => {
      const { user } = renderEditor()
      await user.click(screen.getByTestId(`theme-component-${type}`))
      const definition = registry.get(type)
      for (const slot of definition?.slots ?? []) {
        await user.click(screen.getByTestId(`theme-slot-${slot}`))
        for (const property of [
          "color",
          "background",
          "borderColor",
          "radius",
          "fontWeight",
          "padding",
        ]) {
          expect(screen.getByTestId(`theme-style-${slot}-${property}`)).toBeInTheDocument()
        }
      }
    },
  )

  it("sets a component default, shown in the preview and marked as set in the theme (C4-7)", async () => {
    const { user } = renderEditor()
    await user.click(screen.getByTestId("theme-component-button"))
    await user.click(screen.getByTestId("theme-slot-root"))
    await user.click(screen.getByTestId("theme-style-root-background"))
    await user.click(screen.getByTestId("theme-token-success"))
    expect(within(preview()).getByTestId("field-button1").style.backgroundColor).toBe(
      "var(--sys-color-success)",
    )
    expect(screen.getByTestId("theme-style-source-root-background")).toHaveTextContent(
      "Set in the theme",
    )
  })

  it("moves between swatches with the arrow keys, one Tab stop (section 6)", async () => {
    const { user } = renderEditor()
    await user.click(screen.getByTestId("theme-color-primary"))
    const swatches = within(screen.getByTestId("theme-color-primary-popup")).getAllByRole("button")
    expect(swatches.filter((swatch) => swatch.tabIndex === 0)).toHaveLength(1)
    swatches[0].focus()
    await user.keyboard("{ArrowRight}")
    expect(swatches[1]).toHaveFocus()
    await user.keyboard("{ArrowDown}")
    expect(swatches[3]).toHaveFocus()
    await user.keyboard("{End}")
    expect(swatches.at(-1)).toHaveFocus()
  })

  it("keeps focus on Publish and on Discard once they have nothing left to do (Phase 5, section 8)", async () => {
    const { api, user } = renderEditor(stateOf({ ...EMPTY, radius: 12 }, EMPTY))
    const publish = screen.getByTestId("theme-publish")
    publish.focus()
    await user.keyboard("{Enter}")
    expect(status()).toHaveAttribute("data-status", "published")
    // Unavailable, said so, and still where the keyboard is.
    expect(publish).toHaveAttribute("aria-disabled", "true")
    expect(publish).not.toBeDisabled()
    expect(publish).toHaveFocus()
    // And it does nothing while it says so.
    await user.keyboard("{Enter}")
    expect(api.publish).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTestId("theme-reset-default"))
    await user.click(screen.getByTestId("theme-undo"))
    await user.click(screen.getByTestId("theme-redo"))
    const discard = screen.getByTestId("theme-discard")
    expect(discard).not.toHaveAttribute("aria-disabled")
    discard.focus()
    await user.keyboard("{Enter}")
    expect(status()).toHaveAttribute("data-status", "published")
    expect(discard).toHaveAttribute("aria-disabled", "true")
    expect(discard).not.toBeDisabled()
    expect(discard).toHaveFocus()
    await user.keyboard("{Enter}")
    expect(api.discard).toHaveBeenCalledTimes(1)
  })

  it("makes the component grid one Tab stop moved with the arrow keys (Phase 5, section 8)", async () => {
    const { user } = renderEditor()
    const items = within(screen.getByRole("list", { name: "Components" })).getAllByRole("button")
    expect(items.length).toBe(registry.size)
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[0]])

    items[0].focus()
    await user.keyboard("{ArrowRight}")
    expect(items[1]).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(items[2]).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(items[1]).toHaveFocus()
    await user.keyboard("{End}")
    expect(items.at(-1)).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(items.at(-1)).toHaveFocus()
    await user.keyboard("{Home}")
    expect(items[0]).toHaveFocus()

    // The one last focused holds the Tab stop, and Enter chooses it.
    await user.keyboard("{ArrowRight}{Enter}")
    expect(items[1]).toHaveAttribute("aria-pressed", "true")
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[1]])
    expect(screen.getByTestId("theme-component-defaults")).toBeInTheDocument()
  })

  it("opens the grid's Tab stop on the component being styled", async () => {
    const { user } = renderEditor()
    const items = within(screen.getByRole("list", { name: "Components" })).getAllByRole("button")
    await user.click(items[3])
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[3]])
  })

  it("names the component when it says what a default became (Phase 5, section 8)", async () => {
    const { user } = renderEditor()
    await user.click(screen.getByTestId("theme-component-card"))
    await user.click(screen.getByTestId("theme-slot-root"))
    await user.click(screen.getByTestId("theme-style-root-background"))
    await user.click(screen.getByTestId("theme-token-success"))
    expect(screen.getByTestId("theme-live")).toHaveTextContent(
      "Background of Card's whole component: Success.",
    )
    expect(screen.getByTestId("theme-undo")).toHaveAccessibleName(
      "Undo: Change background of Card's whole component",
    )
    await user.keyboard("{Escape}")
    await user.click(screen.getByTestId("theme-style-reset-root"))
    expect(screen.getByTestId("theme-live")).toHaveTextContent(
      "Every style of Card's whole component is back to the component's own.",
    )
  })

  it("does not cut a component's name off (Phase 5, section 8)", () => {
    renderEditor()
    for (const definition of registry.values()) {
      const name = screen.getByTestId(`theme-component-${definition.type}-name`)
      expect(name).toHaveTextContent(definition.displayName)
      expect(name.className).not.toMatch(/truncate|line-clamp|text-ellipsis/)
    }
  })
})
