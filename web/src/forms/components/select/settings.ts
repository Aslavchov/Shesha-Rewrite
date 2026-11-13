import { helpTextSetting, labelSetting, placeholderSetting } from "../../parts/settings"
import { requiredSetting } from "../../runtime/rules"
import { optionalText, options } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Select"),
  helpText: helpTextSetting,
  placeholder: placeholderSetting,
  options: options({
    label: "Options",
    help: "The choices: the label is shown, the value is stored.",
    group: "data",
  }),
  defaultValue: optionalText({
    label: "Default value",
    help: "The value of one of the options.",
    group: "data",
  }),
  required: requiredSetting,
}

export const slots = ["root", "label", "trigger", "popup", "item", "description", "error"] as const

export type Slot = (typeof slots)[number]
