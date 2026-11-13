import { optionalText, text } from "../runtime/settings"

/** Settings most inputs share. Each definition still lists the ones it has. */

export const labelSetting = (defaultLabel: string) =>
  text({ label: "Label", group: "general", default: defaultLabel })

export const helpTextSetting = optionalText({
  label: "Help text",
  help: "Shown under the control.",
  group: "general",
})

export const placeholderSetting = optionalText({
  label: "Placeholder",
  help: "Shown inside the control while it is empty.",
  group: "general",
})
