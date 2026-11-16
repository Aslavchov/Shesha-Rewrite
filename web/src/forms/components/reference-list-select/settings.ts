import { helpTextSetting, labelSetting, placeholderSetting } from "../../parts/settings"
import { requiredSetting } from "../../runtime/rules"
import { referenceListName } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Reference list"),
  helpText: helpTextSetting,
  placeholder: placeholderSetting,
  referenceList: referenceListName({
    label: "Reference list",
    help: "The list whose items are offered. They are managed on the Entities page.",
    group: "data",
  }),
  required: requiredSetting,
}

export const slots = ["root", "label", "trigger", "popup", "item", "description", "error"] as const

export type Slot = (typeof slots)[number]
