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
    /** The phase that builds it. */
    phase: number
  }
}

export const HOME_PAGE: AppPage = { id: "home", path: "/", title: "Home", icon: HomeIcon }

/*
 * The phase numbers below are a working assumption. The Phase 0 spec asks each
 * empty state to name the phase that brings the page, but does not include the
 * roadmap; correct them here when it is confirmed.
 */
export const UPCOMING_PAGES: AppPage[] = [
  {
    id: "forms",
    path: "/forms",
    title: "Forms",
    icon: FileTextIcon,
    upcoming: { summary: "Every form in this app, ready to open, preview and edit.", phase: 1 },
  },
  {
    id: "designer",
    path: "/designer",
    title: "Designer",
    icon: PencilRulerIcon,
    upcoming: { summary: "The drag-and-drop canvas where forms are built.", phase: 1 },
  },
  {
    id: "entities",
    path: "/entities",
    title: "Entities",
    icon: BoxesIcon,
    upcoming: { summary: "The data entities and properties that forms bind to.", phase: 2 },
  },
  {
    id: "themes",
    path: "/themes",
    title: "Themes",
    icon: PaletteIcon,
    upcoming: { summary: "Themes that restyle the whole app by editing design tokens.", phase: 3 },
  },
  {
    id: "settings",
    path: "/settings",
    title: "Settings",
    icon: SettingsIcon,
    upcoming: { summary: "Application-wide settings and preferences.", phase: 4 },
  },
]

/** Sidebar order. */
export const NAV_PAGES: AppPage[] = [HOME_PAGE, ...UPCOMING_PAGES]

export const NOT_FOUND_TITLE = "Page not found"
