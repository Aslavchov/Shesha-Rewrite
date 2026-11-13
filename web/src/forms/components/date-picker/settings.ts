import { helpTextSetting, labelSetting } from "../../parts/settings"
import { maxDateSetting, minDateSetting, requiredSetting } from "../../runtime/rules"
import { optionalDate, text } from "../../runtime/settings"

export const settings = {
  label: labelSetting("Date picker"),
  helpText: helpTextSetting,
  // The placeholder shows the form a typed date takes, so it has a default.
  placeholder: text({
    label: "Placeholder",
    help: "Shown inside the control while it is empty.",
    group: "general",
    default: "e.g. 14 March 1990",
  }),
  defaultValue: optionalDate({ label: "Default value", group: "data" }),
  required: requiredSetting,
  minDate: minDateSetting,
  maxDate: maxDateSetting,
}

export const slots = [
  "root",
  "label",
  "control",
  "trigger",
  "popup",
  "description",
  "error",
] as const

export type Slot = (typeof slots)[number]
