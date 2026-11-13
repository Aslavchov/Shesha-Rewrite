import {
  BoxesIcon,
  FileTextIcon,
  HomeIcon,
  type LucideIcon,
  PaletteIcon,
  PencilRulerIcon,
  SettingsIcon,
} from "lucide-react"

/**
 * The pages of the app: one entry drives the route, the sidebar item, the
 * header title and, for pages that are not built yet, the empty state.
 */
export type AppPage = {
  /** Stable id; also the suffix of the `nav-<id>` test id. */
  id: string
  path: string
  title: string
  icon: LucideIcon
  /** Set while the page is a placeholder. */
  upcoming?: {
    /** One line: what the page will hold. */
    summary: string
    /** The roadmap phase that builds it, or "after-v1" if no v1 phase does. */
    arrives: number | "after-v1"
  }
}

export const HOME_PAGE: AppPage = { id: "home", path: "/", title: "Home", icon: HomeIcon }

/* When each page arrives follows docs/roadmap.md; keep the two in step. */
export const UPCOMING_PAGES: AppPage[] = [
  {
    id: "forms",
    path: "/forms",
    title: "Forms",
    icon: FileTextIcon,
    upcoming: { summary: "Every form in this app, ready to open, preview and edit.", arrives: 1 },
  },
  {
    id: "designer",
    path: "/designer",
    title: "Designer",
    icon: PencilRulerIcon,
    upcoming: { summary: "The drag-and-drop canvas where forms are built.", arrives: 2 },
  },
  {
    id: "entities",
    path: "/entities",
    title: "Entities",
    icon: BoxesIcon,
    upcoming: { summary: "The data entities and properties that forms bind to.", arrives: 5 },
  },
  {
    id: "themes",
    path: "/themes",
    title: "Themes",
    icon: PaletteIcon,
    upcoming: {
      summary: "Themes that restyle the whole app by editing design tokens.",
      arrives: 4,
    },
  },
  {
    id: "settings",
    path: "/settings",
    title: "Settings",
    icon: SettingsIcon,
    upcoming: { summary: "Application-wide settings and preferences.", arrives: "after-v1" },
  },
]

/** Sidebar order. */
export const NAV_PAGES: AppPage[] = [HOME_PAGE, ...UPCOMING_PAGES]

/** The closing sentence of an empty state: when the page arrives. */
export function arrivalText(arrives: number | "after-v1"): string {
  return arrives === "after-v1" ? "Arrives after v1." : `Arrives in Phase ${arrives}.`
}

export const NOT_FOUND_TITLE = "Page not found"
