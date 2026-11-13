import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ComponentInstance } from "@/generated"

import { fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { button } from "../button"
import { textField } from "../text-field"
import { container } from "."

const definitions = [textField, button, container]

/** A container instance holding `children` in its one region. */
function containerInstance(
  name: string,
  settings: Record<string, unknown> = {},
  children: ComponentInstance[] = [],
  extras = {},
) {
  return instance("container", name, settings, {
    bind: null,
    regions: { content: children },
    ...extras,
  })
}

const field = (name: string, label = name) => instance("text-field", name, { label })
const submitButton = (name: string) => instance("button", name, {}, { bind: null })

/** The test ids of every instance on screen, in document order. */
function renderedOrder() {
  return [...screen.getByTestId("form").querySelectorAll("[data-testid^=field-]")].map((element) =>
    element.getAttribute("data-testid"),
  )
}

/** The element that lays the children out: the root, or the box under the title. */
function contentOf(name: string): Element {
  const root = fieldRoot(name)
  return root.querySelector(":scope > [data-slot=container-content]") ?? root
}

describe("container: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(container.type).toBe("container")
    expect(container.displayName).toBe("Container")
    expect(container.description).not.toBe("")
    expect(container.category).toBe("layout")
    expect(container.kind).toBe("container")
    expect(container.valueType).toBeNull()
    expect(container.rules).toEqual([])
    expect(container.slots).toEqual(["root", "title"])
    expect(Object.keys(container.settings)).toEqual(["title", "direction", "gap"])
    for (const setting of Object.values(container.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).not.toBe("")
    }
  })

  it("has no title, is vertical and has a medium gap unless told otherwise", () => {
    const { title, direction, gap } = container.settings
    expect(title.default).toBeNull()
    expect(direction.choices?.map((choice) => choice.value)).toEqual(["vertical", "horizontal"])
    expect(direction.default).toBe("vertical")
    expect(gap.choices?.map((choice) => choice.value)).toEqual([
      "none",
      "xs",
      "sm",
      "md",
      "lg",
      "xl",
    ])
    expect(gap.default).toBe("md")
  })

  it("has one region, content, whatever its settings", () => {
    expect(container.prepare(containerInstance("group")).regions).toEqual(["content"])
    expect(
      container.prepare(containerInstance("group", { title: "Group", direction: "horizontal" }))
        .regions,
    ).toEqual(["content"])
  })
})

describe("container: default render", () => {
  it("lays its children out in order, in a column, with a medium gap", () => {
    renderForm(
      [
        field("before"),
        containerInstance("group", {}, [field("first"), field("second"), field("third")]),
        field("after"),
      ],
      definitions,
    )

    const root = fieldRoot("group")
    expect(renderedOrder()).toEqual([
      "field-before",
      "field-group",
      "field-first",
      "field-second",
      "field-third",
      "field-after",
    ])
    expect([...root.children]).toEqual([
      fieldRoot("first"),
      fieldRoot("second"),
      fieldRoot("third"),
    ])
    expect(root).toHaveClass("flex", "flex-col", "gap-(--sys-space-md)")
    expect(root.className).not.toMatch(/flex-row|flex-wrap|items-/)
    expect(root).not.toHaveAttribute("style")
  })

  it("without a title it is a plain element: no group, no legend", () => {
    renderForm([containerInstance("group", {}, [field("first")])], definitions)

    expect(fieldRoot("group").tagName).toBe("DIV")
    expect(screen.queryByRole("group")).toBeNull()
    expect(fieldRoot("group").querySelector("legend")).toBeNull()
  })

  it("renders with no children at all", () => {
    renderForm([instance("container", "group", {}, { bind: null })], definitions)

    expect(fieldRoot("group")).toBeEmptyDOMElement()
  })

  it("an invalid setting value falls back to that setting's default", () => {
    renderForm(
      [containerInstance("group", { title: 5, direction: "diagonal", gap: "huge" }, [field("a")])],
      definitions,
    )

    const root = fieldRoot("group")
    expect(screen.queryByRole("group")).toBeNull()
    expect(root).toHaveClass("flex", "flex-col", "gap-(--sys-space-md)")
    expect(root).toContainElement(fieldRoot("a"))
  })
})

