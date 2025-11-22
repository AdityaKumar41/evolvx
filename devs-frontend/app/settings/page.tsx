"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Github, Wallet, Mail, User, Code } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api-client";

export default function SettingsPage() {
  const router = useRouter();
  const { data: user, refetch } = useCurrentUser();
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");

  // Update state when user data loads
  React.useEffect(() => {
    if (user) {
      setName(user.name || "");
      setBio(user.bio || "");
      setSkills(user.skills?.join(", ") || "");
    }
  }, [user]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await apiClient.patch("/auth/profile", {
        name,
        bio,
        skills: skills
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
      });
      toast.success("Profile updated successfully");
      refetch();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update profile";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 max-w-4xl">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Manage your account settings and preferences
            </p>
          </div>

          {/* Profile Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>
                Update your profile information and display settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">
                  <User className="w-4 h-4 inline mr-2" />
                  Full Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself..."
                  rows={4}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="skills">
                  <Code className="w-4 h-4 inline mr-2" />
                  Skills (comma separated)
                </Label>
                <Input
                  id="skills"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder="React, TypeScript, Node.js"
                />
              </div>

              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>

          {/* Connected Accounts */}
          <Card>
            <CardHeader>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>
                Manage your connected accounts and integrations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Github className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">GitHub</p>
                    <p className="text-sm text-muted-foreground">
                      @{user?.githubUsername}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary">Connected</Badge>
              </div>

              {user?.walletAddress && (
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Wallet className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">Wallet</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {user.walletAddress.slice(0, 6)}...
                        {user.walletAddress.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">Connected</Badge>
                </div>
              )}

              {user?.email && (
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">Email</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">Verified</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your account details and role information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Role
                  </p>
                  <Badge className="mt-1">{user?.role}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Member Since
                  </p>
                  <p className="text-sm mt-1">
                    {user?.createdAt
                      ? new Date(user.createdAt).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={() => {
                  localStorage.removeItem("jwt_token");
                  router.push("/");
                }}
              >
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
