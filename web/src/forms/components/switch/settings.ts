import { helpTextSetting, labelSetting } from "../../parts/settings"
import { toggle } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Switch"),
  helpText: helpTextSetting,
  defaultValue: toggle({
    label: "On by default",
    group: "data",
    default: false,
  }),
}

export const slots = ["root", "control", "label", "description"] as const

export type Slot = (typeof slots)[number]
