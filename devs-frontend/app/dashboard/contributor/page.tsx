"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useProjects } from "@/hooks/use-projects";
import { useContributions } from "@/hooks/use-contributions";
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
  FolderKanban,
  GitPullRequest,
  ArrowRight,
  Trophy,
  Clock,
  CheckCircle2,
  Search,
} from "lucide-react";
import { UserRole, Contribution, Project } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ContributorDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CONTRIBUTOR]}>
      <ContributorDashboardContent />
    </ProtectedRoute>
  );
}

function ContributorDashboardContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: contributions, isLoading: contributionsLoading } =
    useContributions({ contributorId: user?.id });

  const isLoading = projectsLoading || contributionsLoading;

  const totalContributions = contributions?.length || 0;
  const pendingContributions =
    contributions?.filter((c: Contribution) => c.status === "PENDING").length ||
    0;
  const approvedContributions =
    contributions?.filter(
      (c: Contribution) => c.status === "VERIFIED" || c.status === "PAID"
    ).length || 0;
  const availableProjects =
    projects?.filter((p: Project) => p.status === "ACTIVE").length || 0;

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
                Welcome back,{" "}
                {user?.name || user?.githubUsername || "Developer"}!
              </h1>
              <p className="text-muted-foreground">
                Explore projects and track your contributions.
              </p>
            </div>
            <Button onClick={() => router.push("/projects")}>
              <Search className="w-4 h-4 mr-2" />
              Browse Projects
            </Button>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Contributions
                </CardTitle>
                <GitPullRequest className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {totalContributions}
                    </div>
                    <p className="text-xs text-muted-foreground">All time</p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Pending Review
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {pendingContributions}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Awaiting approval
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Approved</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {approvedContributions}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Successful PRs
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Open Projects
                </CardTitle>
                <Trophy className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">
                      {availableProjects}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Available to join
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
              onClick={() => router.push("/projects")}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Search className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Browse Projects</CardTitle>
                    <CardDescription className="text-xs">
                      Find projects to contribute
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() =>
                router.push("/dashboard/contributor/contributions")
              }
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <GitPullRequest className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>My Contributions</CardTitle>
                    <CardDescription className="text-xs">
                      Track your work
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push("/projects?status=ACTIVE")}
            >
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Active Projects</CardTitle>
                    <CardDescription className="text-xs">
                      View trending projects
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
            </Card>
          </div>

          {/* Recent Contributions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Contributions</CardTitle>
                  <CardDescription>
                    Your latest pull requests and submissions
                  </CardDescription>
                </div>
                {contributions && contributions.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      router.push("/dashboard/contributor/contributions")
                    }
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
              ) : contributions && contributions.length > 0 ? (
                <div className="space-y-3">
                  {contributions.slice(0, 5).map((contribution) => (
                    <div
                      key={contribution.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
                          <GitPullRequest className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium leading-none">
                            {contribution.prUrl ||
                              `Contribution #${contribution.id.slice(0, 8)}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(
                              contribution.createdAt
                            ).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          contribution.status === "VERIFIED" ||
                          contribution.status === "PAID"
                            ? "default"
                            : contribution.status === "PENDING"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {contribution.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <GitPullRequest className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold">No contributions yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Start contributing to projects and earn rewards
                  </p>
                  <Button onClick={() => router.push("/projects")}>
                    <Search className="mr-2 h-4 w-4" />
                    Browse Projects
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Available Projects */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Available Projects</CardTitle>
                  <CardDescription>
                    Active projects looking for contributors
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
                  {projects
                    .filter((p) => p.status === "ACTIVE")
                    .slice(0, 5)
                    .map((project) => (
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
                        <Button size="sm" variant="outline">
                          View Details
                        </Button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold">No active projects</h3>
                  <p className="text-sm text-muted-foreground">
                    Check back later for new opportunities
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
