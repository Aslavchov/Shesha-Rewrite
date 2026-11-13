import { SidebarTrigger } from "@/components/ui/sidebar"

import { ThemeToggle } from "../theme/theme-toggle"

export function AppHeader({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-header shrink-0 items-center gap-2 border-b bg-background px-4 md:px-8">
      <SidebarTrigger data-testid="nav-menu-button" className="-ml-2 md:hidden" />
      <p data-testid="header-title" className="truncate font-medium text-foreground">
        {title}
      </p>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  )
}
