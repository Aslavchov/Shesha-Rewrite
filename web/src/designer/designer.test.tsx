import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { registry } from "@/forms/registry"
import type { ComponentInstance, FormDocument, FormRecord } from "@/generated"
import { ApiRequestError } from "@/lib/api"

import { Designer } from "./designer"
import { AUTOSAVE_DELAY_MS, type SendSave } from "./save"
import { columns, container, field, form } from "./testing/documents"

/**
 * jsdom lays nothing out, so every element measures as an empty box and the
 * canvas would have no instances to show. Give each element a box of its own:
 * one below the other, in the order they are first measured.
 */
function stubLayout() {
  const tops = new WeakMap<Element, number>()
  let next = 0
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (!tops.has(this)) tops.set(this, next++ * 50)
    return new DOMRect(0, tops.get(this), 400, 40)
  })
}

const layout = (document: FormDocument): unknown[] => {
  const list = (instances: readonly ComponentInstance[]): unknown[] =>
    instances.map((instance) => {
      const regions = Object.entries(instance.regions ?? {})
      return regions.length === 0
        ? instance.name
        : {
            [instance.name]: Object.fromEntries(
              regions.map(([name, children]) => [name, list(children)]),
            ),
          }
    })
  return list(document.components)
}

function renderDesigner(
  components: ComponentInstance[] = [],
  options: { save?: SendSave; load?: () => Promise<FormRecord> } = {},
) {
  const record: FormRecord = {
    id: "f1",
    revision: 1,
    updatedAt: "2026-11-13T09:15:02.417Z",
    document: { ...form(components), name: "Under design" },
  }
  /** Stores whatever it is sent, as the server would. */
  const save = vi.fn<SendSave>(
    options.save ??
      (async (revision, document) => ({ ...record, revision: revision + 1, document })),
  )
  const load = vi.fn(options.load ?? (async () => record))
  const onSaved = vi.fn()
  const router = createMemoryRouter(
    [
      {
        path: "/designer/f1",
        element: (
          <Designer
            record={record}
            registry={registry}
            mainId="main"
            save={save}
            load={load}
            onSaved={onSaved}
            back={{ to: "/designer", label: "Designer" }}
          />
        ),
      },
      { path: "/designer", element: <p data-testid="left">The list</p> },
    ],
    { initialEntries: ["/designer/f1"] },
  )
  const view = render(<RouterProvider router={router} />)
  return { user: userEvent.setup(), save, load, onSaved, router, record, ...view }
}

const toolboxItem = (type: string) => screen.getByTestId(`toolbox-item-${type}`)
const row = (name: string) => screen.getByTestId(`outline-${name}`)
const proxy = (name: string) => screen.getByTestId(`canvas-${name}`)
const live = () => screen.getByTestId("designer-live").textContent
const outlineRows = () =>
  [...screen.getByTestId("designer-outline").querySelectorAll("[data-row]")].map((element) =>
    (element.getAttribute("data-testid") ?? "").replace("outline-", ""),
  )
/** The document the designer last sent to be saved. */
const lastSaved = (save: ReturnType<typeof vi.fn<SendSave>>) => save.mock.lastCall![1]

beforeEach(stubLayout)
afterEach(() => vi.useRealTimers())

