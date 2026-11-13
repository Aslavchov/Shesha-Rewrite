import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ComponentInstance } from "@/generated"

import { fieldRoot, fieldValue, instance, renderForm } from "../../testing/render-form"
import { button } from "../button"
import { textField } from "../text-field"
import { columns } from "."

const definitions = [textField, button, columns]

/** A columns instance. `regions` maps `col1`, `col2`, … to their children. */
function columnsInstance(
  name: string,
  settings: Record<string, unknown> = {},
  regions: Record<string, ComponentInstance[]> = {},
  extras = {},
) {
  return instance("columns", name, settings, { bind: null, regions, ...extras })
}

const field = (name: string, label = name) => instance("text-field", name, { label })
const submitButton = (name: string) => instance("button", name, {}, { bind: null })

/** The grid inside the root: the element that takes the column template. */
function gridOf(name: string): HTMLElement {
  const grid = fieldRoot(name).querySelector<HTMLElement>(":scope > [data-slot=columns-grid]")
  if (!grid) throw new Error(`Columns "${name}" has no grid.`)
  return grid
}

/** The column elements, left to right. */
const columnsOf = (name: string) => [...gridOf(name).children]

/** The column template the grid is given, through its one custom property. */
const templateOf = (name: string) => gridOf(name).style.getPropertyValue("--columns-template")

/** The classes on the grid that decide how many columns it has, and when. */
const columnClasses = (name: string) =>
  [...gridOf(name).classList].filter((item) => item.includes("grid-cols-")).sort()

const STACK_BELOW = ["sm", "md", "lg", "xl", "2xl"] as const

describe("columns: definition", () => {
  it("declares what the palette, the properties panel and the style editor need", () => {
    expect(columns.type).toBe("columns")
    expect(columns.displayName).toBe("Columns")
    expect(columns.description).not.toBe("")
    expect(columns.category).toBe("layout")
    expect(columns.kind).toBe("container")
    expect(columns.valueType).toBeNull()
    expect(columns.rules).toEqual([])
    expect(columns.slots).toEqual(["root"])
    expect(Object.keys(columns.settings)).toEqual(["columns", "widths", "gap", "stackBelow"])
    for (const setting of Object.values(columns.settings)) {
      expect(setting.label).not.toBe("")
      expect(setting.group).toBe("layout")
    }
  })

  it("has two equal columns with a medium gap that stack below the medium width", () => {
    const { columns: count, widths, gap, stackBelow } = columns.settings
    expect(count.default).toBe(2)
    expect(widths.default).toBeNull()
    expect(gap.default).toBe("md")
    expect(stackBelow.default).toBe("md")
  })

  it("offers Tailwind's container widths by name, labelled for people, and never", () => {
    expect(columns.settings.stackBelow.choices).toEqual([
      { value: "sm", label: "Small (384px)" },
      { value: "md", label: "Medium (448px)" },
      { value: "lg", label: "Large (512px)" },
      { value: "xl", label: "Extra large (576px)" },
      { value: "2xl", label: "Double extra large (672px)" },
      { value: "never", label: "Never stack" },
    ])
  })

  it.each([
    [2, ["col1", "col2"]],
    [3, ["col1", "col2", "col3"]],
    [4, ["col1", "col2", "col3", "col4"]],
  ])("has one region per column: %i columns", (count, regions) => {
    const prepared = columns.prepare(columnsInstance("row", { columns: count }))

    expect(prepared.regions).toEqual(regions)
    expect(prepared.field).toBeNull()
    expect(prepared.problems).toEqual([])
  })

  it("has two regions when the number of columns is not set", () => {
    expect(columns.prepare(columnsInstance("row")).regions).toEqual(["col1", "col2"])
  })
})

