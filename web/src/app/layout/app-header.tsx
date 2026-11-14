import { SidebarTrigger } from "@/components/ui/sidebar"

import { ThemeToggle } from "../theme/theme-toggle"

/**
 * The bar above every page: the menu button on small screens, and the theme
 * toggle. It carries no title: each page shows its own, once, as its heading.
 */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 flex h-header shrink-0 items-center gap-2 border-b bg-background px-4 md:px-8">
      <SidebarTrigger data-testid="nav-menu-button" className="-ml-2 md:hidden" />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  )
}
