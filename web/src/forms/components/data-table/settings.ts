import { columns, entityName, formId, number, toggle } from "../../runtime/settings"

export const settings = {
  entity: entityName({
    label: "Entity",
    help: "The entity whose rows the table lists.",
    group: "data",
  }),
  columns: columns({
    label: "Columns",
    help: "The properties shown, in order. With none chosen, every property is shown.",
    group: "data",
    entity: (resolved) => (typeof resolved.entity === "string" ? resolved.entity : null),
  }),
  form: formId({
    label: "Form for a row",
    help: "The form a row opens in. Left empty, the entity's default form is used.",
    group: "data",
  }),
  pageSize: number({
    label: "Rows per page",
    help: "From 1 to 100.",
    group: "layout",
    default: 10,
    min: 1,
    max: 100,
    whole: true,
  }),
  search: toggle({ label: "Quick search", group: "general", default: true }),
  filters: toggle({ label: "Filters", group: "general", default: true }),
  allowNew: toggle({ label: "Allow New", group: "general", default: true }),
  allowDelete: toggle({ label: "Allow Delete", group: "general", default: false }),
}

export const slots = ["root", "toolbar", "table", "header", "row", "pagination"] as const

export type Slot = (typeof slots)[number]
