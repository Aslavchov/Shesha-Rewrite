import { screen } from "@testing-library/react"
import { BoxIcon, BugIcon, RotateCcwIcon, ScanEyeIcon } from "lucide-react"
import { describe, expect, it } from "vitest"

import { expectConsoleProblems } from "@/test/console"

import { textField } from "../components/text-field"
import { ReadOnlyField } from "../parts/read-only"
import {
  fieldError,
  fieldRoot,
  formDocument,
  instance,
  renderDocument,
  renderForm,
} from "../testing/render-form"
import {
  type ContainerProps,
  createRegistry,
  defineContainer,
  defineInput,
  defineStatic,
  type InputEditProps,
  type InputReadOnlyProps,
  type StaticProps,
} from "."
import { buildModel } from "./model"
import { requiredSetting, required } from "./rules"
import { text } from "./settings"

// --- Test components -------------------------------------------------------

const boxSettings = {}
const boxSlots = ["root"] as const

/** A minimal container with one region, `content`. */
function Box({ slots, region }: ContainerProps<typeof boxSettings, "root">) {
  return <div {...slots.root}>{region("content")}</div>
}

const box = defineContainer({
  type: "box",
  displayName: "Box",
  description: "Holds other components.",
  category: "layout",
  icon: BoxIcon,
  settings: boxSettings,
  regions: () => ["content"],
  slots: boxSlots,
  Render: Box,
})

const probeSettings = { label: text({ label: "Label", group: "general", default: "Probe" }) }
const probeSlots = ["root"] as const
type ProbeSlot = (typeof probeSlots)[number]

/** How many times each probe field has rendered, by instance name. */
const renders = new Map<string, number>()

/** A text input that counts its own renders. */
function ProbeEdit({
  instance: { name },
  settings,
  slots,
  field,
}: InputEditProps<"text", typeof probeSettings, ProbeSlot>) {
  renders.set(name, (renders.get(name) ?? 0) + 1)
  return (
    <label {...slots.root}>
      {settings.label}
      <input
        id={field.id}
        value={field.value ?? ""}
        onChange={(event) => field.setValue(event.target.value)}
        onBlur={field.leave}
      />
    </label>
  )
}

function ProbeReadOnly({
  instance: { name },
  settings,
  slots,
  value,
}: InputReadOnlyProps<"text", typeof probeSettings, ProbeSlot>) {
  return (
    <ReadOnlyField name={name} label={settings.label} slots={{ ...slots, label: {} }}>
      {value}
    </ReadOnlyField>
  )
}

const probe = defineInput({
  type: "probe",
  displayName: "Probe",
  description: "Counts its renders.",
  category: "input",
  icon: ScanEyeIcon,
  valueType: "text",
  settings: probeSettings,
  defaultValue: () => null,
  rules: [],
  slots: probeSlots,
  Edit: ProbeEdit,
  ReadOnly: ProbeReadOnly,
})

const faultySettings = { required: requiredSetting }

function Faulty(): never {
  throw new Error("faulty component failed on purpose")
}

/** A required input whose renderers always throw. */
const faulty = defineInput({
  type: "faulty",
  displayName: "Faulty",
  description: "Throws while rendering.",
  category: "input",
  icon: BugIcon,
  valueType: "text",
  settings: faultySettings,
  defaultValue: () => null,
  rules: [required],
  slots: ["root"],
  Edit: Faulty,
  ReadOnly: Faulty,
})

const resetSettings = {}

/** What a Reset button does, without depending on the Button component. */
function ResetProbe({ slots, form }: StaticProps<typeof resetSettings, "root">) {
  return (
    <button type="button" onClick={form.reset} {...slots.root}>
      Reset
    </button>
  )
}

const resetProbe = defineStatic({
  type: "reset-probe",
  displayName: "Reset probe",
  description: "Resets the form.",
  category: "action",
  icon: RotateCcwIcon,
  settings: resetSettings,
  slots: ["root"],
  Edit: ResetProbe,
  ReadOnly: () => null,
})

// --- Tests -----------------------------------------------------------------

