import { optionalText, space, text } from "../../runtime/settings"

export const settings = {
  title: text({
    label: "Title",
    help: "Shown at the top, and names the card for assistive technology. Leave empty for none.",
    group: "general",
    default: "Card",
  }),
  description: optionalText({
    label: "Description",
    help: "Shown under the title.",
    group: "general",
    multiline: true,
  }),
  gap: space({
    label: "Gap",
    help: "The space between the components inside.",
    group: "layout",
    default: "md",
  }),
}

/** The one region a Card has. */
export const CONTENT_REGION = "content"

export const slots = ["root", "header", "title", "description", "content"] as const

export type Slot = (typeof slots)[number]
