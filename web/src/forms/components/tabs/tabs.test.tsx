import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ComponentInstance } from "@/generated"

import { createRegistry, type DesignSurface, FormRenderer } from "../../runtime"
import { fieldError, formDocument, instance, renderForm } from "../../testing/render-form"
import { textField } from "../text-field"
import { tabs } from "."

const definitions = [textField, tabs]

const TABS = [
  { key: "personal", label: "Personal" },
  { key: "work", label: "Work" },
]

const field = (name: string, settings: Record<string, unknown> = {}) =>
  instance("text-field", name, { label: name, ...settings })

function tabsInstance(
  settings: Record<string, unknown> = {},
  regions: Record<string, ComponentInstance[]> = {},
) {
  return instance("tabs", "sections", { tabs: TABS, ...settings }, { bind: null, regions })
}

const tab = (name: string) => screen.getByRole("tab", { name })

describe("tabs: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(tabs.type).toBe("tabs")
    expect(tabs.displayName).toBe("Tabs")
    expect(tabs.description).not.toBe("")
    expect(tabs.category).toBe("layout")
    expect(tabs.kind).toBe("container")
    expect(tabs.slots).toEqual(["root", "list", "tab", "panel"])
    expect(Object.keys(tabs.settings)).toEqual(["tabs", "defaultTab", "gap"])
    expect(tabs.settings.tabs.kind).toBe("tabs")
  })

  it("keys each tab's region by the tab's key, never its label, and names it by the label", () => {
    const prepared = tabs.prepare(tabsInstance())
    expect(prepared.regions).toEqual(["personal", "work"])
    expect(prepared.regionLabel("work")).toBe("Work")
    const renamed = tabs.prepare(
      tabsInstance({ tabs: [{ key: "personal", label: "About you" }, TABS[1]] }),
    )
    expect(renamed.regions).toEqual(["personal", "work"])
    expect(renamed.regionLabel("personal")).toBe("About you")
  })

  it("has two tabs by default", () => {
    const prepared = tabs.prepare(instance("tabs", "sections", {}, { bind: null }))
    expect(prepared.regions).toEqual(["tab1", "tab2"])
  })

  it("refuses tabs with no tab, a repeated key or a key that is not a region name", () => {
    const { parse } = tabs.settings.tabs
    expect(parse([])).toBeUndefined()
    expect(parse([TABS[0], TABS[0]])).toBeUndefined()
    expect(parse([{ key: "1st", label: "First" }])).toBeUndefined()
    expect(parse([{ key: "a b", label: "First" }])).toBeUndefined()
    expect(parse([{ label: "First" }])).toBeUndefined()
    expect(parse(TABS)).toEqual(TABS)
  })

  it("offers the tabs as the choices for the default tab", () => {
    expect(tabs.settings.defaultTab.choicesFrom?.({ tabs: TABS })).toEqual([
      { value: "personal", label: "Personal" },
      { value: "work", label: "Work" },
    ])
  })
})

describe("tabs: render", () => {
  it("shows the first tab's region, and switches when another tab is chosen", async () => {
    const { user } = renderForm(
      [tabsInstance({}, { personal: [field("first")], work: [field("employer")] })],
      definitions,
    )
    expect(tab("Personal")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("textbox", { name: "first" })).toBeVisible()
    expect(screen.queryByRole("textbox", { name: "employer" })).toBeNull()

    await user.click(tab("Work"))
    expect(tab("Work")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("textbox", { name: "employer" })).toBeVisible()
  })

  it("opens on its default tab", () => {
    renderForm([tabsInstance({ defaultTab: "work" })], definitions)
    expect(tab("Work")).toHaveAttribute("aria-selected", "true")
  })

  it("ignores a default tab that is not one of its tabs", () => {
    renderForm([tabsInstance({ defaultTab: "gone" })], definitions)
    expect(tab("Personal")).toHaveAttribute("aria-selected", "true")
  })

  it("is reached with Tab and switched with the arrow keys", async () => {
    const { user } = renderForm([tabsInstance()], definitions)
    await user.tab()
    expect(tab("Personal")).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(tab("Work")).toHaveFocus()
  })

  it("marks each tab as a switch to its region, for the designer", () => {
    renderForm([tabsInstance()], definitions)
    expect(tab("Work")).toHaveAttribute("data-region-switch", "work")
  })

  it("validates the fields of a tab that is not shown, and shows that tab to focus the first invalid one", async () => {
    const { submit, onSubmit } = renderForm(
      [
        tabsInstance(
          {},
          { personal: [field("first")], work: [field("employer", { required: true })] },
        ),
      ],
      definitions,
    )
    submit()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(tab("Work")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("textbox", { name: "employer" })).toHaveFocus()
    expect(fieldError("employer")).toHaveTextContent("This field is required")
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderForm(
      [
        instance(
          "tabs",
          "sections",
          { tabs: TABS },
          { bind: null, styles: { tab: { fontWeight: "semibold" } } },
        ),
      ],
      definitions,
    )
    expect(tab("Work").style.fontWeight).toBe("var(--sys-font-weight-semibold)")
    expect(screen.getByRole("tablist")).not.toHaveAttribute("style")
  })
})

describe("tabs: in the designer", () => {
  it("shows the region the designer asks for", () => {
    const surface: DesignSurface = {
      Instance: ({ children }) => children,
      Region: ({ children }) => children,
      shownRegion: () => "work",
    }
    render(
      <FormRenderer
        document={formDocument([tabsInstance({}, { work: [field("employer")] })])}
        registry={createRegistry(definitions)}
        mode="edit"
        design={surface}
      />,
    )
    expect(tab("Work")).toHaveAttribute("aria-selected", "true")
  })
})
