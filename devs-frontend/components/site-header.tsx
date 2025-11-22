"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Settings, User, Wallet } from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";

export function SiteHeader() {
  const { user, logout } = useAuth();
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const router = useRouter();

  const handleLogout = async () => {
    disconnect();
    await logout();
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center px-4 md:px-6 lg:px-8">
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold">DevSponsor</span>
        </Link>

        <nav className="ml-8 hidden md:flex items-center space-x-6 text-sm font-medium">
          <Link
            href="/projects"
            className="transition-colors hover:text-foreground/80"
          >
            Projects
          </Link>
          {user && (
            <Link
              href={
                user.role === "SPONSOR"
                  ? "/dashboard/sponsor"
                  : "/dashboard/contributor"
              }
              className="transition-colors hover:text-foreground/80"
            >
              Dashboard
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {address && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
              <Wallet className="w-4 h-4" />
              <span className="font-mono">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </div>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full"
                >
                  <Avatar>
                    {(() => {
                      const displayName =
                        (user.name && user.name.trim()) ||
                        (user.githubUsername && user.githubUsername.trim()) ||
                        user.id ||
                        "User";
                      const initials = displayName
                        ? displayName.slice(0, 2).toUpperCase()
                        : "US";
                      return (
                        <>
                          <AvatarImage src={user.avatarUrl} alt={displayName} />
                          <AvatarFallback>{initials}</AvatarFallback>
                        </>
                      );
                    })()}
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.name || user.githubUsername || user.id}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email || "No email"}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/profile")}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button onClick={() => router.push("/onboarding")}>
              Get Started
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
