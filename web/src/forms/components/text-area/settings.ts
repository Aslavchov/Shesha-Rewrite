import { helpTextSetting, labelSetting, placeholderSetting } from "../../parts/settings"
import { maxLengthSetting, requiredSetting } from "../../runtime/rules"
import { number, optionalText } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Text area"),
  helpText: helpTextSetting,
  placeholder: placeholderSetting,
  defaultValue: optionalText({ label: "Default value", group: "data" }),
  required: requiredSetting,
  maxLength: maxLengthSetting,
  rows: number({
    label: "Rows",
    help: "How many lines of text are visible, from 2 to 20.",
    group: "layout",
    default: 4,
    min: 2,
    max: 20,
    whole: true,
  }),
}

export const slots = ["root", "label", "control", "description", "error"] as const

export type Slot = (typeof slots)[number]
