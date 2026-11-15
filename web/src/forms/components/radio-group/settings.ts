import { helpTextSetting, labelSetting } from "../../parts/settings"
import { requiredSetting } from "../../runtime/rules"
import { choice, optionalChoiceFrom, optionChoices, options } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Radio group"),
  helpText: helpTextSetting,
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
  orientation: choice({
    label: "Orientation",
    help: "Horizontal lays the options out in a row that wraps.",
    group: "layout",
    choices: [
      { value: "vertical", label: "Vertical" },
      { value: "horizontal", label: "Horizontal" },
    ],
    default: "vertical",
  }),
}

export const slots = ["root", "label", "item", "description", "error"] as const

export type Slot = (typeof slots)[number]
