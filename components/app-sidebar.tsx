"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  FileTextIcon,
  ChartBarIcon,
  SettingsIcon,
  ShieldIcon,
} from "lucide-react"
import { Logo } from "@/components/logo"

type NavItem = { title: string; url: string; icon: React.ComponentType }

// Only routes that exist. No dead links.
const NAV: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Artifacts", url: "/artifacts", icon: FileTextIcon },
  { title: "Analytics", url: "/analytics", icon: ChartBarIcon },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
]

export function AppSidebar({
  user,
  isAdmin = false,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; avatar?: string }
  isAdmin?: boolean
}) {
  const pathname = usePathname()
  const items = isAdmin
    ? [...NAV, { title: "Admin", url: "/admin", icon: ShieldIcon }]
    : NAV

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <Link href="/dashboard">
                <Logo className="size-6" />
                <span className="text-base font-semibold tracking-tight">
                  Artifact Room
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              {items.map((item) => {
                const active =
                  pathname === item.url || pathname.startsWith(`${item.url}/`)
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.title} className="relative">
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-1/2 z-10 h-5 w-1 -translate-y-1/2 rounded-r-full bg-ember"
                      />
                    )}
                    <SidebarMenuButton asChild tooltip={item.title} isActive={active}>
                      <Link href={item.url}>
                        <Icon className={active ? "text-ember" : undefined} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