describe("container: title", () => {
  it("renders a group named by its title", () => {
    renderForm(
      [containerInstance("prefs", { title: "Preferences" }, [field("first"), field("second")])],
      definitions,
    )

    const group = screen.getByRole("group", { name: "Preferences" })
    expect(group).toBe(fieldRoot("prefs"))
    expect(group.tagName).toBe("FIELDSET")
    const legend = group.querySelector("[data-slot=field-legend]")
    expect(legend?.tagName).toBe("LEGEND")
    expect(legend).toHaveTextContent("Preferences")
    // The legend names the fieldset only as its first child.
    expect(group.firstElementChild).toBe(legend)
  })

  it("lays the children out under the title, by the same settings", () => {
    renderForm(
      [
        containerInstance("prefs", { title: "Preferences", gap: "lg" }, [
          field("first"),
          field("second"),
        ]),
      ],
      definitions,
    )

    const content = contentOf("prefs")
    expect(content).not.toBe(fieldRoot("prefs"))
    expect([...content.children]).toEqual([fieldRoot("first"), fieldRoot("second")])
    expect(content).toHaveClass("flex", "flex-col", "gap-(--sys-space-lg)")
  })

  it("an empty title counts as no title", () => {
    renderForm([containerInstance("group", { title: "" }, [field("first")])], definitions)

    expect(screen.queryByRole("group")).toBeNull()
    expect(fieldRoot("group").tagName).toBe("DIV")
  })
})

describe("container: direction", () => {
  it.each([
    ["without a title", {}],
    ["with a title", { title: "Actions" }],
  ])("horizontal lays the children out in a row that wraps, %s", (_case, settings) => {
    renderForm(
      [
        containerInstance("row", { ...settings, direction: "horizontal" }, [
          field("first"),
          field("second"),
        ]),
      ],
      definitions,
    )

    const content = contentOf("row")
    expect([...content.children]).toEqual([fieldRoot("first"), fieldRoot("second")])
    // Children keep their own width and share a top edge.
    expect(content).toHaveClass("flex", "flex-row", "flex-wrap", "items-start")
    expect(content).not.toHaveClass("flex-col")
    expect(content).toHaveClass("gap-(--sys-space-md)")
  })

  it("vertical lets the children stretch to its width", () => {
    renderForm(
      [containerInstance("stack", { direction: "vertical" }, [field("first")])],
      definitions,
    )

    const content = contentOf("stack")
    expect(content).toHaveClass("flex-col")
    expect(content.className).not.toMatch(/\bitems-/)
  })
})

describe("container: gap", () => {
  it.each(["none", "xs", "sm", "md", "lg", "xl"])(
    "spaces its children by the %s step of the space scale",
    (gap) => {
      renderForm(
        [
          containerInstance("plain", { gap }, [field("a")]),
          containerInstance("titled", { gap, title: "Titled" }, [field("b")]),
        ],
        definitions,
      )

      for (const name of ["plain", "titled"]) {
        const gaps = [...contentOf(name).classList].filter((item) => item.startsWith("gap-"))
        expect(gaps, name).toEqual([`gap-(--sys-space-${gap})`])
      }
    },
  )
})

describe("container: style overrides", () => {
  it("apply to the root and the title, and to nothing else", () => {
    renderForm(
      [
        containerInstance("prefs", { title: "Preferences" }, [field("inside")], {
          styles: {
            root: { background: { token: "muted" }, padding: "lg", radius: "xl" },
            title: { color: "#003BB2", fontWeight: "semibold" },
          },
        }),
      ],
      definitions,
    )

    const root = fieldRoot("prefs")
    const legend = root.querySelector<HTMLElement>("[data-slot=field-legend]")
    expect(root.style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(root.style.padding).toBe("var(--sys-space-lg)")
    expect(root.style.borderRadius).toBe("var(--sys-radius-xl)")
    expect(root.style.color).toBe("")
    expect(legend).toHaveStyle({ color: "#003BB2" })
    expect(legend?.style.fontWeight).toBe("var(--sys-font-weight-semibold)")
    expect(legend?.style.padding).toBe("")
    expect(contentOf("prefs")).not.toHaveAttribute("style")
    expect(fieldRoot("inside")).not.toHaveAttribute("style")
  })

  it("apply to the root of a container with no title", () => {
    renderForm(
      [
        containerInstance("group", {}, [field("inside")], {
          styles: { root: { borderColor: { token: "border" }, padding: "md" } },
        }),
      ],
      definitions,
    )

    const root = fieldRoot("group")
    expect(root.style.borderColor).toBe("var(--sys-color-border)")
    expect(root.style.padding).toBe("var(--sys-space-md)")
    // The layout classes and the override sit on the same element.
    expect(root).toHaveClass("flex", "flex-col")
  })
})

describe("container: nesting", () => {
  it("holds containers in containers, to any depth, each with its own settings", async () => {
    const { user, submit, submitted } = renderForm(
      [
        containerInstance("outer", { title: "Outer", gap: "xl" }, [
          field("a", "A"),
          containerInstance("middle", { direction: "horizontal", gap: "sm" }, [
            field("b", "B"),
            containerInstance("inner", { title: "Inner" }, [field("c", "C")]),
          ]),
          field("d", "D"),
        ]),
      ],
      definitions,
    )

    expect(renderedOrder()).toEqual([
      "field-outer",
      "field-a",
      "field-middle",
      "field-b",
      "field-inner",
      "field-c",
      "field-d",
    ])
    expect([...contentOf("outer").children]).toEqual([
      fieldRoot("a"),
      fieldRoot("middle"),
      fieldRoot("d"),
    ])
    expect([...contentOf("middle").children]).toEqual([fieldRoot("b"), fieldRoot("inner")])
    expect(contentOf("outer")).toHaveClass("flex-col", "gap-(--sys-space-xl)")
    expect(contentOf("middle")).toHaveClass("flex-row", "gap-(--sys-space-sm)")
    expect(contentOf("inner")).toHaveClass("flex-col", "gap-(--sys-space-md)")
    expect(screen.getByRole("group", { name: "Inner" })).toContainElement(fieldRoot("c"))

    // Fields take part in the form however deep they sit.
    await user.type(screen.getByRole("textbox", { name: "C" }), "deep")
    submit()
    expect(submitted()).toEqual({ a: null, b: null, c: "deep", d: null })
  })
})

describe("container: read-only render", () => {
  it("arranges its children's read-only views the same way", async () => {
    const { user, setMode } = renderForm(
      [
        containerInstance("prefs", { title: "Preferences", gap: "sm" }, [
          field("first", "First"),
          field("second", "Second"),
        ]),
      ],
      definitions,
    )
    await user.type(screen.getByRole("textbox", { name: "First" }), "kept")

    setMode("read-only")

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByRole("group", { name: "Preferences" })).toBe(fieldRoot("prefs"))
    expect([...contentOf("prefs").children]).toEqual([fieldRoot("first"), fieldRoot("second")])
    expect(contentOf("prefs")).toHaveClass("flex-col", "gap-(--sys-space-sm)")
    expect(fieldValue("first")).toHaveTextContent("kept")
    expect(fieldValue("second")).toHaveTextContent("No value")
  })
})

