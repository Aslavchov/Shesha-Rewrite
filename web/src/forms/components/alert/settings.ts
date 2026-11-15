import { choice, optionalText, text } from "../../runtime/settings"

export const settings = {
  variant: choice({
    label: "Variant",
    help: "What kind of message it is. Each has its own colour and icon.",
    group: "general",
    choices: [
      { value: "info", label: "Information" },
      { value: "success", label: "Success" },
      { value: "warning", label: "Warning" },
      { value: "destructive", label: "Destructive" },
    ],
    default: "info",
  }),
  title: text({ label: "Title", group: "general", default: "Alert" }),
  description: optionalText({
    label: "Description",
    help: "Shown under the title.",
    group: "general",
    multiline: true,
  }),
}

export const slots = ["root", "icon", "title", "description"] as const

export type Slot = (typeof slots)[number]
