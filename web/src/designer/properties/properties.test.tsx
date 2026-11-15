import { act, fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TypeIcon } from "lucide-react"
import { createMemoryRouter } from "react-router"
import { RouterProvider } from "react-router/dom"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { registry } from "@/forms/registry"
import { createRegistry, defineStatic, type Registry } from "@/forms/runtime"
import { optionalText, text } from "@/forms/runtime/settings"
import type { ComponentInstance, FormRecord } from "@/generated"

import { Designer } from "../designer"
import { AUTOSAVE_DELAY_MS, type SendSave } from "../save"
import { columns, field, form } from "../testing/documents"

/** The properties panel (spec section 3), in jsdom. */

function stubLayout() {
  const tops = new WeakMap<Element, number>()
  let next = 0
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (!tops.has(this)) tops.set(this, next++ * 50)
    return new DOMRect(0, tops.get(this), 400, 40)
  })
}

beforeEach(stubLayout)
afterEach(() => vi.useRealTimers())

function renderDesigner(
  components: ComponentInstance[] = [],
  options: { registry?: Registry } = {},
) {
  const record: FormRecord = {
    id: "f1",
    revision: 1,
    updatedAt: "2026-11-13T09:15:02.417Z",
    document: { ...form(components), name: "Under design" },
  }
  const save = vi.fn<SendSave>(async (revision, document) => ({
    ...record,
    revision: revision + 1,
    document,
  }))
  const router = createMemoryRouter(
    [
      {
        path: "/designer/f1",
        element: (
          <Designer
            record={record}
            registry={options.registry ?? registry}
            mainId="main"
            save={save}
            load={async () => record}
            back={{ to: "/designer", label: "Designer" }}
          />
        ),
      },
    ],
    { initialEntries: ["/designer/f1"] },
  )
  render(<RouterProvider router={router} />)
  return { user: userEvent.setup(), save }
}

const row = (name: string) => screen.getByTestId(`outline-${name}`)
const setting = (key: string) => screen.getByTestId(`props-setting-${key}`)
const panel = () => screen.getByTestId("designer-properties")
const live = () => screen.getByTestId("designer-live").textContent
const canvasField = (name: string) =>
  within(screen.getByTestId("designer-canvas")).getByTestId(`field-${name}`)
const sourceOf = (key: string) =>
  setting(key).closest("[data-value-source]")?.getAttribute("data-value-source")

describe("a panel generated from the definition (spec 3.1)", () => {
  it("has an editor for every setting of every registered component", async () => {
    for (const definition of registry.values()) {
      const instance: ComponentInstance = {
        id: "c_x",
        type: definition.type,
        name: "x",
        ...(definition.kind === "input" ? { bind: "x" } : {}),
      }
      const { user } = renderDesigner([instance])
      await user.click(row("x"))
      for (const [key, descriptor] of Object.entries(definition.settings)) {
        // An input with no rules has no messages to edit.
        if (descriptor.kind === "messages" && definition.rules.length === 0) continue
        expect(
          screen.getByTestId(`props-setting-${key}`),
          `${definition.type}.${key}`,
        ).toBeInTheDocument()
      }
      for (const slot of definition.slots) {
        expect(
          screen.getByTestId(`props-slot-${slot}`),
          `${definition.type} ${slot}`,
        ).toBeInTheDocument()
      }
      document.body.innerHTML = ""
    }
  })

  it("shows a setting added to a definition, with no change to the panel", async () => {
    const plain = { text: text({ label: "Text", group: "general", default: "Hello" }) }
    const banner = (settings: typeof plain & Record<string, ReturnType<typeof optionalText>>) =>
      defineStatic({
        type: "banner",
        displayName: "Banner",
        description: "A test component.",
        category: "content",
        icon: TypeIcon,
        settings,
        slots: ["root"],
        Edit: ({ settings: resolved, slots }) => <p {...slots.root}>{String(resolved.text)}</p>,
        ReadOnly: () => null,
      })
    const instance = { id: "c_b", type: "banner", name: "b" }

    const { user } = renderDesigner([instance], { registry: createRegistry([banner(plain)]) })
    await user.click(row("b"))
    expect(screen.queryByTestId("props-setting-subtitle")).not.toBeInTheDocument()
    document.body.innerHTML = ""

    const extended = {
      ...plain,
      subtitle: optionalText({ label: "Subtitle", help: "Shown under the text.", group: "layout" }),
    }
    const second = renderDesigner([instance], { registry: createRegistry([banner(extended)]) })
    await second.user.click(row("b"))
    expect(setting("subtitle")).toBeInTheDocument()
    expect(
      within(screen.getByTestId("props-group-layout")).getByText("Subtitle"),
    ).toBeInTheDocument()
    expect(screen.getByText("Shown under the text.")).toBeInTheDocument()
  })

  it("groups settings by their group", async () => {
    const { user } = renderDesigner([field("a")])
    await user.click(row("a"))
    expect(
      within(screen.getByTestId("props-group-general")).getByTestId("props-setting-label"),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId("props-group-validation")).getByTestId("props-setting-maxLength"),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId("props-group-data")).getByTestId("props-setting-defaultValue"),
    ).toBeInTheDocument()
  })
})

