import { choice, text } from "../../runtime/settings"

export const settings = {
  text: text({
    label: "Text",
    help: "Line breaks are kept.",
    group: "general",
    default: "Text",
    multiline: true,
  }),
  variant: choice({
    label: "Variant",
    help: "A heading names the part of the form that follows it.",
    group: "general",
    choices: [
      { value: "heading2", label: "Heading 2" },
      { value: "heading3", label: "Heading 3" },
      { value: "heading4", label: "Heading 4" },
      { value: "paragraph", label: "Paragraph" },
      { value: "muted", label: "Muted" },
    ],
    default: "paragraph",
  }),
  alignment: choice({
    label: "Alignment",
    group: "layout",
    choices: [
      { value: "start", label: "Start" },
      { value: "center", label: "Centre" },
      { value: "end", label: "End" },
    ],
    default: "start",
  }),
}

export const slots = ["root"] as const

export type Slot = (typeof slots)[number]
