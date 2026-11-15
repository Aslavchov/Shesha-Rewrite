import { cleanup, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { fieldRoot, instance, renderForm } from "../../testing/render-form"
import { alert } from "."

const definitions = [alert]

const renderAlert = (settings: Record<string, unknown> = {}, extras = {}, mode?: "read-only") =>
  renderForm([instance("alert", "notice", settings, { bind: null, ...extras })], definitions, {
    mode,
  })

const part = (slot: string) => fieldRoot("notice").querySelector(`[data-form-slot=${slot}]`)

describe("alert: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(alert.type).toBe("alert")
    expect(alert.displayName).toBe("Alert")
    expect(alert.description).not.toBe("")
    expect(alert.category).toBe("content")
    expect(alert.kind).toBe("static")
    expect(alert.slots).toEqual(["root", "icon", "title", "description"])
    expect(Object.keys(alert.settings)).toEqual(["variant", "title", "description"])
    expect(alert.settings.variant.choices?.map((choice) => choice.value)).toEqual([
      "info",
      "success",
      "warning",
      "destructive",
    ])
  })
})

describe("alert: render", () => {
  it("shows an information note with its title and no description by default", () => {
    renderAlert()
    const root = screen.getByRole("note")
    expect(root).toBe(fieldRoot("notice"))
    expect(root).toHaveAttribute("data-variant", "info")
    expect(part("title")).toHaveTextContent("Alert")
    expect(part("description")).toBeNull()
    expect(part("icon")).toHaveAttribute("aria-hidden", "true")
  })

  it("is a note, not a live alert: it is there from the start", () => {
    renderAlert()
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("shows the variant, title and description it is given", () => {
    for (const variant of ["info", "success", "warning", "destructive"]) {
      renderAlert({ variant, title: "Saved", description: "All good." })
      expect(fieldRoot("notice")).toHaveAttribute("data-variant", variant)
      expect(part("title")).toHaveTextContent("Saved")
      expect(part("description")).toHaveTextContent("All good.")
      cleanup()
    }
  })

  it("is shown the same way in read-only mode", () => {
    renderAlert({ title: "Read me" }, {}, "read-only")
    expect(screen.getByRole("note")).toHaveTextContent("Read me")
  })

  it("applies style overrides to the slot they name and to no other", () => {
    renderAlert(
      { description: "Text" },
      { styles: { title: { color: "#003BB2" }, root: { radius: "none" } } },
    )
    expect(part("title")).toHaveStyle({ color: "#003BB2" })
    expect(fieldRoot("notice").style.borderRadius).toBe("var(--sys-radius-none)")
    expect(part("description")).not.toHaveAttribute("style")
  })

  it("an invalid setting value falls back to that setting's default", () => {
    renderAlert({ variant: "loud" })
    expect(fieldRoot("notice")).toHaveAttribute("data-variant", "info")
  })
})
