import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ComponentInstance } from "@/generated"

import { fieldRoot, instance, instanceOrder, renderForm } from "../../testing/render-form"
import { textField } from "../text-field"
import { card } from "."

const definitions = [textField, card]

const field = (name: string) => instance("text-field", name, { label: name })

function renderCard(
  settings: Record<string, unknown> = {},
  children: ComponentInstance[] = [],
  extras = {},
) {
  return renderForm(
    [
      instance("card", "details", settings, {
        bind: null,
        regions: { content: children },
        ...extras,
      }),
    ],
    definitions,
  )
}

const part = (slot: string) => fieldRoot("details").querySelector(`[data-form-slot=${slot}]`)

describe("card: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(card.type).toBe("card")
    expect(card.displayName).toBe("Card")
    expect(card.description).not.toBe("")
    expect(card.category).toBe("layout")
    expect(card.kind).toBe("container")
    expect(card.slots).toEqual(["root", "header", "title", "description", "content"])
    expect(Object.keys(card.settings)).toEqual(["title", "description", "gap"])
  })

  it("has one region, content", () => {
    expect(card.prepare(instance("card", "details", {}, { bind: null })).regions).toEqual([
      "content",
    ])
  })
})

describe("card: render", () => {
  it("is a group named by its title, with its children inside, in order", () => {
    renderCard({ title: "Your details" }, [field("first"), field("second")])
    const group = screen.getByRole("group", { name: "Your details" })
    expect(group).toBe(fieldRoot("details"))
    expect(part("content")).toContainElement(fieldRoot("first"))
    expect(instanceOrder()).toEqual(["field-details", "field-first", "field-second"])
  })

  it("shows the default title, and a description under it", () => {
    renderCard({ description: "As on your passport." })
    expect(part("title")).toHaveTextContent("Card")
    expect(part("description")).toHaveTextContent("As on your passport.")
  })

  it("has no header and is not a named group when its title is empty and it has no description", () => {
    renderCard({ title: "" }, [field("first")])
    expect(part("header")).toBeNull()
    expect(screen.queryByRole("group")).toBeNull()
  })

  it("puts its gap between its children", () => {
    renderCard({ gap: "lg" }, [field("first")])
    expect(part("content")?.className).toContain("gap-(--sys-space-lg)")
  })

  it("submits the values of the fields inside it", async () => {
    const { user, submit, submitted } = renderCard({}, [field("first")])
    await user.type(screen.getByRole("textbox", { name: "first" }), "Ada")
    submit()
    expect(submitted()).toEqual({ first: "Ada" })
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderCard({}, [], { styles: { header: { background: { token: "muted" } } } })
    expect((part("header") as HTMLElement).style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(fieldRoot("details")).not.toHaveAttribute("style")
  })
})
