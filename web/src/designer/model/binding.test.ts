import { describe, expect, it } from "vitest"

import { PERSON } from "@/data/testing"
import type { ComponentInstance } from "@/generated"

import { field, form, schema, seededRandom } from "../testing/documents"
import { bindingProblemsOf } from "./binding"
import { createEditorState, runCommand } from "./editor"
import { checkDocument } from "./rules"

const property = (name: string) => PERSON.properties.find((candidate) => candidate.name === name)!

function problems(instance: ComponentInstance) {
  const node = schema.outline(form([instance])).byId.get(instance.id)!
  return bindingProblemsOf(node, PERSON, schema)
}

describe("binding problems (spec 5.1)", () => {
  it("are none in a form that is not bound", () => {
    const instance = field("nickname")
    const node = schema.outline(form([instance])).byId.get(instance.id)!
    expect(bindingProblemsOf(node, null, schema)).toEqual([])
  })

  it("are none for an input of the right kind bound to a property", () => {
    expect(problems({ ...field("surname") })).toEqual([])
    expect(
      problems({
        id: "c_status",
        type: "reference-list-select",
        name: "status",
        bind: "status",
        settings: { referenceList: "status" },
      }),
    ).toEqual([])
  })

  it("name a data path with no matching property", () => {
    const [problem] = problems(field("nickname"))
    expect(problem.message).toBe(
      "Person has no property called “nickname”, so the value of nickname would not be saved. Set its data path to one of Person’s properties.",
    )
  })

  it("name a component whose value does not fit the property's type, and the one that would", () => {
    const [problem] = problems({ ...field("text"), bind: "born" })
    expect(problem.message).toBe(
      "Text field holds text, but Born is a date. Use a Date picker for it.",
    )
  })

  it("name a reference list select that offers another list, with the fix", () => {
    const [problem] = problems({
      id: "c_status",
      type: "reference-list-select",
      name: "status",
      bind: "status",
      settings: { referenceList: "colours" },
    })
    expect(problem.message).toBe(
      "status offers the reference list “colours”, but Status takes its values from “status”.",
    )
    expect(problem.fix?.command).toEqual({
      type: "set-setting",
      id: "c_status",
      key: "referenceList",
      value: "status",
    })
  })

  it("name an entity picker that offers another entity", () => {
    const [problem] = problems({
      id: "c_company",
      type: "entity-picker",
      name: "company",
      bind: "company",
    })
    expect(problem.message).toBe(
      "company has no entity yet. Company takes its values from “company”.",
    )
  })

  it("leave components that hold no value alone", () => {
    expect(problems({ id: "c_b", type: "button", name: "b" })).toEqual([])
  })
})

describe("adding a component for a property (spec 5.2)", () => {
  const environment = { schema, random: seededRandom(3) }

  it("binds it to the property, names and labels it after it, and carries its limits", () => {
    const result = runCommand(
      createEditorState(form([])),
      { type: "add", component: "text-field", property: property("surname") },
      environment,
    )
    expect(result.changed).toBe(true)
    expect(result.state.document.components[0]).toMatchObject({
      type: "text-field",
      name: "surname",
      bind: "surname",
      settings: { label: "Surname", required: true, maxLength: 50 },
    })
    expect(result.message).toMatch(/^Added Text field surname for Surname at position 1 of 1/)
    expect(checkDocument(result.state.document)).toEqual([])
  })

  it("picks the component each property type is edited with", () => {
    const expected: Record<string, string> = {
      surname: "text-field",
      notes: "text-area",
      born: "date-picker",
      status: "reference-list-select",
      company: "entity-picker",
    }
    for (const [name, type] of Object.entries(expected)) {
      expect(schema.componentFor(property(name))?.type, name).toBe(type)
    }
    expect(
      schema.componentFor({ name: "n", displayName: "N", type: "number", whole: true })?.type,
    ).toBe("number-field")
    expect(schema.componentFor({ name: "b", displayName: "B", type: "boolean" })?.type).toBe(
      "checkbox",
    )
  })

  it("is refused for a property already on the form", () => {
    const start = createEditorState(form([field("surname")]))
    const result = runCommand(
      start,
      { type: "add", component: "text-field", property: property("surname") },
      environment,
    )
    expect(result.changed).toBe(false)
    expect(result.message).toBe("Surname is already on the form.")
  })

  it("takes the usual name when the property's name is used by another component", () => {
    const start = createEditorState(form([{ id: "c_x", type: "button", name: "surname" }]))
    const result = runCommand(
      start,
      { type: "add", component: "text-field", property: property("surname") },
      environment,
    )
    expect(result.state.document.components[1]).toMatchObject({
      name: "textField1",
      bind: "surname",
    })
  })
})
