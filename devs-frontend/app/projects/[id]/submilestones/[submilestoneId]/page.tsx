"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Save,
  Link as LinkIcon,
  X,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/components/auth-provider";
import { CommentSection } from "@/components/comments/comment-section";
import {
  useComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
} from "@/hooks/use-comments";

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
      sponsorId: string;
    };
  };
}

export default function SubMilestoneDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [submilestone, setSubmilestone] = useState<SubMilestone | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Comments
  const { data: comments = [], isLoading: commentsLoading } = useComments(
    params.submilestoneId as string
  );
  const createComment = useCreateComment(params.submilestoneId as string);
  const updateComment = useUpdateComment(params.submilestoneId as string);
  const deleteComment = useDeleteComment(params.submilestoneId as string);

  // Check if user is sponsor
  const isSponsor = submilestone?.milestone?.project?.sponsorId === user?.id;

  // Edit state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [detailedDescription, setDetailedDescription] = useState("");
  const [taskType, setTaskType] = useState("FEATURE");
  const [points, setPoints] = useState(0);
  const [estimateHours, setEstimateHours] = useState(0);
  const [checkpointAmount, setCheckpointAmount] = useState("0");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
  const [technicalRequirements, setTechnicalRequirements] = useState<string[]>(
    []
  );
  const [suggestedFiles, setSuggestedFiles] = useState<string[]>([]);
  const [referenceLinks, setReferenceLinks] = useState<
    Array<{ url: string; title: string }>
  >([]);
  const [referenceImages, setReferenceImages] = useState<
    Array<{ url: string; key: string; filename: string }>
  >([]);

  // New items being added
  const [newCriterion, setNewCriterion] = useState("");
  const [newRequirement, setNewRequirement] = useState("");
  const [newFile, setNewFile] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkTitle, setNewLinkTitle] = useState("");

  const loadSubmilestone = useCallback(async () => {
    try {
      const response = await apiClient.get(
        `/api/milestones/submilestone/${params.submilestoneId}`
      );
      const data = response.data.subMilestone;

      setSubmilestone(data);
      setTitle(data.title || "");
      setDescription(data.description || "");
      setDetailedDescription(data.detailedDescription || "");
      setTaskType(data.taskType || "FEATURE");
      setPoints(data.points || 0);
      setEstimateHours(data.estimateHours || 0);
      setCheckpointAmount(data.checkpointAmount || "0");

      // Parse JSON fields
      setAcceptanceCriteria(
        Array.isArray(data.acceptanceCriteria) ? data.acceptanceCriteria : []
      );
      setTechnicalRequirements(
        Array.isArray(data.technicalRequirements)
          ? data.technicalRequirements
          : []
      );
      setSuggestedFiles(
        Array.isArray(data.suggestedFiles) ? data.suggestedFiles : []
      );
      setReferenceLinks(
        Array.isArray(data.referenceLinks) ? data.referenceLinks : []
      );
      setReferenceImages(
        Array.isArray(data.referenceImages) ? data.referenceImages : []
      );

      setLoading(false);
    } catch (error) {
      console.error("Error loading submilestone:", error);
      toast.error("Failed to load submilestone details");
      setLoading(false);
    }
  }, [params.submilestoneId]);

  useEffect(() => {
    loadSubmilestone();
  }, [loadSubmilestone]);

  const handleSave = async () => {
    if (!submilestone) return;

    setSaving(true);
    try {
      await apiClient.patch(
        `/api/milestones/submilestone/${params.submilestoneId}`,
        {
          title,
          description,
          detailedDescription,
          taskType,
          points,
          estimateHours,
          checkpointAmount,
          acceptanceCriteria,
          technicalRequirements,
          suggestedFiles,
          referenceLinks,
        }
      );

      toast.success("Submilestone updated successfully");
      loadSubmilestone();
    } catch (error) {
      console.error("Error saving submilestone:", error);
      toast.error("Failed to update submilestone");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);

    // Validate file types
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    const invalidFiles = files.filter((f) => !validTypes.includes(f.type));
    if (invalidFiles.length > 0) {
      toast.error(
        `Invalid file type. Please upload images only (JPG, PNG, GIF, WebP)`
      );
      return;
    }

    // Validate file sizes (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    const oversizedFiles = files.filter((f) => f.size > maxSize);
    if (oversizedFiles.length > 0) {
      toast.error(`Some files are too large. Maximum size is 10MB per file.`);
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));

    setUploading(true);
    try {
      console.log(
        "[Image Upload] Uploading files:",
        files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
      );

      const response = await apiClient.post(
        `/api/milestones/submilestone/${params.submilestoneId}/reference-images`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      console.log("[Image Upload] Success:", response.data);
      setReferenceImages(response.data.subMilestone.referenceImages);
      toast.success("Images uploaded successfully");

      // Clear the file input
      e.target.value = "";
    } catch (error) {
      console.error("[Image Upload] Error:", error);
      let errorMessage = "Failed to upload images";
      if (error && typeof error === "object" && "response" in error) {
        const response = (
          error as { response?: { data?: { message?: string } } }
        ).response;
        errorMessage = response?.data?.message || errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast.error(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (imageKey: string) => {
    try {
      await apiClient.delete(
        `/api/milestones/submilestone/${params.submilestoneId}/reference-images`,
        {
          data: { imageKey },
        }
      );

      setReferenceImages(referenceImages.filter((img) => img.key !== imageKey));
      toast.success("Image deleted successfully");
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Failed to delete image");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!submilestone) {
    return <div>Submilestone not found</div>;
  }

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {title || "Submilestone Details"}
            </h1>
            <p className="text-muted-foreground">
              {submilestone.milestone.title} •{" "}
              {submilestone.milestone.project.title}
            </p>
          </div>
        </div>
        {isSponsor && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        )}
      </div>

      <div className="grid gap-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Core details about this submilestone
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter submilestone title"
                disabled={!isSponsor}
              />
            </div>

            <div>
              <Label htmlFor="description">Short Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of the task"
                rows={2}
                disabled={!isSponsor}
              />
            </div>

            <div>
              <Label htmlFor="detailedDescription">Detailed Description</Label>
              <Textarea
                id="detailedDescription"
                value={detailedDescription}
                onChange={(e) => setDetailedDescription(e.target.value)}
                placeholder="Comprehensive description with implementation approach, technical details, and expected outcome"
                rows={6}
                disabled={!isSponsor}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="taskType">Task Type</Label>
                <Select
                  value={taskType}
                  onValueChange={setTaskType}
                  disabled={!isSponsor}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UI">UI</SelectItem>
                    <SelectItem value="CODE">Code</SelectItem>
                    <SelectItem value="FEATURE">Feature</SelectItem>
                    <SelectItem value="BUG">Bug Fix</SelectItem>
                    <SelectItem value="DOCS">Documentation</SelectItem>
                    <SelectItem value="TEST">Testing</SelectItem>
                    <SelectItem value="REFACTOR">Refactor</SelectItem>
                    <SelectItem value="INFRASTRUCTURE">
                      Infrastructure
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="points">Points</Label>
                <Input
                  id="points"
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                  min="1"
                  max="100"
                  disabled={!isSponsor}
                />
              </div>

              <div>
                <Label htmlFor="estimateHours">Estimated Hours</Label>
                <Input
                  id="estimateHours"
                  type="number"
                  value={estimateHours}
                  onChange={(e) =>
                    setEstimateHours(parseInt(e.target.value) || 0)
                  }
                  min="1"
                  disabled={!isSponsor}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="checkpointAmount">
                Checkpoint Amount (Reward)
              </Label>
              <Input
                id="checkpointAmount"
                type="text"
                value={checkpointAmount}
                onChange={(e) => setCheckpointAmount(e.target.value)}
                placeholder="0"
                disabled={!isSponsor}
              />
              <p className="text-xs text-muted-foreground mt-1">
                The reward amount in tokens for completing this submilestone
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Acceptance Criteria */}
        <Card>
          <CardHeader>
            <CardTitle>Acceptance Criteria</CardTitle>
            <CardDescription>
              Specific, testable criteria for completion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {acceptanceCriteria.map((criterion, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-muted rounded-lg"
                >
                  <span className="flex-1">{criterion}</span>
                  {isSponsor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setAcceptanceCriteria(
                          acceptanceCriteria.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {isSponsor && (
              <div className="flex gap-2">
                <Input
                  value={newCriterion}
                  onChange={(e) => setNewCriterion(e.target.value)}
                  placeholder="Add acceptance criterion (e.g., User can successfully login)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newCriterion.trim()) {
                      setAcceptanceCriteria([
                        ...acceptanceCriteria,
                        newCriterion.trim(),
                      ]);
                      setNewCriterion("");
                      toast.success(
                        "Criterion added! Click 'Save Changes' to persist."
                      );
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (newCriterion.trim()) {
                      setAcceptanceCriteria([
                        ...acceptanceCriteria,
                        newCriterion.trim(),
                      ]);
                      setNewCriterion("");
                      toast.success(
                        "Criterion added! Click 'Save Changes' to persist."
                      );
                    }
                  }}
                  disabled={!newCriterion.trim()}
                >
                  Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Technical Requirements */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Requirements</CardTitle>
            <CardDescription>
              Libraries, APIs, tools, or patterns needed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {technicalRequirements.map((req, index) => (
                <Badge key={index} variant="secondary" className="px-3 py-1">
                  {req}
                  {isSponsor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2"
                      onClick={() =>
                        setTechnicalRequirements(
                          technicalRequirements.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </Badge>
              ))}
            </div>

            {isSponsor && (
              <div className="flex gap-2">
                <Input
                  value={newRequirement}
                  onChange={(e) => setNewRequirement(e.target.value)}
                  placeholder="Add technical requirement (e.g., React 18, TypeScript, shadcn/ui)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newRequirement.trim()) {
                      setTechnicalRequirements([
                        ...technicalRequirements,
                        newRequirement.trim(),
                      ]);
                      setNewRequirement("");
                      toast.success(
                        "Requirement added! Click 'Save Changes' to persist."
                      );
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (newRequirement.trim()) {
                      setTechnicalRequirements([
                        ...technicalRequirements,
                        newRequirement.trim(),
                      ]);
                      setNewRequirement("");
                      toast.success(
                        "Requirement added! Click 'Save Changes' to persist."
                      );
                    }
                  }}
                  disabled={!newRequirement.trim()}
                >
                  Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Suggested Files */}
        <Card>
          <CardHeader>
            <CardTitle>Suggested Files</CardTitle>
            <CardDescription>
              Files that may need to be created or modified
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {suggestedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-muted rounded font-mono text-sm"
                >
                  <span className="flex-1">{file}</span>
                  {isSponsor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSuggestedFiles(
                          suggestedFiles.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {isSponsor && (
              <div className="flex gap-2">
                <Input
                  value={newFile}
                  onChange={(e) => setNewFile(e.target.value)}
                  placeholder="Add file path (e.g., src/components/Header.tsx)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newFile.trim()) {
                      setSuggestedFiles([...suggestedFiles, newFile.trim()]);
                      setNewFile("");
                      toast.success(
                        "File added! Click 'Save Changes' to persist."
                      );
                    }
                  }}
                />
                <Button
                  onClick={() => {
                    if (newFile.trim()) {
                      setSuggestedFiles([...suggestedFiles, newFile.trim()]);
                      setNewFile("");
                      toast.success(
                        "File added! Click 'Save Changes' to persist."
                      );
                    }
                  }}
                  disabled={!newFile.trim()}
                >
                  Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reference Links */}
        <Card>
          <CardHeader>
            <CardTitle>Reference Links</CardTitle>
            <CardDescription>
              Useful documentation, examples, or resources
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {referenceLinks.map((link, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-muted rounded-lg"
                >
                  <LinkIcon className="h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">{link.title}</div>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {link.url}
                    </a>
                  </div>
                  {isSponsor && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        const newLinks = referenceLinks.filter(
                          (_, i) => i !== index
                        );
                        setReferenceLinks(newLinks);

                        // Save immediately to database
                        try {
                          await apiClient.patch(
                            `/api/milestones/submilestone/${params.submilestoneId}`,
                            { referenceLinks: newLinks }
                          );
                          toast.success("Reference link removed and saved!");
                        } catch (error) {
                          console.error(
                            "Error removing reference link:",
                            error
                          );
                          toast.error("Failed to remove reference link");
                          // Revert on error
                          setReferenceLinks(referenceLinks);
                        }
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {isSponsor && (
              <div className="space-y-2">
                \n{" "}
                <Input
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  placeholder="Link title (e.g., Material UI Documentation)"
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newLinkTitle.trim()) {
                      // Move focus to URL input
                      const urlInput = document.querySelector<HTMLInputElement>(
                        'input[placeholder*="https://"]'
                      );
                      urlInput?.focus();
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Input
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://example.com/docs"
                    onKeyPress={async (e) => {
                      if (
                        e.key === "Enter" &&
                        newLinkUrl.trim() &&
                        newLinkTitle.trim()
                      ) {
                        const newLinks = [
                          ...referenceLinks,
                          {
                            url: newLinkUrl.trim(),
                            title: newLinkTitle.trim(),
                          },
                        ];
                        setReferenceLinks(newLinks);
                        setNewLinkUrl("");
                        setNewLinkTitle("");

                        // Save immediately to database
                        try {
                          await apiClient.patch(
                            `/api/milestones/submilestone/${params.submilestoneId}`,
                            { referenceLinks: newLinks }
                          );
                          toast.success("Reference link added and saved!");
                        } catch (error) {
                          console.error("Error saving reference link:", error);
                          toast.error("Failed to save reference link");
                          // Revert on error
                          setReferenceLinks(referenceLinks);
                        }
                      }
                    }}
                  />
                  <Button
                    onClick={async () => {
                      if (newLinkUrl.trim() && newLinkTitle.trim()) {
                        const newLinks = [
                          ...referenceLinks,
                          {
                            url: newLinkUrl.trim(),
                            title: newLinkTitle.trim(),
                          },
                        ];
                        setReferenceLinks(newLinks);
                        setNewLinkUrl("");
                        setNewLinkTitle("");

                        // Save immediately to database
                        try {
                          await apiClient.patch(
                            `/api/milestones/submilestone/${params.submilestoneId}`,
                            { referenceLinks: newLinks }
                          );
                          toast.success("Reference link added and saved!");
                        } catch (error) {
                          console.error("Error saving reference link:", error);
                          toast.error("Failed to save reference link");
                          // Revert on error
                          setReferenceLinks(referenceLinks);
                        }
                      } else {
                        toast.error("Please enter both title and URL");
                      }
                    }}
                    disabled={!newLinkUrl.trim() || !newLinkTitle.trim()}
                  >
                    Add Link
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reference Images (UI Mockups) */}
        <Card>
          <CardHeader>
            <CardTitle>Reference Images</CardTitle>
            <CardDescription>
              Upload UI mockups, designs, or visual references
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {referenceImages.map((image, index) => (
                <div
                  key={index}
                  className="relative group rounded-lg overflow-hidden border"
                >
                  <Image
                    src={image.url}
                    alt={image.filename}
                    width={400}
                    height={300}
                    className="w-full h-48 object-cover"
                  />
                  {isSponsor && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteImage(image.key)}
                      >
                        <X className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-xs text-white truncate">
                    {image.filename}
                  </div>
                </div>
              ))}
            </div>

            {isSponsor && (
              <div>
                <Label htmlFor="image-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors">
                    \n{" "}
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <p className="text-sm text-muted-foreground">
                          Uploading images...
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Click to upload images or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG, GIF up to 10MB
                        </p>
                      </div>
                    )}
                  </div>
                  <input
                    id="image-upload"
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                </Label>
              </div>
            )}
          </CardContent>
        </Card>

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
    </div>
  );
}
