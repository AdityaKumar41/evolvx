"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
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
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Upload,
  Link2,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

export default function SubMilestonePage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const milestoneId = params.milestoneId as string;
  const subId = params.subId as string;

  // Mock data - replace with actual API call
  const [subMilestone, setSubMilestone] = useState({
    id: subId,
    description: "Create Header Layout Component",
    status: "OPEN",
    points: 5,
    taskType: "ui",
    attachments: [] as any[],
    acceptanceCriteria: "Must be responsive and match design specs",
  });

  const [points, setPoints] = useState(subMilestone.points);
  const [attachmentType, setAttachmentType] = useState<"image" | "link">(
    "image"
  );
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const handlePointsUpdate = () => {
    setSubMilestone((prev) => ({ ...prev, points }));
    toast.success("Points updated successfully");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      // TODO: Implement actual file upload
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const newAttachment = {
        id: Date.now().toString(),
        type: "image",
        url: URL.createObjectURL(files[0]),
        name: files[0].name,
      };
      setSubMilestone((prev) => ({
        ...prev,
        attachments: [...prev.attachments, newAttachment],
      }));
      toast.success("Image uploaded successfully");
    } catch (error) {
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) {
      toast.error("Please enter a valid URL");
      return;
    }

    const newAttachment = {
      id: Date.now().toString(),
      type: "link",
      url: linkUrl,
      name: linkUrl,
    };
    setSubMilestone((prev) => ({
      ...prev,
      attachments: [...prev.attachments, newAttachment],
    }));
    setLinkUrl("");
    toast.success("Link added successfully");
  };

  const handleRemoveAttachment = (attachmentId: string) => {
    setSubMilestone((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((a: any) => a.id !== attachmentId),
    }));
    toast.success("Attachment removed");
  };

  const handleClaimTask = () => {
    toast.success("Task claimed successfully!");
    setSubMilestone((prev) => ({ ...prev, status: "IN_PROGRESS" }));
  };

  const getStatusIcon = () => {
    switch (subMilestone.status) {
      case "COMPLETED":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "IN_PROGRESS":
        return <Clock className="h-5 w-5 text-blue-500" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

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
                <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}`}>
                  Project
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/projects/${projectId}#milestones`}>
                  Milestones
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Sub-milestone</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>

          <div className="grid gap-6">
            {/* Main Info Card */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      {getStatusIcon()}
                      <CardTitle className="text-2xl">
                        {subMilestone.description}
                      </CardTitle>
                    </div>
                    <CardDescription>
                      Task Type:{" "}
                      {subMilestone.taskType?.toUpperCase() || "GENERAL"}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      subMilestone.status === "COMPLETED"
                        ? "default"
                        : subMilestone.status === "IN_PROGRESS"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {subMilestone.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Points */}
                <div className="space-y-2">
                  <Label htmlFor="points">Points</Label>
                  <div className="flex gap-2">
                    <Input
                      id="points"
                      type="number"
                      value={points}
                      onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                      className="w-32"
                    />
                    <Button onClick={handlePointsUpdate}>Update</Button>
                  </div>
                </div>

                {/* Acceptance Criteria */}
                {subMilestone.acceptanceCriteria && (
                  <div className="space-y-2">
                    <Label>Acceptance Criteria</Label>
                    <Textarea
                      value={subMilestone.acceptanceCriteria}
                      readOnly
                      className="min-h-20"
                    />
                  </div>
                )}

                {/* Action Button */}
                {subMilestone.status === "OPEN" && (
                  <Button
                    onClick={handleClaimTask}
                    size="lg"
                    className="w-full"
                  >
                    Claim This Task
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Attachments Card */}
            <Card>
              <CardHeader>
                <CardTitle>Attachments & References</CardTitle>
                <CardDescription>
                  Add images or links to reference materials
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add Attachment Controls */}
                <div className="flex gap-2">
                  <Button
                    variant={attachmentType === "image" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAttachmentType("image")}
                  >
                    <ImageIcon className="h-4 w-4 mr-2" />
                    Image
                  </Button>
                  <Button
                    variant={attachmentType === "link" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAttachmentType("link")}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Link
                  </Button>
                </div>

                {attachmentType === "image" ? (
                  <div>
                    <Label htmlFor="file-upload">
                      <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent transition-colors">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PNG, JPG up to 10MB
                        </p>
                      </div>
                    </Label>
                    <Input
                      id="file-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter URL..."
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                    />
                    <Button onClick={handleAddLink}>Add</Button>
                  </div>
                )}

                {/* Attachments List */}
                {subMilestone.attachments.length > 0 && (
                  <div className="space-y-2">
                    <Label>Uploaded References</Label>
                    <div className="grid gap-2">
                      {subMilestone.attachments.map((attachment: any) => (
                        <div
                          key={attachment.id}
                          className="flex items-center gap-2 p-2 border rounded-lg"
                        >
                          {attachment.type === "image" ? (
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Link2 className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="flex-1 text-sm truncate">
                            {attachment.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleRemoveAttachment(attachment.id)
                            }
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reference UI Section (for UI tasks) */}
                {subMilestone.taskType === "ui" && (
                  <div className="mt-6 p-4 border rounded-lg bg-muted/30">
                    <h4 className="font-semibold mb-2">Reference UI</h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload screenshots or design files that show the expected
                      UI
                    </p>
                    {subMilestone.attachments.filter(
                      (a: any) => a.type === "image"
                    ).length === 0 && (
                      <p className="text-sm text-muted-foreground italic">
                        No reference images uploaded yet
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
