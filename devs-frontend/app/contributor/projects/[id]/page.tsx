"use client";

import { useRouter, useParams } from "next/navigation";
import { useProject } from "@/hooks/use-projects";
import { useProjectMilestones } from "@/hooks/use-milestones";
import { MilestoneTree } from "@/components/milestones/milestone-tree";
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
import { ThemeToggle } from "@/components/theme-toggle";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function ContributorProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: project, isLoading } = useProject(id);
  const { data: milestones, isLoading: milestonesLoading } =
    useProjectMilestones(id);

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
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {project.title}
            </h1>
            <p className="text-muted-foreground">{project.description}</p>
            <div className="text-sm text-muted-foreground">
              Sponsored by{" "}
              <span className="font-medium">
                {project.sponsor?.githubUsername || "Anonymous"}
              </span>
            </div>
          </div>

          {/* Milestones */}
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
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
