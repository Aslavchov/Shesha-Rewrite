import { helpTextSetting, labelSetting, placeholderSetting } from "../../parts/settings"
import { maxSetting, minSetting, requiredSetting, wholeNumberSetting } from "../../runtime/rules"
import { optionalNumber } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Number field"),
  helpText: helpTextSetting,
  placeholder: placeholderSetting,
  defaultValue: optionalNumber({ label: "Default value", group: "data" }),
  required: requiredSetting,
  min: minSetting,
  max: maxSetting,
  wholeNumber: wholeNumberSetting,
}

export const slots = ["root", "label", "control", "description", "error"] as const

export type Slot = (typeof slots)[number]