describe("the designer's layout", () => {
  it("has a toolbox, a canvas, an outline, a properties area and a toolbar", () => {
    renderDesigner()

    for (const testId of [
      "designer-page",
      "designer-toolbox",
      "designer-canvas",
      "designer-outline",
      "designer-properties",
      "designer-undo",
      "designer-redo",
      "designer-delete",
      "designer-duplicate",
      "designer-mode-design",
      "designer-mode-preview",
      "designer-save-status",
      "designer-shortcuts",
    ]) {
      expect(screen.getByTestId(testId), testId).toBeInTheDocument()
    }
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Under design")
    expect(screen.getByRole("main")).toHaveAttribute("id", "main")
    expect(screen.getByTestId("designer-save-status")).toHaveTextContent("Saved")
  })

  it("builds the toolbox from the registry: every component, by category, with its description", () => {
    renderDesigner()
    const toolbox = screen.getByTestId("designer-toolbox")

    for (const definition of registry.values()) {
      const item = toolboxItem(definition.type)
      expect(item).toHaveAccessibleName(definition.displayName)
      expect(item).toHaveAccessibleDescription(definition.description)
    }
    expect(within(toolbox).getAllByRole("button")).toHaveLength(registry.size)

    const groups = within(toolbox)
      .getAllByRole("region")
      .map((group) => [
        within(group).getByRole("heading").textContent,
        within(group).getAllByRole("button").length,
      ])
    const count = (category: string) =>
      [...registry.values()].filter((definition) => definition.category === category).length
    expect(groups).toEqual([
      ["Inputs", count("input")],
      ["Layout", count("layout")],
      ["Actions", count("action")],
    ])
  })

  it("shows an empty form as a place to drop the first component", () => {
    renderDesigner()
    expect(screen.getByTestId("drop-target")).toHaveTextContent("Drag a component here")
    expect(screen.getByTestId("designer-outline")).toHaveTextContent("Nothing yet")
    expect(screen.getByTestId("designer-properties")).toHaveTextContent("Nothing is selected")
  })

  it("renders the form through the real components, inert", () => {
    renderDesigner([{ ...field("first"), settings: { label: "First name" } }])
    const canvas = screen.getByTestId("designer-canvas")

    // The real text field, label and all; unreachable because its form is inert.
    const control = within(canvas).getByTestId("field-first-control")
    expect(within(canvas).getByText("First name")).toBeInTheDocument()
    expect(control.closest("[inert]")).not.toBeNull()
    expect(within(canvas).getByTestId("form")).toHaveAttribute("data-mode", "design")
  })

  it("puts a box over every instance the form shows, and a row in the outline for all of them", () => {
    renderDesigner([
      field("alpha"),
      columns("row", { col1: [container("box", [field("deep")])], col3: [field("lost")] }, 2),
    ])

    for (const name of ["alpha", "row", "box", "deep"]) {
      expect(proxy(name)).toHaveAttribute("aria-pressed", "false")
    }
    expect(proxy("deep")).toHaveAccessibleName("deep, Text field")
    // Stored in a third column of a two-column Columns: not on the canvas, hidden in the outline.
    expect(screen.queryByTestId("canvas-lost")).not.toBeInTheDocument()
    expect(outlineRows()).toEqual([
      "alpha",
      "row",
      "row-col1",
      "box",
      "deep",
      "row-col2",
      "row-col3",
      "lost",
    ])
    expect(row("lost")).toHaveAttribute("data-hidden", "true")
    expect(row("lost")).toHaveAccessibleName("lost, Text field, in col3, hidden")
    expect(row("lost")).toHaveTextContent("Hidden")
    expect(row("deep")).toHaveAttribute("aria-level", "4")
  })
})

describe("adding from the toolbox", () => {
  it("adds at the end of the form when nothing is selected, and selects what it added", async () => {
    const { user } = renderDesigner([field("alpha")])

    await user.click(toolboxItem("number-field"))

    expect(outlineRows()).toEqual(["alpha", "numberField1"])
    expect(row("numberField1")).toHaveAttribute("aria-selected", "true")
    expect(proxy("numberField1")).toHaveAttribute("aria-pressed", "true")
    expect(live()).toBe("Added Number field numberField1 at position 2 of 2 in the form.")
    expect(screen.getByTestId("designer-properties-name")).toHaveTextContent("numberField1")
    expect(screen.getByTestId("designer-properties-type")).toHaveTextContent("Number field")
  })

  it("adds after the selected instance", async () => {
    const { user } = renderDesigner([container("box", [field("alpha"), field("beta")])])

    await user.click(row("alpha"))
    await user.click(toolboxItem("switch"))

    expect(outlineRows()).toEqual(["box", "alpha", "switch1", "beta"])
  })

  it("adds with Enter, and leaves focus on the toolbox item to add another", async () => {
    const { user } = renderDesigner()
    toolboxItem("text-field").focus()

    await user.keyboard("{Enter}{Enter}")

    expect(outlineRows()).toEqual(["textField1", "textField2"])
    expect(toolboxItem("text-field")).toHaveFocus()
  })
})