describe("identity (spec 3.2)", () => {
  it("renames as you type, keeping the id, and refuses what cannot be a name", async () => {
    const { user } = renderDesigner([field("a"), field("taken")])
    await user.click(row("a"))
    const name = screen.getByTestId("props-name")

    await user.clear(name)
    await user.type(name, "first")
    expect(row("first")).toBeInTheDocument()
    expect(screen.getByTestId("canvas-first")).toHaveAttribute("data-canvas-item", "c_a")

    await user.type(name, " name")
    expect(within(panel()).getByRole("alert")).toHaveTextContent(
      "Use only letters, digits, _ and $, with no spaces.",
    )
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(row("first")).toBeInTheDocument()

    await user.clear(name)
    await user.type(name, "taken")
    expect(within(panel()).getByRole("alert")).toHaveTextContent(
      "“taken” is already the name of another component.",
    )
  })

  it("edits the data path of an input, and refuses one that clashes", async () => {
    const { user } = renderDesigner([field("a"), { ...field("b"), bind: "person" }])
    await user.click(row("a"))
    const path = screen.getByTestId("props-bind")
    await user.clear(path)
    await user.type(path, "person.firstName")
    expect(within(panel()).getByRole("alert")).toHaveTextContent("clashes with person (b)")
    await user.clear(path)
    await user.type(path, "contact.firstName")
    expect(within(panel()).queryByRole("alert")).not.toBeInTheDocument()
  })

  it("has no data path for a component that holds no value", async () => {
    const { user } = renderDesigner([columns("row")])
    await user.click(row("row"))
    expect(screen.getByTestId("props-name")).toBeInTheDocument()
    expect(screen.queryByTestId("props-bind")).not.toBeInTheDocument()
  })
})

describe("editing settings (spec 3.3)", () => {
  it("changes the canvas as you type, and one undo restores the whole old label", async () => {
    const { user } = renderDesigner([{ ...field("a"), settings: { label: "Name" } }])
    await user.click(row("a"))
    const label = setting("label")
    await user.clear(label)
    await user.type(label, "First name")
    expect(canvasField("a")).toHaveTextContent("First name")

    await user.keyboard("{Control>}z{/Control}")
    expect(canvasField("a")).toHaveTextContent("Name")
    expect(label).toHaveValue("Name")
    expect(screen.getByTestId("designer-undo")).toHaveAttribute("aria-disabled", "true")
  })

  it("shows whether a setting is set or default, and reset removes it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { user, save } = renderDesigner([field("a")])
    await user.click(row("a"))
    expect(sourceOf("placeholder")).toBe("default")
    expect(screen.queryByTestId("props-reset-placeholder")).not.toBeInTheDocument()

    await user.type(setting("placeholder"), "e.g. Ada")
    expect(sourceOf("placeholder")).toBe("set")
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    expect(save.mock.lastCall?.[1].components[0].settings).toEqual({ placeholder: "e.g. Ada" })

    await user.click(screen.getByTestId("props-reset-placeholder"))
    expect(sourceOf("placeholder")).toBe("default")
    expect(setting("placeholder")).toHaveValue("")
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS))
    expect(save.mock.lastCall?.[1].components[0]).not.toHaveProperty("settings")
  })

  it("never stores an invalid value, and says why", async () => {
    const { user } = renderDesigner([{ ...field("a"), settings: { maxLength: 5 } }])
    await user.click(row("a"))
    const max = setting("maxLength")
    // At once, as a paste would: clearing it first would remove the limit.
    fireEvent.change(max, { target: { value: "-3" } })
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Enter a whole number, 0 or more.")

    await user.type(setting("minLength"), "9")
    const minRow = setting("minLength").closest<HTMLElement>("[data-property-row]")!
    expect(within(minRow).getByRole("alert")).toHaveTextContent(
      "The minimum length is more than the maximum length.",
    )
    expect(screen.getByTestId("designer-undo")).toHaveAttribute("aria-disabled", "true")
  })

  it("edits the form's own name, description and gap when nothing is selected", async () => {
    const { user } = renderDesigner([field("a")])
    const name = screen.getByTestId("props-form-name")
    await user.clear(name)
    await user.type(name, "Contact")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Contact")

    await user.clear(name)
    expect(within(panel()).getByRole("alert")).toHaveTextContent("A form needs a name.")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Contact")

    await user.type(screen.getByTestId("props-form-description"), "Who to call.")
    expect(screen.getByTestId("props-setting-gap")).toBeInTheDocument()
  })

  it("warns when fewer columns hide components, which come back when they are restored", async () => {
    const { user } = renderDesigner([columns("row", { col1: [field("a")], col3: [field("c")] }, 3)])
    await user.click(row("row"))
    const count = setting("columns")
    await user.clear(count)
    await user.type(count, "2")
    expect(screen.getByTestId("props-warning-columns")).toHaveTextContent(
      "1 component is now hidden",
    )
    expect(row("c")).toHaveAttribute("data-hidden", "true")
    expect(screen.getByTestId("outline-problem-row")).toBeInTheDocument()

    await user.clear(count)
    await user.type(count, "3")
    expect(row("c")).not.toHaveAttribute("data-hidden")
  })
})

