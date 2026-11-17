import { helpTextSetting, labelSetting, placeholderSetting } from "../../parts/settings"
import { requiredSetting } from "../../runtime/rules"
import { entityName } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Entity picker"),
  helpText: helpTextSetting,
  placeholder: placeholderSetting,
  entity: entityName({
    label: "Entity",
    help: "The entity whose rows are offered. A row is found by its display property.",
    group: "data",
  }),
  required: requiredSetting,
}

export const slots = ["root", "label", "control", "popup", "description", "error"] as const

export type Slot = (typeof slots)[number]