describe("selection", () => {
  it("selecting in the outline selects on the canvas, and the other way round", async () => {
    const { user } = renderDesigner([field("alpha"), field("beta")])

    await user.click(row("beta"))
    expect(proxy("beta")).toHaveAttribute("aria-pressed", "true")
    expect(proxy("alpha")).toHaveAttribute("aria-pressed", "false")

    await user.click(proxy("alpha"))
    expect(row("alpha")).toHaveAttribute("aria-selected", "true")
    expect(row("beta")).toHaveAttribute("aria-selected", "false")
    expect(screen.getByTestId("designer-properties-name")).toHaveTextContent("alpha")
  })

  it("Escape clears it", async () => {
    const { user } = renderDesigner([field("alpha")])
    await user.click(row("alpha"))

    await user.keyboard("{Escape}")

    expect(row("alpha")).toHaveAttribute("aria-selected", "false")
    expect(screen.getByTestId("designer-properties")).toHaveTextContent("Nothing is selected")
  })

  it("says so in the properties area when the selection is not shown by the form", async () => {
    const { user } = renderDesigner([columns("row", { col3: [field("lost")] }, 2)])
    await user.click(row("lost"))
    expect(screen.getByTestId("designer-properties-hidden")).toBeInTheDocument()
  })

  it("names a component type this build does not have", async () => {
    const { user } = renderDesigner([{ id: "c_x", type: "hologram", name: "ghost" }])
    await user.click(row("ghost"))
    expect(screen.getByTestId("designer-properties-type")).toHaveTextContent(
      "Unknown component “hologram”",
    )
  })

  it("keeps one Tab stop on the canvas and one in the outline: the selection, else the first", async () => {
    const { user } = renderDesigner([field("alpha"), field("beta")])
    const stops = (testId: string) =>
      [...screen.getByTestId(testId).querySelectorAll('[tabindex="0"]')].map((element) =>
        element.getAttribute("data-testid"),
      )
    expect(stops("designer-canvas")).toEqual(["canvas-alpha"])
    expect(stops("designer-outline")).toEqual(["outline-alpha"])

    await user.click(row("beta"))
    expect(stops("designer-canvas")).toEqual(["canvas-beta"])
    expect(stops("designer-outline")).toEqual(["outline-beta"])
  })
})