describe("container: nothing to show", () => {
  // jsdom applies no stylesheet, so these check what the collapse depends on:
  // the element really is empty, and it carries the class that hides it then.

  it("a row of buttons leaves nothing in read-only mode: no box and no gap", () => {
    const { setMode } = renderForm(
      [
        field("title"),
        containerInstance("actions", { direction: "horizontal" }, [
          submitButton("send"),
          submitButton("clear"),
        ]),
      ],
      definitions,
    )
    const buttons = () => screen.queryAllByRole("button")
    expect(buttons()).toHaveLength(2)
    expect(fieldRoot("actions")).not.toBeEmptyDOMElement()

    setMode("read-only")

    expect(buttons()).toHaveLength(0)
    expect(fieldRoot("actions")).toBeEmptyDOMElement()
    expect(fieldRoot("actions")).toHaveClass("empty:hidden")
  })

  it("a titled container goes with its contents: a title over nothing is not shown", () => {
    renderForm(
      [containerInstance("actions", { title: "Actions" }, [submitButton("send")])],
      definitions,
      { mode: "read-only" },
    )

    const root = fieldRoot("actions")
    expect(contentOf("actions")).toBeEmptyDOMElement()
    expect(root).toHaveClass("has-[>[data-slot=container-content]:empty]:hidden")
    // The selector in that class matches this very structure.
    expect(root.querySelector(":scope > [data-slot=container-content]:empty")).not.toBeNull()
  })

  it("stays when at least one child has something to show", () => {
    renderForm(
      [
        containerInstance("plain", {}, [field("a"), submitButton("send")]),
        containerInstance("titled", { title: "Titled" }, [submitButton("clear"), field("b")]),
      ],
      definitions,
      { mode: "read-only" },
    )

    expect([...contentOf("plain").children]).toEqual([fieldRoot("a")])
    expect([...contentOf("titled").children]).toEqual([fieldRoot("b")])
    expect(
      fieldRoot("titled").querySelector(":scope > [data-slot=container-content]:empty"),
    ).toBeNull()
  })
})

describe("container: keyboard", () => {
  it("adds no stop of its own: Tab moves through the children in document order", async () => {
    const { user } = renderForm(
      [
        field("before", "Before"),
        containerInstance("row", { title: "Row", direction: "horizontal" }, [
          field("first", "First"),
          field("second", "Second"),
          submitButton("send"),
        ]),
        field("after", "After"),
      ],
      definitions,
    )

    for (const name of ["Before", "First", "Second"]) {
      await user.tab()
      expect(screen.getByRole("textbox", { name })).toHaveFocus()
    }
    await user.tab()
    expect(screen.getByRole("button", { name: "Button" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("textbox", { name: "After" })).toHaveFocus()
  })
})
