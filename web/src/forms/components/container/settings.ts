import { choice, optionalText, space } from "../../runtime/settings"

export const settings = {
  title: optionalText({
    label: "Title",
    help: "Shown above the contents, and names the group for assistive technology.",
    group: "general",
  }),
  direction: choice({
    label: "Direction",
    help: "Horizontal lays the contents out in a row that wraps.",
    group: "layout",
    choices: [
      { value: "vertical", label: "Vertical" },
      { value: "horizontal", label: "Horizontal" },
    ],
    default: "vertical",
  }),
  gap: space({
    label: "Gap",
    help: "The space between the components inside.",
    group: "layout",
    default: "md",
  }),
}

/** The one region a Container has. */
export const CONTENT_REGION = "content"

export const slots = ["root", "title"] as const

export type Slot = (typeof slots)[number]
