import { helpTextSetting, labelSetting } from "../../parts/settings"
import { requiredSetting } from "../../runtime/rules"
import { toggle } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Checkbox"),
  helpText: helpTextSetting,
  defaultValue: toggle({
    label: "Checked by default",
    group: "data",
    default: false,
  }),
  required: requiredSetting,
}

export const slots = ["root", "control", "label", "description", "error"] as const

export type Slot = (typeof slots)[number]