describe("columns: default render", () => {
  it("renders two equal columns, each holding its own children in order", () => {
    renderForm(
      [
        field("before"),
        columnsInstance(
          "row",
          {},
          { col1: [field("first"), field("second")], col2: [field("third")] },
        ),
        field("after"),
      ],
      definitions,
    )

    const [left, right, ...rest] = columnsOf("row")
    expect(rest).toEqual([])
    expect([...(left?.children ?? [])]).toEqual([fieldRoot("first"), fieldRoot("second")])
    expect([...(right?.children ?? [])]).toEqual([fieldRoot("third")])
    expect(templateOf("row")).toBe("minmax(0, 1fr) minmax(0, 1fr)")

    const order = [...screen.getByTestId("form").querySelectorAll("[data-testid^=field-]")].map(
      (element) => element.getAttribute("data-testid"),
    )
    expect(order).toEqual([
      "field-before",
      "field-row",
      "field-first",
      "field-second",
      "field-third",
      "field-after",
    ])
  })

  it("answers to its own width: the root is the query container of the grid", () => {
    renderForm(
      [columnsInstance("row", {}, { col1: [field("a")], col2: [field("b")] })],
      definitions,
    )

    const root = fieldRoot("row")
    expect(root).toHaveClass("@container")
    expect(root).not.toHaveAttribute("style")
    expect([...root.children]).toEqual([gridOf("row")])
    expect(gridOf("row")).toHaveClass("grid", "gap-(--sys-space-md)")
    // One column until the root is at least the medium container width.
    expect(columnClasses("row")).toEqual(["@md:grid-cols-(--columns-template)", "grid-cols-1"])
  })

  it("lays each column's children out as a stack that cannot widen the grid", () => {
    renderForm(
      [columnsInstance("row", {}, { col1: [field("a")], col2: [field("b")] })],
      definitions,
    )

    for (const column of columnsOf("row")) {
      expect(column).toHaveAttribute("data-slot", "columns-column")
      expect(column).toHaveClass("flex", "flex-col", "min-w-0", "gap-(--sys-space-md)")
      expect(column).not.toHaveAttribute("style")
    }
  })

  it("keeps a column that has no children, so the others stay in their place", () => {
    renderForm([columnsInstance("row", {}, { col2: [field("b")] })], definitions)

    const [left, right] = columnsOf("row")
    expect(left).toBeEmptyDOMElement()
    expect(right).toContainElement(fieldRoot("b"))
  })

  it.each([3, 4])("renders %i columns", (count) => {
    renderForm(
      [
        columnsInstance(
          "row",
          { columns: count },
          { col1: [field("a")], col2: [field("b")], col3: [field("c")], col4: [field("d")] },
        ),
      ],
      definitions,
    )

    const names = ["a", "b", "c", "d"].slice(0, count)
    expect(columnsOf("row").map((column) => [...column.children])).toEqual(
      names.map((name) => [fieldRoot(name)]),
    )
    expect(templateOf("row")).toBe(names.map(() => "minmax(0, 1fr)").join(" "))
  })
})

describe("columns: widths", () => {
  it("shares the width by the proportions given", () => {
    renderForm(
      [
        columnsInstance("pair", { widths: [1, 2] }),
        columnsInstance("three", { columns: 3, widths: [2, 1, 3] }),
      ],
      definitions,
    )

    expect(templateOf("pair")).toBe("minmax(0, 1fr) minmax(0, 2fr)")
    expect(templateOf("three")).toBe("minmax(0, 2fr) minmax(0, 1fr) minmax(0, 3fr)")
  })

  it("passes the template through one custom property and nothing else", () => {
    renderForm([columnsInstance("pair", { widths: [3, 1] })], definitions)

    const { style } = gridOf("pair")
    expect([...style]).toEqual(["--columns-template"])
    expect(columnClasses("pair")).toContain("@md:grid-cols-(--columns-template)")
  })

  it.each([
    ["too few", { columns: 3, widths: [1, 2] }],
    ["too many", { columns: 2, widths: [1, 2, 1] }],
  ])("uses equal columns when the proportions do not match the count: %s", (_case, settings) => {
    renderForm([columnsInstance("row", settings)], definitions)

    const expected = Array.from({ length: settings.columns }, () => "minmax(0, 1fr)").join(" ")
    expect(templateOf("row")).toBe(expected)
    expect(columnsOf("row")).toHaveLength(settings.columns)
  })
})