describe("C1-17 render isolation", () => {
  it("typing in one field does not re-render the others", async () => {
    renders.clear()
    const names = ["one", "two", "three", "four", "five"]
    const { user } = renderForm(
      [
        instance("probe", "one", { label: "One" }),
        instance(
          "box",
          "group",
          {},
          {
            bind: null,
            regions: { content: [instance("probe", "two"), instance("probe", "three")] },
          },
        ),
        instance("probe", "four"),
        instance("probe", "five"),
      ],
      [probe, box],
    )
    const afterMount = new Map(renders)
    expect([...afterMount.keys()].sort()).toEqual([...names].sort())

    await user.type(screen.getByRole("textbox", { name: "One" }), "hello")
    await user.tab()

    // The typed field rendered once per keystroke; nothing else rendered at all.
    expect(renders.get("one")).toBe((afterMount.get("one") ?? 0) + "hello".length)
    for (const name of names.filter((candidate) => candidate !== "one")) {
      expect(renders.get(name), name).toBe(afterMount.get(name))
    }
  })

  it("a failed submit re-renders only the fields whose error changed", async () => {
    renders.clear()
    const { submit } = renderForm(
      [
        instance("probe", "plain"),
        instance("text-field", "needed", { required: true }),
        instance("probe", "other"),
      ],
      [probe, textField],
    )
    const afterMount = new Map(renders)

    submit()

    expect(fieldError("needed")).not.toBeNull()
    expect(renders).toEqual(afterMount)
  })
})

describe("C1-16 resilience", () => {
  it("an unknown component type shows a placeholder naming the type; the rest works", async () => {
    const { user, submit, submitted } = renderForm(
      [
        instance("text-field", "before", { label: "Before" }),
        instance("hologram", "mystery"),
        instance("text-field", "after", { label: "After" }),
      ],
      [textField],
    )

    const placeholder = screen.getByTestId("component-unknown")
    expect(placeholder).toHaveTextContent("hologram")
    expect(placeholder).toHaveTextContent("mystery")
    expect(placeholder).toHaveAttribute("data-component-type", "hologram")

    await user.type(screen.getByRole("textbox", { name: "Before" }), "a")
    await user.type(screen.getByRole("textbox", { name: "After" }), "b")
    submit()
    expect(submitted()).toEqual({ before: "a", after: "b" })
  })

  it("an invalid setting value falls back to that setting's default", () => {
    renderForm(
      [instance("text-field", "title", { label: ["not", "text"], placeholder: 12, required: 1 })],
      [textField],
    )

    const input = screen.getByRole("textbox", { name: "Text field" })
    expect(input).not.toHaveAttribute("placeholder")
    expect(input).not.toHaveAttribute("aria-required")
  })

  it("a component that throws shows an error placeholder in its place; the rest works", async () => {
    // The only test allowed to see the error report its component triggers.
    const reported = expectConsoleProblems()
    const { user, submit, submitted } = renderForm(
      [
        instance("text-field", "before", { label: "Before" }),
        instance("faulty", "broken", { required: true }),
        instance("text-field", "after", { label: "After", required: true }),
      ],
      [textField, faulty],
    )

    const placeholder = screen.getByTestId("component-error")
    expect(placeholder).toHaveTextContent("broken")
    expect(placeholder).toHaveAttribute("data-component-name", "broken")
    expect(reported.join("\n")).toContain("faulty component failed on purpose")

    // The fields around it still validate, take input and submit. The broken
    // field is required, but it is not on screen, so it does not block.
    submit()
    expect(fieldError("after")).toHaveTextContent("This field is required")
    expect(screen.getByRole("textbox", { name: "After" })).toHaveFocus()

    await user.type(screen.getByRole("textbox", { name: "Before" }), "a")
    await user.type(screen.getByRole("textbox", { name: "After" }), "b")
    submit()
    expect(submitted()).toEqual({ before: "a", broken: null, after: "b" })
  })

  it("all three at once leave the rest of the form working", async () => {
    expectConsoleProblems()
    const { user, submit, submitted } = renderForm(
      [
        instance("hologram", "mystery"),
        instance("text-field", "title", { label: 5, maxLength: "long" }),
        instance("faulty", "broken"),
        instance("text-field", "notes", { label: "Notes" }),
      ],
      [textField, faulty],
    )

    expect(screen.getByTestId("component-unknown")).toBeVisible()
    expect(screen.getByTestId("component-error")).toBeVisible()
    await user.type(screen.getByRole("textbox", { name: "Text field" }), "kept")
    await user.type(screen.getByRole("textbox", { name: "Notes" }), "also kept")
    submit()

    expect(submitted()).toEqual({ title: "kept", broken: null, notes: "also kept" })
  })

  it("the children of an unknown container are neither shown nor validated", () => {
    const { submit, onSubmit } = renderForm(
      [
        instance(
          "accordion",
          "sections",
          {},
          {
            bind: null,
            regions: { panel: [instance("text-field", "hidden", { required: true })] },
          },
        ),
        instance("text-field", "shown", { label: "Shown" }),
      ],
      [textField],
    )

    expect(screen.getByTestId("component-unknown")).toHaveTextContent("accordion")
    expect(screen.queryByTestId("field-hidden")).toBeNull()

    submit()
    expect(onSubmit).toHaveBeenCalledWith({ shown: null })
  })

  it("an input with no data path shows an error placeholder", () => {
    renderForm(
      [instance("text-field", "lost", {}, { bind: null }), instance("text-field", "found")],
      [textField],
    )

    expect(screen.getByTestId("component-error")).toHaveTextContent("data path")
    expect(fieldRoot("found")).toBeVisible()
  })
})

