"use client";

import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import React, { useState, useEffect } from "react";
import { useProject } from "@/hooks/use-projects";
import { api } from "@/lib/api-client";
import {
  useProjectMilestones,
  useClaimSubMilestone,
  useUpdateMilestone,
  useUpdateSubMilestone,
} from "@/hooks/use-milestones";
import { useAIMilestoneGeneration } from "@/hooks/use-ai-milestone-generation";
import { MilestoneTree } from "@/components/milestones/milestone-tree";
import { useAuth } from "@/components/auth-provider";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { VercelV0Chat } from "@/components/ui/v0-ai-chat";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { MilestoneStatus } from "@/lib/types";
import {
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FolderKanban,
  GitBranch,
  Wallet,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

import { OverviewTab } from "@/components/project/overview-tab";
import { MilestoneTab } from "@/components/project/milestone-tab";

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { user } = useAuth();
  const { data: project, isLoading } = useProject(id);
  const {
    data: milestones,
    isLoading: milestonesLoading,
    refetch: refetchMilestones,
  } = useProjectMilestones(id);
  const claimSubMilestone = useClaimSubMilestone();
  const updateMilestone = useUpdateMilestone();
  const updateSubMilestone = useUpdateSubMilestone();

  // WebSocket for real-time milestone generation
  const {
    progress: generationProgress,
    streamedMilestones,
    isConnected,
    isGenerating,
  } = useAIMilestoneGeneration(id);

  // Show progress toasts as milestones are generated (only show on start and completion)
  useEffect(() => {
    if (!generationProgress) return;

    if (generationProgress.stage === "started") {
      toast.loading("AI is generating milestones...", { id: "milestone-gen" });
    } else if (generationProgress.stage === "completed") {
      toast.success("Milestones generated successfully!", {
        id: "milestone-gen",
        duration: 3000,
      });
      refetchMilestones(); // Refresh to show saved milestones
    } else if (generationProgress.stage === "error") {
      toast.error("Failed to generate milestones", { id: "milestone-gen" });
    }
    // Don't show toast for intermediate progress (analyzing, generating, etc.)
  }, [generationProgress, refetchMilestones]);

  // Listen for milestone generation events from chat (no toast, UI shows progress)
  useEffect(() => {
    const handleMilestoneGeneration = (event: CustomEvent) => {
      // Event received - progress will be shown in the milestone tab
      if (event.detail.projectId === id) {
        console.log(
          "[Milestone Gen] Event received, WebSocket will handle updates"
        );
      }
    };

    window.addEventListener(
      "milestone-generation-started" as any,
      handleMilestoneGeneration
    );
    return () => {
      window.removeEventListener(
        "milestone-generation-started" as any,
        handleMilestoneGeneration
      );
    };
  }, [id]);

  const isProjectOwner = user?.id === project?.sponsorId;

  const handleClaimTask = async (subMilestoneId: string) => {
    try {
      await claimSubMilestone.mutateAsync({
        subMilestoneId,
        data: {},
      });
      toast.success("Task claimed successfully");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to claim task";
      toast.error(message);
    }
  };

  const handleGenerateMilestones = async (
    prompt: string,
    attachments?: File[]
  ) => {
    try {
      toast.loading("Starting AI milestone generation...", {
        id: "ai-generate",
      });

      await api.ai.generateMilestones({
        projectId: id,
        prompt,
        repositoryUrl: project?.repositoryUrl,
        attachments,
      });

      toast.loading("Analyzing repository and documents...", {
        id: "ai-generate",
      });

      // Connect to streaming endpoint for real-time updates
      const token = localStorage.getItem("jwt_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const eventSource = new EventSource(
        `${apiUrl}/api/ai/milestones/stream/${id}?token=${token}`
      );

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "connected":
              toast.loading("Connected to AI stream...", { id: "ai-generate" });
              break;

            case "progress":
              toast.loading(data.message || "Generating milestones...", {
                id: "ai-generate",
              });
              break;

            case "completed":
              eventSource.close();
              toast.success(
                `✨ Generated ${data.totalMilestones} milestones with ${data.totalSubMilestones} tasks!`,
                { id: "ai-generate", duration: 5000 }
              );
              setTimeout(() => window.location.reload(), 1000);
              break;

            case "error":
              eventSource.close();
              toast.error(data.message || "Failed to generate milestones", {
                id: "ai-generate",
              });
              break;
          }
        } catch (error) {
          console.error("Error parsing SSE data:", error);
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE Error:", error);
        eventSource.close();
        toast.error("Connection lost. Please refresh to see results.", {
          id: "ai-generate",
        });
      };

      // Timeout after 5 minutes
      setTimeout(() => {
        eventSource.close();
        toast.error("Generation timed out. Please check project page.", {
          id: "ai-generate",
        });
      }, 300000);
    } catch (error: any) {
      console.error("Failed to generate milestones:", error);
      toast.error(
        error.response?.data?.error || "Failed to generate milestones",
        { id: "ai-generate" }
      );
    }
  };

  if (isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Skeleton className="h-4 w-64" />
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
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
          <div className="flex flex-1 items-center justify-center">
            <Card>
              <CardContent className="py-12 px-8">
                <div className="text-center space-y-4">
                  <FolderKanban className="w-16 h-16 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold">Project not found</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      The project you&apos;re looking for doesn&apos;t exist.
                    </p>
                  </div>
                  <Button onClick={() => router.push("/projects")}>
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

  const completedMilestones =
    milestones?.filter((m) => m.status === MilestoneStatus.COMPLETED).length ||
    0;
  const totalMilestones = milestones?.length || 0;
  const completionProgress =
    totalMilestones > 0 ? (completedMilestones / totalMilestones) * 100 : 0;

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
                <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
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
          {/* Tabs */}
          <Tabs
            defaultValue="milestones"
            className="space-y-6 h-full flex flex-col"
          >
            <div className="flex items-center justify-between shrink-0">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="milestones">Milestones</TabsTrigger>
              </TabsList>
            </div>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <OverviewTab
                project={project}
                progress={completionProgress}
                completedMilestones={completedMilestones}
                totalMilestones={totalMilestones}
              />
            </TabsContent>

            {/* Milestones Tab */}
            <TabsContent
              value="milestones"
              className="flex-1 h-full data-[state=active]:flex flex-col"
            >
              <MilestoneTab
                milestones={milestones || []}
                projectId={id}
                projectName={project.title}
                isLoading={milestonesLoading}
                progress={generationProgress}
                streamedMilestones={streamedMilestones}
                isGenerating={isGenerating}
                onMilestoneUpdate={async (milestoneId, data) => {
                  try {
                    await updateMilestone.mutateAsync({ milestoneId, data });
                    toast.success("Milestone updated successfully");
                  } catch (error) {
                    toast.error("Failed to update milestone");
                  }
                }}
                onSubMilestoneUpdate={async (subMilestoneId, data) => {
                  try {
                    await updateSubMilestone.mutateAsync({
                      subMilestoneId,
                      data,
                    });
                    toast.success("Sub-milestone updated successfully");
                  } catch (error) {
                    toast.error("Failed to update sub-milestone");
                  }
                }}
                onSubMilestoneClick={(milestoneId, subMilestoneId) => {
                  router.push(
                    `/projects/${id}/milestones/${milestoneId}/sub/${subMilestoneId}`
                  );
                }}
                onGenerateMilestones={handleGenerateMilestones}
              />
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
