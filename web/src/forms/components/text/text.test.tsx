import { cleanup, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldRoot, instance, renderForm } from "../../testing/render-form"
import { text } from "."

const definitions = [text]

const renderText = (settings: Record<string, unknown> = {}, extras = {}, mode?: "read-only") =>
  renderForm([instance("text", "intro", settings, { bind: null, ...extras })], definitions, {
    mode,
  })

describe("text: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(text.type).toBe("text")
    expect(text.displayName).toBe("Text")
    expect(text.description).not.toBe("")
    expect(text.category).toBe("content")
    expect(text.kind).toBe("static")
    expect(text.slots).toEqual(["root"])
    expect(Object.keys(text.settings)).toEqual(["text", "variant", "alignment"])
    expect(text.settings.text.multiline).toBe(true)
    expect(text.settings.variant.choices?.map((choice) => choice.value)).toEqual([
      "heading2",
      "heading3",
      "heading4",
      "paragraph",
      "muted",
    ])
  })
})

describe("text: render", () => {
  it("shows a paragraph by default", () => {
    renderText()
    expect(fieldRoot("intro").tagName).toBe("P")
    expect(fieldRoot("intro")).toHaveTextContent("Text")
  })

  it("renders each heading level as that level", () => {
    for (const [variant, level] of [
      ["heading2", 2],
      ["heading3", 3],
      ["heading4", 4],
    ] as const) {
      renderForm(
        [instance("text", "title", { text: "Personal details", variant }, { bind: null })],
        definitions,
      )
      expect(screen.getByRole("heading", { level, name: "Personal details" })).toBeInTheDocument()
      cleanup()
    }
  })

  it("mutes the muted variant", () => {
    renderText({ variant: "muted", text: "Optional" })
    expect(fieldRoot("intro").tagName).toBe("P")
    expect(fieldRoot("intro").className).toContain("text-muted-foreground")
  })

  it("aligns its text", () => {
    renderText({ alignment: "center" })
    expect(fieldRoot("intro").className).toContain("text-center")
  })

  it("keeps line breaks", () => {
    renderText({ text: "One\nTwo" })
    expect(fieldRoot("intro").className).toContain("whitespace-pre-line")
    expect(fieldRoot("intro").textContent).toBe("One\nTwo")
  })

  it("is shown the same way in read-only mode", () => {
    renderText({ text: "Read me", variant: "heading3" }, {}, "read-only")
    expect(screen.getByRole("heading", { level: 3, name: "Read me" })).toBeInTheDocument()
  })

  it("applies style overrides to its root", () => {
    renderText({}, { styles: { root: { color: { token: "primary" }, fontWeight: "semibold" } } })
    expect(fieldRoot("intro").style.color).toBe("var(--sys-color-primary)")
    expect(fieldRoot("intro").style.fontWeight).toBe("var(--sys-font-weight-semibold)")
  })

  it("an invalid setting value falls back to that setting's default", () => {
    renderText({ text: 7, variant: "huge" })
    expect(fieldRoot("intro").tagName).toBe("P")
    expect(fieldRoot("intro")).toHaveTextContent("Text")
  })
})
