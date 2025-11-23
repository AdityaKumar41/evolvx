"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, DollarSign, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/auth-provider";
import { apiClient } from "@/lib/api-client";
import { useState, useEffect } from "react";
import { CommentSection } from "@/components/comments/comment-section";
import {
  useComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
} from "@/hooks/use-comments";
import Image from "next/image";

interface SubMilestone {
  id: string;
  title?: string;
  description: string;
  detailedDescription?: string;
  acceptanceCriteria: string[];
  technicalRequirements: string[];
  suggestedFiles: string[];
  referenceLinks: Array<{ url: string; title: string }>;
  referenceImages: Array<{ url: string; key: string; filename: string }>;
  taskType?: string;
  points: number;
  estimateHours?: number;
  checkpointAmount: string;
  status: string;
  milestone: {
    id: string;
    title: string;
    project: {
      id: string;
      title: string;
    };
  };
}

export default function ContributorSubmilestoneDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [submilestone, setSubmilestone] = useState<SubMilestone | null>(null);
  const [loading, setLoading] = useState(true);

  // Comments
  const { data: comments = [], isLoading: commentsLoading } = useComments(
    params.submilestoneId as string
  );
  const createComment = useCreateComment(params.submilestoneId as string);
  const updateComment = useUpdateComment(params.submilestoneId as string);
  const deleteComment = useDeleteComment(params.submilestoneId as string);

  useEffect(() => {
    const loadSubmilestone = async () => {
      try {
        const response = await apiClient.get(
          `/api/milestones/submilestone/${params.submilestoneId}`
        );
        setSubmilestone(response.data);
      } catch (error) {
        console.error("Failed to load submilestone:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSubmilestone();
  }, [params.submilestoneId]);

  if (loading) {
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

  if (!submilestone) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center min-h-screen">
            <Card>
              <CardContent className="py-12 px-8">
                <div className="text-center">
                  <h3 className="text-lg font-semibold">
                    Submilestone not found
                  </h3>
                  <Button
                    onClick={() => router.back()}
                    className="mt-4"
                    variant="outline"
                  >
                    Go Back
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
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
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
                <BreadcrumbLink
                  href={`/contributor/projects/${submilestone.milestone.project.id}`}
                >
                  {submilestone.milestone.project.title}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {submilestone.title || submilestone.description}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6 max-w-6xl mx-auto w-full">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">
                  {submilestone.taskType || "FEATURE"}
                </Badge>
                <Badge
                  variant={
                    submilestone.status === "COMPLETED"
                      ? "default"
                      : submilestone.status === "IN_PROGRESS"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {submilestone.status}
                </Badge>
              </div>
              <h1 className="text-3xl font-bold">
                {submilestone.title || "Submilestone Details"}
              </h1>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#111111] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <DollarSign className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Reward</p>
                    <p className="text-lg font-semibold">
                      {submilestone.checkpointAmount} USDC
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111111] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Clock className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Estimated Hours
                    </p>
                    <p className="text-lg font-semibold">
                      {submilestone.estimateHours || "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-[#111111] border-white/5">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <ListChecks className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Points</p>
                    <p className="text-lg font-semibold">
                      {submilestone.points}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          {submilestone.description && (
            <Card className="bg-[#111111] border-white/5">
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {submilestone.description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Detailed Description */}
          {submilestone.detailedDescription && (
            <Card className="bg-[#111111] border-white/5">
              <CardHeader>
                <CardTitle>Detailed Description</CardTitle>
                <CardDescription>
                  Complete implementation details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {submilestone.detailedDescription}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Acceptance Criteria */}
          {submilestone.acceptanceCriteria &&
            submilestone.acceptanceCriteria.length > 0 && (
              <Card className="bg-[#111111] border-white/5">
                <CardHeader>
                  <CardTitle>Acceptance Criteria</CardTitle>
                  <CardDescription>
                    Requirements that must be met
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {submilestone.acceptanceCriteria.map((criterion, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span>{criterion}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

          {/* Technical Requirements */}
          {submilestone.technicalRequirements &&
            submilestone.technicalRequirements.length > 0 && (
              <Card className="bg-[#111111] border-white/5">
                <CardHeader>
                  <CardTitle>Technical Requirements</CardTitle>
                  <CardDescription>Technical specifications</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {submilestone.technicalRequirements.map((req, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-green-500 mt-1">•</span>
                        <span>{req}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

          {/* Suggested Files */}
          {submilestone.suggestedFiles &&
            submilestone.suggestedFiles.length > 0 && (
              <Card className="bg-[#111111] border-white/5">
                <CardHeader>
                  <CardTitle>Suggested Files</CardTitle>
                  <CardDescription>
                    Files you may need to modify
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {submilestone.suggestedFiles.map((file, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 font-mono text-sm bg-[#0A0A0A] p-2 rounded"
                      >
                        <span>{file}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

          {/* Reference Links */}
          {submilestone.referenceLinks &&
            submilestone.referenceLinks.length > 0 && (
              <Card className="bg-[#111111] border-white/5">
                <CardHeader>
                  <CardTitle>Reference Links</CardTitle>
                  <CardDescription>Helpful resources</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {submilestone.referenceLinks.map((link, index) => (
                      <a
                        key={index}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-500 hover:underline"
                      >
                        <span>{link.title || link.url}</span>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Reference Images */}
          {submilestone.referenceImages &&
            submilestone.referenceImages.length > 0 && (
              <Card className="bg-[#111111] border-white/5">
                <CardHeader>
                  <CardTitle>Reference Images</CardTitle>
                  <CardDescription>Visual references</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {submilestone.referenceImages.map((img, index) => (
                      <div key={index} className="relative aspect-video">
                        <Image
                          src={img.url}
                          alt={img.filename}
                          fill
                          className="object-cover rounded-lg"
                        />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Comments Section */}
          <CommentSection
            comments={comments}
            currentUserId={user?.id}
            onAddComment={async (content) => {
              await createComment.mutateAsync(content);
            }}
            onEditComment={async (commentId, content) => {
              await updateComment.mutateAsync({ commentId, content });
            }}
            onDeleteComment={async (commentId) => {
              await deleteComment.mutateAsync(commentId);
            }}
            isLoading={commentsLoading}
          />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
