import { helpTextSetting, labelSetting, placeholderSetting } from "../../parts/settings"
import {
  maxLengthSetting,
  minLengthSetting,
  patternSetting,
  requiredSetting,
} from "../../runtime/rules"
import { optionalText } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Text field"),
  helpText: helpTextSetting,
  placeholder: placeholderSetting,
  defaultValue: optionalText({ label: "Default value", group: "data" }),
  required: requiredSetting,
  minLength: minLengthSetting,
  maxLength: maxLengthSetting,
  pattern: patternSetting,
}

export const slots = ["root", "label", "control", "description", "error"] as const

export type Slot = (typeof slots)[number]
