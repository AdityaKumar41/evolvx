"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useProjects } from "@/hooks/use-projects";
import { useOrganizations } from "@/hooks/use-organizations";
import { ProtectedRoute } from "@/components/protected-route";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Building2,
  FolderKanban,
  Users,
  ArrowRight,
  Sparkles,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { UserRole } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { ActivityChart } from "@/components/activity-chart";

export default function SponsorDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SPONSOR]}>
      <SponsorDashboardContent />
    </ProtectedRoute>
  );
}

function SponsorDashboardContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: projects, isLoading: projectsLoading } = useProjects({
    sponsorId: user?.id,
  });
  const { data: organizations, isLoading: orgsLoading } = useOrganizations();

  const isLoading = projectsLoading || orgsLoading;

  const activeProjects =
    projects?.filter((p) => p.status === "ACTIVE").length || 0;
  const totalProjects = projects?.length || 0;
  const totalOrganizations = organizations?.length || 0;

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
                <BreadcrumbPage>Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {/* Welcome Section */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Welcome back, {user?.name || user?.githubUsername || "Sponsor"}!
              </h1>
              <p className="text-muted-foreground">
                Here's what's happening with your projects today.
              </p>
            </div>
            <Button onClick={() => router.push("/projects/create")}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Projects
                </CardTitle>
                <FolderKanban className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{totalProjects}</div>
                    <p className="text-xs text-muted-foreground">
                      {activeProjects} active
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Organizations
                </CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {totalOrganizations}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Active teams
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Contributors
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">0</div>
                    <p className="text-xs text-muted-foreground">
                      Across all projects
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Funded
                </CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">$0</div>
                    <p className="text-xs text-muted-foreground">
                      Total investment
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push("/organizations/create")}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Create Organization</CardTitle>
                    <CardDescription className="text-xs">
                      Manage teams and projects
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push("/projects/create")}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>New Project</CardTitle>
                    <CardDescription className="text-xs">
                      AI-powered milestones
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push("/organizations")}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Manage Teams</CardTitle>
                    <CardDescription className="text-xs">
                      View organizations
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>

          {/* Activity Chart */}
          <ActivityChart
            title="Project Engagement"
            description="Contribution activity across all your projects"
            data={[
              // Sample data - replace with real data from API
              {
                date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0],
                count: 3,
              },
              {
                date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0],
                count: 7,
              },
              {
                date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0],
                count: 5,
              },
              {
                date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0],
                count: 12,
              },
              {
                date: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0],
                count: 8,
              },
            ]}
          />

          {/* Recent Projects */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Projects</CardTitle>
                  <CardDescription>
                    Your latest projects and their status
                  </CardDescription>
                </div>
                {projects && projects.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push("/projects")}
                  >
                    View All
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <Skeleton className="h-12 w-12 rounded" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-3 w-[200px]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : projects && projects.length > 0 ? (
                <div className="space-y-3">
                  {projects.slice(0, 5).map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
                          <FolderKanban className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium leading-none">
                            {project.title}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {project.description}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          project.status === "ACTIVE" ? "default" : "secondary"
                        }
                      >
                        {project.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold">No projects yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Get started by creating your first project
                  </p>
                  <Button onClick={() => router.push("/projects/create")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Project
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
