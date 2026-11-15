import { helpTextSetting, labelSetting, placeholderSetting } from "../../parts/settings"
import { requiredSetting } from "../../runtime/rules"
import { optionalChoiceFrom, optionChoices, options } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Select"),
  helpText: helpTextSetting,
  placeholder: placeholderSetting,
  options: options({
    label: "Options",
    help: "The choices: the label is shown, the value is stored.",
    group: "data",
  }),
  defaultValue: optionalChoiceFrom({
    label: "Default value",
    help: "The option chosen when the form opens.",
    group: "data",
    from: (resolved) => optionChoices(resolved.options),
  }),
  required: requiredSetting,
}

export const slots = ["root", "label", "trigger", "popup", "item", "description", "error"] as const

export type Slot = (typeof slots)[number]
