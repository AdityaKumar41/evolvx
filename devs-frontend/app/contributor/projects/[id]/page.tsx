"use client";

import { useRouter, useParams } from "next/navigation";
import { useProject } from "@/hooks/use-projects";
import { useProjectMilestones } from "@/hooks/use-milestones";
import { MilestoneTree } from "@/components/milestones/milestone-tree";
import { JoinRequestButton } from "@/components/join-request-button";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ArrowLeft,
  Loader2,
  Lock,
  Globe,
  UserCheck,
  Clock,
} from "lucide-react";
import { RepoType, JoinRequestStatus } from "@/lib/types";

export default function ContributorProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: project, isLoading } = useProject(id);
  const { data: milestones, isLoading: milestonesLoading } =
    useProjectMilestones(id);

  const getRepoTypeBadge = (repoType: RepoType) => {
    switch (repoType) {
      case RepoType.PUBLIC:
        return (
          <Badge variant="outline" className="gap-1">
            <Globe className="w-3 h-3" />
            Public
          </Badge>
        );
      case RepoType.PRIVATE_REQUEST:
        return (
          <Badge variant="secondary" className="gap-1">
            <UserCheck className="w-3 h-3" />
            Request to Join
          </Badge>
        );
      case RepoType.PRIVATE:
      case RepoType.PRIVATE_INVITE:
        return (
          <Badge variant="secondary" className="gap-1">
            <Lock className="w-3 h-3" />
            Private
          </Badge>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  if (!project) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center min-h-screen">
            <Card>
              <CardContent className="py-12 px-8">
                <div className="text-center space-y-4">
                  <h3 className="text-lg font-semibold">Project not found</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    The project you&apos;re looking for doesn&apos;t exist or is
                    not active.
                  </p>
                  <Button onClick={() => router.push("/contributor/projects")}>
                    Back to Projects
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    );
  }

  // Check if user has access to view milestones
  const canViewMilestones =
    project.hasAccess || project.repoType === RepoType.PUBLIC;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Header */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/contributor/projects")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/contributor/projects">
                  Projects
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{project.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {/* Project Info */}
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">
                  {project.title}
                </h1>
                <p className="text-muted-foreground">{project.description}</p>
                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">
                    Sponsored by{" "}
                    <span className="font-medium">
                      {project.sponsor?.githubUsername || "Anonymous"}
                    </span>
                  </div>
                  {getRepoTypeBadge(project.repoType)}
                </div>
              </div>
              <div className="shrink-0">
                {!canViewMilestones && (
                  <JoinRequestButton
                    projectId={project.id}
                    projectTitle={project.title}
                    repoType={project.repoType}
                    hasAccess={project.hasAccess}
                    joinRequestStatus={project.joinRequestStatus}
                  />
                )}
              </div>
            </div>

            {/* Access Status Message */}
            {!canViewMilestones && (
              <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
                <CardContent className="py-6">
                  <div className="flex items-start gap-3">
                    {project.joinRequestStatus === JoinRequestStatus.PENDING ? (
                      <>
                        <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                            Request Pending
                          </h3>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            Your join request is awaiting approval from the
                            project sponsor. You&apos;ll be able to view
                            milestones once approved.
                          </p>
                        </div>
                      </>
                    ) : project.joinRequestStatus ===
                      JoinRequestStatus.DECLINED ? (
                      <>
                        <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                            Request Declined
                          </h3>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            Your join request was declined. Contact the project
                            sponsor for more information.
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                            Private Project
                          </h3>
                          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                            This is a private project. Request to join to view
                            available tasks and contribute.
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Milestones */}
          {canViewMilestones && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Available Tasks</h2>
              {milestonesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : milestones && milestones.length > 0 ? (
                <MilestoneTree
                  milestones={milestones}
                  projectId={id}
                  onSubMilestoneClick={(milestoneId, subMilestoneId) => {
                    router.push(
                      `/contributor/projects/${id}/submilestones/${subMilestoneId}`
                    );
                  }}
                />
              ) : (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center text-muted-foreground">
                      No tasks available yet
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