describe("format version (D1)", () => {
  it("shows a clear message instead of rendering a version this build does not know", () => {
    const future = { ...formDocument([instance("text-field", "title")]), formatVersion: 2 }
    const { setMode } = renderDocument(future, [textField])

    const message = screen.getByTestId("form-unsupported-version")
    expect(message).toHaveTextContent("format version 2")
    expect(message).toHaveTextContent("reads format version 1")
    expect(screen.queryByTestId("form")).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()

    setMode("read-only")
    expect(screen.getByTestId("form-unsupported-version")).toBeVisible()
  })

  it("does not read the rest of such a document", () => {
    // A future format need not have `components` at all.
    const future = JSON.parse('{ "formatVersion": 7, "name": "Later", "tree": {} }')

    renderDocument(future, [textField])

    expect(screen.getByTestId("form-unsupported-version")).toHaveTextContent("format version 7")
  })
})

describe("submit and reset", () => {
  it("moves focus to the first invalid field in visual order, however deep it is", () => {
    const { submit, onSubmit } = renderForm(
      [
        instance("text-field", "optional", { label: "Optional" }),
        instance(
          "box",
          "outer",
          {},
          {
            bind: null,
            regions: {
              content: [
                instance(
                  "box",
                  "inner",
                  {},
                  {
                    bind: null,
                    regions: {
                      content: [instance("text-field", "deep", { label: "Deep", required: true })],
                    },
                  },
                ),
              ],
            },
          },
        ),
        instance("text-field", "last", { label: "Last", required: true }),
      ],
      [textField, box],
    )

    submit()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(fieldError("deep")).not.toBeNull()
    expect(fieldError("last")).not.toBeNull()
    expect(fieldError("optional")).toBeNull()
    expect(screen.getByRole("textbox", { name: "Deep" })).toHaveFocus()
  })

  it("hands the host the values nested by data path", async () => {
    const { user, submit, submitted } = renderForm(
      [
        instance("text-field", "first", { label: "First" }, { bind: "person.name.first" }),
        instance("text-field", "city", { label: "City" }, { bind: "person.city" }),
        instance("text-field", "note", { label: "Note" }),
      ],
      [textField],
    )

    await user.type(screen.getByRole("textbox", { name: "First" }), "Ada")
    submit()

    expect(submitted()).toEqual({ person: { name: { first: "Ada" }, city: null }, note: null })
  })

  it("reset returns every value to its default, clears every error and tells the host", async () => {
    const { user, submit, onReset, setMode } = renderForm(
      [
        instance("text-field", "kept", { label: "Kept", defaultValue: "start" }),
        instance("text-field", "needed", { label: "Needed", required: true }),
        instance("reset-probe", "reset", {}, { bind: null }),
      ],
      [textField, resetProbe],
    )
    await user.clear(screen.getByRole("textbox", { name: "Kept" }))
    await user.type(screen.getByRole("textbox", { name: "Kept" }), "changed")
    submit()
    expect(fieldError("needed")).not.toBeNull()

    await user.click(screen.getByRole("button", { name: "Reset" }))

    expect(screen.getByRole("textbox", { name: "Kept" })).toHaveValue("start")
    expect(screen.getByRole("textbox", { name: "Needed" })).toHaveValue("")
    expect(fieldError("needed")).toBeNull()
    expect(onReset).toHaveBeenCalledTimes(1)

    // A static component's read-only renderer is used in read-only mode.
    setMode("read-only")
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()
  })

  it("keeps values when switching to read-only and back", async () => {
    const { user, setMode } = renderForm([instance("probe", "one", { label: "One" })], [probe])
    await user.type(screen.getByRole("textbox", { name: "One" }), "kept")

    setMode("read-only")
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByTestId("form")).toHaveAttribute("data-mode", "read-only")
    expect(screen.getByTestId("field-one-value")).toHaveTextContent("kept")

    setMode("edit")
    expect(screen.getByRole("textbox", { name: "One" })).toHaveValue("kept")
  })
})