describe("appearance (spec 3.4)", () => {
  it("sets a theme colour on one slot, and resets it", async () => {
    const { user } = renderDesigner([field("a")])
    await user.click(row("a"))
    await user.click(screen.getByTestId("props-slot-control"))
    await user.click(screen.getByTestId("props-style-control-background"))
    await user.click(await screen.findByTestId("props-token-muted"))

    const control = within(screen.getByTestId("designer-canvas")).getByTestId("field-a-control")
    expect(control.style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(live()).toBe("Background of control of a: the muted colour.")

    await user.click(screen.getByTestId("props-style-reset-control-background"))
    expect(control.style.backgroundColor).toBe("")
  })

  it("points at the slot on the canvas while it is hovered in the panel", async () => {
    const { user } = renderDesigner([field("a")])
    await user.click(row("a"))
    await user.hover(screen.getByTestId("props-slot-label"))
    expect(screen.getAllByTestId("canvas-slot-highlight").length).toBeGreaterThan(0)
    await user.unhover(screen.getByTestId("props-slot-section-label"))
    expect(screen.queryByTestId("canvas-slot-highlight")).not.toBeInTheDocument()
  })
})

describe("problems (spec 3.5)", () => {
  it("marks an instance with problems in the outline, explains each, and offers a fix that works", async () => {
    const { user } = renderDesigner([
      { ...field("a"), settings: { maxLength: -3 } },
      { id: "c_u", type: "rating", name: "stars" },
    ])
    expect(screen.getByTestId("outline-problem-a")).toBeInTheDocument()
    expect(screen.getByTestId("outline-problem-stars")).toBeInTheDocument()

    await user.click(row("stars"))
    expect(screen.getByTestId("props-problems")).toHaveTextContent("no component of type “rating”")

    await user.click(row("a"))
    expect(screen.getByTestId("props-problems")).toHaveTextContent(
      "Maximum length: -3 is not a valid maximum length",
    )
    fireEvent.click(screen.getByTestId("props-problem-fix-0"))
    expect(screen.queryByTestId("props-problems")).not.toBeInTheDocument()
    expect(screen.queryByTestId("outline-problem-a")).not.toBeInTheDocument()
  })
})

describe("the toolbox is one Tab stop (spec 5)", () => {
  it("moves between items with the arrow keys and adds the focused one with Enter", async () => {
    const { user } = renderDesigner()
    const items = within(screen.getByTestId("designer-toolbox")).getAllByRole("button")
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1)

    items[0].focus()
    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(items[2]).toHaveFocus()
    expect(items[2]).toHaveAttribute("tabindex", "0")
    await user.keyboard("{End}")
    expect(items.at(-1)).toHaveFocus()
    await user.keyboard("{Home}{Enter}")
    expect(row("textField1")).toBeInTheDocument()
  })

  it("has a live region with the status role", () => {
    renderDesigner()
    expect(screen.getByTestId("designer-live")).toHaveAttribute("role", "status")
  })
})