describe("columns: stack below", () => {
  it.each(STACK_BELOW)(
    "stacks below the %s container width, side by side from it",
    (stackBelow) => {
      renderForm([columnsInstance("row", { stackBelow })], definitions)

      expect(columnClasses("row")).toEqual([
        `@${stackBelow}:grid-cols-(--columns-template)`,
        "grid-cols-1",
      ])
    },
  )

  it("never: always side by side, at any width", () => {
    renderForm([columnsInstance("row", { stackBelow: "never", widths: [1, 3] })], definitions)

    expect(columnClasses("row")).toEqual(["grid-cols-(--columns-template)"])
    expect(templateOf("row")).toBe("minmax(0, 1fr) minmax(0, 3fr)")
    for (const element of [gridOf("row"), ...columnsOf("row")]) {
      // Nothing on the grid or its columns depends on a width.
      expect(element.className).not.toMatch(/(^|\s)@/)
    }
  })

  it("uses the same gap between stacked columns as between side-by-side ones", () => {
    renderForm([columnsInstance("row", { gap: "lg" })], definitions)

    // One `gap` on the grid covers both axes: column gap side by side, row gap stacked.
    const gaps = [...gridOf("row").classList].filter((item) => item.includes("gap-"))
    expect(gaps).toEqual(["gap-(--sys-space-lg)"])
  })
})

describe("columns: gap", () => {
  it.each(["none", "xs", "sm", "md", "lg", "xl"])(
    "spaces the columns, and the children in each, by the %s step",
    (gap) => {
      renderForm(
        [columnsInstance("row", { gap }, { col1: [field("a")], col2: [field("b")] })],
        definitions,
      )

      for (const element of [gridOf("row"), ...columnsOf("row")]) {
        const gaps = [...element.classList].filter((item) => item.startsWith("gap-"))
        expect(gaps).toEqual([`gap-(--sys-space-${gap})`])
      }
    },
  )
})

describe("columns: invalid settings", () => {
  it.each([1, 5, 0, -2, 2.5, "3", null])(
    "a number of columns outside 2 to 4 falls back to two: %j",
    (count) => {
      const row = columnsInstance(
        "row",
        { columns: count },
        { col1: [field("a")], col2: [field("b")], col3: [field("c")] },
      )
      renderForm([row], definitions)

      expect(columnsOf("row")).toHaveLength(2)
      expect(templateOf("row")).toBe("minmax(0, 1fr) minmax(0, 1fr)")
      expect(screen.queryByTestId("field-c")).toBeNull()
      expect(columns.prepare(row).regions).toEqual(["col1", "col2"])
    },
  )

  it.each([[[1, 0]], [[1.5, 2]], [["1", "2"]], [[]], ["1 2"], [{ col1: 1 }]])(
    "proportions that are not whole numbers of at least 1 give equal columns: %j",
    (widths) => {
      renderForm([columnsInstance("row", { widths })], definitions)

      expect(templateOf("row")).toBe("minmax(0, 1fr) minmax(0, 1fr)")
    },
  )

  it("an unknown gap or stacking width falls back to medium", () => {
    renderForm([columnsInstance("row", { gap: "huge", stackBelow: "tablet" })], definitions)

    expect(gridOf("row")).toHaveClass("gap-(--sys-space-md)")
    expect(columnClasses("row")).toEqual(["@md:grid-cols-(--columns-template)", "grid-cols-1"])
  })
})

describe("columns: regions beyond the count", () => {
  it("does not render, validate or submit children stored in a column it no longer has", () => {
    const { submit, onSubmit } = renderForm(
      [
        columnsInstance(
          "row",
          { columns: 2 },
          {
            col1: [field("a")],
            col2: [field("b")],
            col3: [instance("text-field", "orphan", { label: "Orphan", required: true })],
          },
        ),
      ],
      definitions,
    )

    expect(columnsOf("row")).toHaveLength(2)
    expect(screen.queryByTestId("field-orphan")).toBeNull()
    expect(screen.queryByRole("textbox", { name: "Orphan" })).toBeNull()

    submit()
    expect(onSubmit).toHaveBeenCalledWith({ a: null, b: null })
  })

  it("shows them again when the count is raised", () => {
    renderForm(
      [
        columnsInstance(
          "row",
          { columns: 3 },
          { col1: [field("a")], col2: [field("b")], col3: [field("c")] },
        ),
      ],
      definitions,
    )

    expect(columnsOf("row")[2]).toContainElement(fieldRoot("c"))
  })
})

