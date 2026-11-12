import { NavLink } from "react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { APP_NAME } from "@/generated"

import { NAV_PAGES } from "../pages"
import { BrandMark } from "./brand-mark"

export function AppSidebar() {
  const { setOpenMobile } = useSidebar()

  return (
    <Sidebar data-testid="sidebar">
      <SidebarHeader>
        <BrandMark />
        <span className="truncate font-heading text-base font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {NAV_PAGES.map((page) => (
              <SidebarMenuItem key={page.id}>
                <SidebarMenuButton
                  render={
                    <NavLink
                      to={page.path}
                      end
                      data-testid={`nav-${page.id}`}
                      // On small screens the sidebar is an overlay: close it on navigation.
                      onClick={() => setOpenMobile(false)}
                    />
                  }
                >
                  <page.icon aria-hidden="true" />
                  <span>{page.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