describe("commands", () => {
  it("delete and duplicate need a selection; undo and redo need a history", async () => {
    const { user } = renderDesigner([field("alpha")])
    const button = (id: string) => screen.getByTestId(`designer-${id}`)
    const disabled = () =>
      ["undo", "redo", "delete", "duplicate"].filter(
        (id) => button(id).getAttribute("aria-disabled") === "true",
      )
    expect(disabled()).toEqual(["undo", "redo", "delete", "duplicate"])

    await user.click(row("alpha"))
    expect(disabled()).toEqual(["undo", "redo"])

    await user.click(button("duplicate"))
    expect(disabled()).toEqual(["redo"])
    await user.click(button("undo"))
    expect(disabled()).toEqual(["undo"])
  })

  it("a disabled button does nothing, and stays reachable by keyboard", async () => {
    const { user } = renderDesigner([field("alpha")])
    const remove = screen.getByTestId("designer-delete")

    await user.click(remove)
    remove.focus()
    await user.keyboard("{Enter}")

    expect(outlineRows()).toEqual(["alpha"])
    expect(remove).toHaveFocus()
  })

  it("the toolbar deletes, undoes and redoes", async () => {
    const { user } = renderDesigner([field("alpha"), field("beta")])
    await user.click(row("alpha"))

    await user.click(screen.getByTestId("designer-delete"))
    expect(outlineRows()).toEqual(["beta"])
    expect(row("beta")).toHaveAttribute("aria-selected", "true")

    await user.click(screen.getByTestId("designer-undo"))
    expect(outlineRows()).toEqual(["alpha", "beta"])
    expect(row("alpha")).toHaveAttribute("aria-selected", "true")
    expect(live()).toBe("Undid: Delete alpha.")

    await user.click(screen.getByTestId("designer-redo"))
    expect(outlineRows()).toEqual(["beta"])
  })

  it("the keyboard moves the selection up and down, into and out of containers", async () => {
    const { user } = renderDesigner([columns("row"), field("alpha")])
    await user.click(row("alpha"))

    await user.keyboard("{Alt>}{ArrowUp}{/Alt}")
    expect(live()).toBe("Moved alpha to position 1 of 1 in col2 of row.")
    expect(outlineRows()).toEqual(["row", "row-col1", "row-col2", "alpha"])
    expect(row("alpha")).toHaveFocus()

    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(live()).toBe("Moved alpha to position 2 of 2 in the form.")
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}")
    expect(live()).toBe("alpha is already at the bottom of the form.")
  })

  it("after a delete from the outline, focus goes with the selection", async () => {
    const { user } = renderDesigner([field("alpha"), field("beta")])
    await user.click(row("alpha"))

    await user.keyboard("{Delete}")

    expect(outlineRows()).toEqual(["beta"])
    expect(row("beta")).toHaveFocus()
    await user.keyboard("{Backspace}")
    expect(outlineRows()).toEqual([])
    // Nothing left to select: the outline itself holds focus.
    expect(screen.getByTestId("designer-outline")).toHaveFocus()
  })

  it("Delete does nothing from a toolbox item or a toolbar button", async () => {
    const { user } = renderDesigner([field("alpha")])
    await user.click(row("alpha"))

    toolboxItem("button").focus()
    await user.keyboard("{Delete}")
    screen.getByTestId("designer-shortcuts").focus()
    await user.keyboard("{Backspace}")

    expect(outlineRows()).toEqual(["alpha"])
  })

  it("undo, redo and duplicate have shortcuts that work from anywhere in the designer", async () => {
    const { user } = renderDesigner([field("alpha")])
    await user.click(row("alpha"))
    toolboxItem("button").focus()

    await user.keyboard("{Control>}d{/Control}")
    expect(outlineRows()).toEqual(["alpha", "textField1"])
    await user.keyboard("{Control>}z{/Control}")
    expect(outlineRows()).toEqual(["alpha"])
    await user.keyboard("{Control>}y{/Control}")
    expect(outlineRows()).toEqual(["alpha", "textField1"])
    await user.keyboard("{Control>}z{/Control}{Control>}{Shift>}z{/Shift}{/Control}")
    expect(outlineRows()).toEqual(["alpha", "textField1"])
    // Focus stayed where it was.
    expect(toolboxItem("button")).toHaveFocus()
  })

  it("the arrow keys walk the outline as a tree", async () => {
    const { user } = renderDesigner([
      field("alpha"),
      container("box", [field("beta")]),
      field("gamma"),
    ])
    await user.click(row("alpha"))

    await user.keyboard("{ArrowDown}")
    expect(row("box")).toHaveFocus()
    expect(row("box")).toHaveAttribute("aria-selected", "true")
    await user.keyboard("{ArrowRight}")
    expect(row("beta")).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(row("box")).toHaveFocus()
    await user.keyboard("{End}")
    expect(row("gamma")).toHaveFocus()
    await user.keyboard("{Home}")
    expect(row("alpha")).toHaveFocus()
    await user.keyboard("{ArrowUp}")
    expect(row("alpha")).toHaveFocus()
  })

  it("the arrow keys walk the canvas in document order", async () => {
    const { user } = renderDesigner([field("alpha"), container("box", [field("beta")])])
    await user.click(proxy("alpha"))

    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(proxy("beta")).toHaveFocus()
    expect(proxy("beta")).toHaveAttribute("aria-pressed", "true")
    await user.keyboard("{Home}")
    expect(proxy("alpha")).toHaveFocus()
  })
})