describe("columns: style overrides", () => {
  it("apply to the root and reach neither the grid nor the columns", () => {
    renderForm(
      [
        columnsInstance(
          "row",
          { widths: [1, 2] },
          { col1: [field("a")], col2: [field("b")] },
          { styles: { root: { background: { token: "muted" }, padding: "lg", radius: "lg" } } },
        ),
      ],
      definitions,
    )

    const root = fieldRoot("row")
    expect(root.style.backgroundColor).toBe("var(--sys-color-muted)")
    expect(root.style.padding).toBe("var(--sys-space-lg)")
    expect(root.style.borderRadius).toBe("var(--sys-radius-lg)")
    expect(root.style.getPropertyValue("--columns-template")).toBe("")
    expect([...gridOf("row").style]).toEqual(["--columns-template"])
    for (const column of columnsOf("row")) expect(column).not.toHaveAttribute("style")
    expect(fieldRoot("a")).not.toHaveAttribute("style")
  })
})

describe("columns: read-only render", () => {
  it("arranges its children's read-only views in the same columns", async () => {
    const { user, setMode } = renderForm(
      [
        columnsInstance(
          "row",
          { widths: [2, 1] },
          { col1: [field("first", "First")], col2: [field("second", "Second")] },
        ),
      ],
      definitions,
    )
    await user.type(screen.getByRole("textbox", { name: "First" }), "kept")

    setMode("read-only")

    expect(screen.queryByRole("textbox")).toBeNull()
    expect(columnsOf("row").map((column) => [...column.children])).toEqual([
      [fieldRoot("first")],
      [fieldRoot("second")],
    ])
    expect(templateOf("row")).toBe("minmax(0, 2fr) minmax(0, 1fr)")
    expect(fieldValue("first")).toHaveTextContent("kept")
    expect(fieldValue("second")).toHaveTextContent("No value")
  })
})

describe("columns: nothing to show", () => {
  // jsdom applies no stylesheet, so these check what the collapse depends on:
  // the elements really are empty, and they carry the classes that hide them.

  it("a column with nothing in it takes no row while the columns are stacked", () => {
    renderForm(
      [
        columnsInstance("row", {}, { col1: [field("a")], col2: [submitButton("send")] }),
        columnsInstance("wide", { stackBelow: "xl" }),
        columnsInstance("fixed", { stackBelow: "never" }),
      ],
      definitions,
      { mode: "read-only" },
    )

    const [left, right] = columnsOf("row")
    expect(left).toContainElement(fieldRoot("a"))
    expect(right).toBeEmptyDOMElement()
    for (const column of columnsOf("row")) expect(column).toHaveClass("@max-md:empty:hidden")
    for (const column of columnsOf("wide")) expect(column).toHaveClass("@max-xl:empty:hidden")
    // Side by side, an empty column keeps its track.
    for (const column of columnsOf("fixed")) expect(column.className).not.toContain("hidden")
  })

  it("columns that hold only buttons leave nothing in read-only mode", () => {
    const { setMode } = renderForm(
      [
        columnsInstance(
          "actions",
          {},
          { col1: [submitButton("clear")], col2: [submitButton("send")] },
        ),
      ],
      definitions,
    )
    // Asked afresh each time: switching mode renders the form anew.
    const hasContent = () =>
      fieldRoot("actions").querySelector("[data-slot=columns-column]:not(:empty)") !== null
    const hiddenWhenEmpty = "not-has-[[data-slot=columns-column]:not(:empty)]:hidden"
    expect(screen.getAllByRole("button")).toHaveLength(2)
    expect(fieldRoot("actions")).toHaveClass(hiddenWhenEmpty)
    expect(hasContent()).toBe(true)

    setMode("read-only")

    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(fieldRoot("actions")).toHaveClass(hiddenWhenEmpty)
    expect(hasContent()).toBe(false)
  })
})

describe("columns: keyboard", () => {
  it("adds no stop of its own: Tab goes down each column in turn, in document order", async () => {
    const { user } = renderForm(
      [
        field("before", "Before"),
        columnsInstance(
          "row",
          { columns: 3 },
          {
            col1: [field("a", "A"), field("b", "B")],
            col2: [field("c", "C")],
            col3: [field("d", "D"), submitButton("send")],
          },
        ),
        field("after", "After"),
      ],
      definitions,
    )

    for (const name of ["Before", "A", "B", "C", "D"]) {
      await user.tab()
      expect(screen.getByRole("textbox", { name })).toHaveFocus()
    }
    await user.tab()
    expect(screen.getByRole("button", { name: "Button" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("textbox", { name: "After" })).toHaveFocus()
  })
})
