"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { ChevronsUpDown, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/idempiere";
import { getInitials } from "@/lib/utils";

// ponytail: reads real session data from auth context — no hardcoded template users
export function NavUser() {
  const { isMobile } = useSidebar();
  const { logout, session: liveSession } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push("/auth/v1/login");
  };

  // ponytail: AuthProvider seeds session from client storage — null during SSR, present on
  // the client's first render — which hydrates as "U" (server) vs the real initial (client).
  // Gate on mount so pre-hydration output matches the server.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const session = mounted ? liveSession : null;

  const userName = session?.userName ?? "User";
  const roleLabel = [session?.roleName, session?.orgName].filter(Boolean).join(" · ");
  const _contextLabel = [session?.clientName, session?.warehouseName].filter(Boolean).join(" · ");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">{getInitials(userName)}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{userName}</span>
                <span className="truncate text-muted-foreground text-xs">{roleLabel || "—"}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">{getInitials(userName)}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{userName}</span>
                  <span className="truncate text-muted-foreground text-xs">{roleLabel || "—"}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <div className="space-y-1 px-2 py-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Client</span>
                  <span className="ml-2 truncate font-medium">{session?.clientName ?? "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Role</span>
                  <span className="ml-2 truncate font-medium">{session?.roleName ?? "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Organization</span>
                  <span className="ml-2 truncate font-medium">{session?.orgName ?? "—"}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Warehouse</span>
                  <span className="ml-2 truncate font-medium">{session?.warehouseName ?? "—"}</span>
                </div>
              </div>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
