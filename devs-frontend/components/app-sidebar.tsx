"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Building2,
  Users,
  Settings,
  HelpCircle,
  Sparkles,
  Wallet,
  GitBranch,
  TrendingUp,
  Activity,
} from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserRole } from "@/lib/types";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  const pathname = usePathname();

  const isSponsor = user?.role === UserRole.SPONSOR;
  const dashboardPath = isSponsor
    ? "/dashboard/sponsor"
    : "/dashboard/contributor";

  const navMain = React.useMemo(() => {
    const baseItems = [
      {
        title: "Dashboard",
        url: dashboardPath,
        icon: LayoutDashboard,
        isActive: pathname === dashboardPath,
      },
      {
        title: "Projects",
        url: "/projects",
        icon: FolderKanban,
        isActive: pathname?.startsWith("/projects"),
      },
    ];

    if (isSponsor) {
      baseItems.push({
        title: "Organizations",
        url: "/organizations",
        icon: Building2,
        isActive: pathname?.startsWith("/organizations"),
      });
    } else {
      baseItems.push({
        title: "Contributions",
        url: "/contributions",
        icon: GitBranch,
        isActive: pathname?.startsWith("/contributions"),
      });
    }

    // Add AI Usage page for all users
    baseItems.push({
      title: "AI Usage",
      url: "/credits",
      icon: Activity,
      isActive: pathname?.startsWith("/credits"),
    });

    return baseItems;
  }, [isSponsor, dashboardPath, pathname]);

  const navSecondary = [
    {
      title: "Settings",
      url: "/settings",
      icon: Settings,
    },
    {
      title: "Help & Support",
      url: "/help",
      icon: HelpCircle,
    },
  ];

  const userData = user
    ? {
        name: user.name || user.githubUsername || "User",
        email: user.email || "",
        avatar: user.avatarUrl || "",
      }
    : null;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">DevSponsor</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {isSponsor ? "Sponsor" : "Contributor"}
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>{userData && <NavUser user={userData} />}</SidebarFooter>
    </Sidebar>
  );
}
