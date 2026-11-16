import { optionalText, referenceListName } from "../../runtime/settings"

export const settings = {
  label: optionalText({
    label: "Label",
    help: "Shown above the tag. Leave it empty to show the tag alone.",
    group: "general",
  }),
  referenceList: referenceListName({
    label: "Reference list",
    help: "The list the value belongs to: the tag shows the item's label in its colour.",
    group: "data",
  }),
}

export const slots = ["root", "label", "tag"] as const

export type Slot = (typeof slots)[number]