describe("preview", () => {
  it("shows the interactive form, and locks everything that changes the document", async () => {
    const { user } = renderDesigner([{ ...field("first"), settings: { label: "First name" } }])
    await user.click(row("first"))

    await user.click(screen.getByTestId("designer-mode-preview"))

    expect(screen.getByTestId("designer-canvas")).toHaveAttribute("data-mode", "preview")
    expect(screen.queryByTestId("canvas-first")).not.toBeInTheDocument()
    const control = screen.getByRole("textbox", { name: "First name" })
    await user.type(control, "Ada")
    expect(control).toHaveValue("Ada")
    expect(screen.getByTestId("designer-toolbox").closest("[inert]")).not.toBeNull()
    expect(screen.getByTestId("designer-delete")).toHaveAttribute("aria-disabled", "true")

    // Shortcuts are for designing: in a preview field, Backspace is just Backspace.
    await user.keyboard("{Backspace}")
    expect(control).toHaveValue("Ad")

    await user.click(screen.getByTestId("designer-mode-design"))
    expect(outlineRows()).toEqual(["first"])
    expect(row("first")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByTestId("designer-toolbox").closest("[inert]")).toBeNull()
  })
})

describe("saving", () => {
  it("saves a change by itself, with the revision the form was loaded at", async () => {
    const { user, save, onSaved } = renderDesigner([field("alpha")])

    await user.click(toolboxItem("button"))
    expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "saving")
    expect(save).not.toHaveBeenCalled()

    await waitFor(() => expect(save).toHaveBeenCalledOnce(), { timeout: 3 * AUTOSAVE_DELAY_MS })
    expect(save.mock.lastCall![0]).toBe(1)
    expect(layout(lastSaved(save))).toEqual(["alpha", "button1"])
    await waitFor(() =>
      expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "saved"),
    )
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it("selecting, previewing and looking at shortcuts save nothing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user, save } = renderDesigner([field("alpha")])

    await user.click(row("alpha"))
    await user.click(screen.getByTestId("designer-mode-preview"))
    await user.click(screen.getByTestId("designer-mode-design"))
    await user.keyboard("{Escape}")
    act(() => void vi.advanceTimersByTime(5 * AUTOSAVE_DELAY_MS))

    expect(save).not.toHaveBeenCalled()
    expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "saved")
  })

  it("leaving the designer saves what was waiting, at once", async () => {
    const { user, save, router } = renderDesigner()

    await user.click(toolboxItem("button"))
    await user.click(screen.getByTestId("designer-back"))

    expect(await screen.findByTestId("left")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/designer")
    expect(save).toHaveBeenCalledOnce()
    expect(layout(lastSaved(save))).toEqual(["button1"])
  })

  it("says why a save failed, announces it, and retries when asked", async () => {
    let isDown = true
    const { user, save, record } = renderDesigner([], {
      save: async (revision, document) => {
        if (isDown)
          throw new ApiRequestError("network_error", "The server could not be reached.", null)
        return { ...record, revision: revision + 1, document }
      },
    })

    await user.click(toolboxItem("button"))
    await waitFor(
      () =>
        expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "error"),
      { timeout: 3 * AUTOSAVE_DELAY_MS },
    )
    expect(screen.getByTestId("designer-save-status")).toHaveTextContent(
      "Not saved: The server could not be reached.",
    )
    expect(live()).toBe("Not saved: The server could not be reached.")

    isDown = false
    await user.click(screen.getByTestId("designer-save-retry"))
    await waitFor(() =>
      expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "saved"),
    )
    expect(save).toHaveBeenCalledTimes(2)
  })

  it("on a conflict: stops saving, says so plainly, locks the designer and offers a reload", async () => {
    const theirs: FormRecord = {
      id: "f1",
      revision: 7,
      updatedAt: "2026-11-13T10:00:00.000Z",
      document: { ...form([field("theirs")]), name: "Under design" },
    }
    let conflicts = true
    const { user, save, load } = renderDesigner([field("mine")], {
      save: async (revision, document) => {
        if (conflicts) {
          throw new ApiRequestError(
            "revision_conflict",
            "The form has changed since revision 1.",
            409,
          )
        }
        return { ...theirs, revision: revision + 1, document }
      },
      load: async () => theirs,
    })

    await user.click(toolboxItem("button"))
    const banner = await screen.findByTestId("designer-conflict", undefined, {
      timeout: 3 * AUTOSAVE_DELAY_MS,
    })
    expect(banner).toHaveAttribute("role", "alert")
    expect(banner).toHaveTextContent("This form was changed somewhere else")
    expect(banner).toHaveTextContent("nothing is overwritten")
    expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "conflict")
    expect(screen.getByTestId("designer-toolbox").closest("[inert]")).not.toBeNull()
    expect(screen.getByTestId("designer-canvas").closest("[inert]")).not.toBeNull()
    expect(screen.getByTestId("designer-undo")).toHaveAttribute("aria-disabled", "true")

    // Shortcuts are locked too: nothing more can change, or be sent.
    await user.keyboard("{Control>}z{/Control}")
    expect(outlineRows()).toEqual(["mine", "button1"])
    expect(save).toHaveBeenCalledOnce()

    conflicts = false
    await user.click(screen.getByTestId("designer-conflict-reload"))
    await waitFor(() => expect(screen.queryByTestId("designer-conflict")).not.toBeInTheDocument())
    expect(load).toHaveBeenCalledOnce()
    // The form as it is now, with a clean history.
    expect(outlineRows()).toEqual(["theirs"])
    expect(screen.getByTestId("designer-undo")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("designer-save-status")).toHaveAttribute("data-status", "saved")

    // And saving works again, from the revision that was reloaded.
    await user.click(toolboxItem("switch"))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2), { timeout: 3 * AUTOSAVE_DELAY_MS })
    expect(save.mock.lastCall![0]).toBe(7)
  })

  it("keeps offering the reload when the reload itself fails", async () => {
    const { user } = renderDesigner([], {
      save: async () => {
        throw new ApiRequestError("revision_conflict", "Changed.", 409)
      },
      load: async () => {
        throw new ApiRequestError("network_error", "The server could not be reached.", null)
      },
    })
    await user.click(toolboxItem("button"))
    const banner = await screen.findByTestId("designer-conflict", undefined, {
      timeout: 3 * AUTOSAVE_DELAY_MS,
    })

    await user.click(screen.getByTestId("designer-conflict-reload"))

    await waitFor(() => expect(banner).toHaveTextContent("could not be reloaded"))
    expect(screen.getByTestId("designer-conflict-reload")).toBeEnabled()
  })
})

describe("finding the shortcuts", () => {
  it("lists them in a popup opened from the toolbar", async () => {
    const { user } = renderDesigner()

    await user.click(screen.getByTestId("designer-shortcuts"))

    const list = await screen.findByTestId("designer-shortcuts-list")
    for (const label of ["Undo", "Redo", "Duplicate", "Delete", "Clear the selection"]) {
      expect(list).toHaveTextContent(label)
    }
  })
})