describe("layout", () => {
  it("spaces top-level components by the form's gap setting, defaulting to medium", () => {
    renderForm([instance("probe", "one")], [probe])
    expect(screen.getByTestId("form")).toHaveClass("flex", "flex-col", "gap-(--sys-space-md)")
  })

  it("renders regions in document order", () => {
    renderForm(
      [
        instance("probe", "a"),
        instance(
          "box",
          "group",
          {},
          {
            bind: null,
            regions: { content: [instance("probe", "b"), instance("probe", "c")] },
          },
        ),
        instance("probe", "d"),
      ],
      [probe, box],
    )

    const order = [...screen.getByTestId("form").querySelectorAll("[data-testid^=field-]")].map(
      (element) => element.getAttribute("data-testid"),
    )
    expect(order).toEqual(["field-a", "field-group", "field-b", "field-c", "field-d"])
    expect(fieldRoot("group")).toContainElement(fieldRoot("b"))
  })
})

describe("buildModel", () => {
  const registry = createRegistry([textField, box])

  it("records every problem with its path and still builds the rest", () => {
    const model = buildModel(
      formDocument(
        [
          instance("hologram", "mystery"),
          instance(
            "text-field",
            "title",
            { label: 5, colour: "red" },
            {
              styles: { label: { color: "red" }, popup: { color: "#000000" } },
            },
          ),
          instance(
            "box",
            "group",
            {},
            {
              bind: null,
              regions: {
                content: [instance("text-field", "inside", {}, { bind: null })],
                sidebar: [instance("text-field", "orphan")],
              },
            },
          ),
        ],
        { gap: "enormous" },
      ),
      registry,
    )

    expect(model.problems.map((problem) => problem.path)).toEqual([
      "settings.gap",
      "components[0].type",
      "components[1].settings.label",
      "components[1].settings.colour",
      "components[1].styles.label",
      "components[1].styles.popup",
      "components[2].regions.content[0].bind",
      "components[2].regions.sidebar",
    ])
    expect(model.gap).toBe("md")
    expect(model.nodes.map((node) => node.kind)).toEqual(["unknown", "component", "component"])
    expect(model.fields.map((field) => field.path)).toEqual(["title"])
  })

  it("lists fields in document order with their paths and defaults", () => {
    const model = buildModel(
      formDocument([
        instance(
          "box",
          "group",
          {},
          {
            bind: null,
            regions: { content: [instance("text-field", "a", {}, { bind: "x.a" })] },
          },
        ),
        instance("text-field", "b", { defaultValue: "hi" }),
      ]),
      registry,
    )

    expect(model.problems).toEqual([])
    expect(model.fields.map(({ id, path, defaultValue }) => ({ id, path, defaultValue }))).toEqual([
      { id: "c_a", path: "x.a", defaultValue: null },
      { id: "c_b", path: "b", defaultValue: "hi" },
    ])
  })

  it("reads the form's own gap setting", () => {
    expect(buildModel(formDocument([], { gap: "xl" }), registry).gap).toBe("xl")
  })
})

describe("registry and definitions", () => {
  it("refuses two definitions with one type id", () => {
    expect(() => createRegistry([textField, textField])).toThrow(/registered twice/)
  })

  it("requires a root slot", () => {
    expect(() =>
      defineContainer({
        type: "rootless",
        displayName: "Rootless",
        description: "Has no root slot.",
        category: "layout",
        icon: BoxIcon,
        settings: {},
        regions: () => [],
        slots: ["title"],
        Render: () => null,
      }),
    ).toThrow(/root/)
  })
})
