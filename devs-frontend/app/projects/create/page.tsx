"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateProject, useGenerateMilestones } from "@/hooks/use-projects";
import { useOrganizations } from "@/hooks/use-organizations";
import { useGitHubAppStatus, useGitHubRepositories } from "@/hooks/use-github";
import { useCurrentUser } from "@/hooks/use-auth";
import {
  CreateProjectRequest,
  GenerateMilestonesRequest,
  RepoType,
  UserRole,
} from "@/lib/types";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Lock,
  Globe,
  Users,
  CalendarDays,
  AlertCircle,
} from "lucide-react";
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
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RoleGuard } from "@/components/role-guard";

function CreateProjectContent() {
  const router = useRouter();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<CreateProjectRequest>();
  const createProject = useCreateProject();
  const generateMilestones = useGenerateMilestones();
  const { data: organizations } = useOrganizations();
  const { data: githubAppStatus } = useGitHubAppStatus();
  const { data: githubRepos, isLoading: isLoadingRepos } =
    useGitHubRepositories();

  const [isCreating, setIsCreating] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedOrgId = watch("orgId");

  // Check if user has sponsor role
  const hasRequiredRole =
    currentUser?.role === UserRole.SPONSOR ||
    currentUser?.role === UserRole.ADMIN;

  const onSubmit = async (data: CreateProjectRequest) => {
    try {
      // Check role before submitting
      if (!hasRequiredRole) {
        toast.error(
          "Only sponsors can create projects. Please complete onboarding and select the SPONSOR role."
        );
        router.push("/onboarding");
        return;
      }

      // Validate that organization is selected
      if (!data.orgId) {
        toast.error("Please select an organization");
        return;
      }

      setIsCreating(true);
      const project = await createProject.mutateAsync(data);
      setCreatedProjectId(project.id);
      toast.success("Project created successfully!");
      setShowAIPrompt(true);
    } catch (error: unknown) {
      console.error("Failed to create project:", error);

      // Handle 403 errors specifically
      if (error && typeof error === "object" && "response" in error) {
        const axiosError = error as {
          response?: { status?: number; data?: { message?: string } };
        };
        if (axiosError.response?.status === 403) {
          toast.error(
            "You need the SPONSOR role to create projects. Please update your role in settings or complete onboarding."
          );
          router.push("/onboarding");
          return;
        }
      }

      const errorMessage =
        typeof error === "string"
          ? error
          : (error &&
              typeof error === "object" &&
              "response" in error &&
              (error as { response?: { data?: { message?: string } } }).response
                ?.data?.message) ||
            (error &&
              typeof error === "object" &&
              "message" in error &&
              (error as { message?: string }).message) ||
            "Failed to create project. Please try again.";
      toast.error(String(errorMessage));
    } finally {
      setIsCreating(false);
    }
  };

  const handleGenerateMilestones = async () => {
    if (!createdProjectId || !aiPrompt) return;

    try {
      setIsGenerating(true);
      const data: GenerateMilestonesRequest = {
        prompt: aiPrompt,
      };
      await generateMilestones.mutateAsync({
        projectId: createdProjectId,
        data,
      });
      toast.success(
        "AI milestone generation started! This may take a few moments."
      );
      // Redirect to project page instead of milestones-preview (which might not exist yet)
      router.push(`/projects/${createdProjectId}`);
    } catch (error: unknown) {
      console.error("Failed to generate milestones:", error);
      const errorMessage =
        typeof error === "string"
          ? error
          : (error &&
              typeof error === "object" &&
              "response" in error &&
              (error as { response?: { data?: { message?: string } } }).response
                ?.data?.message) ||
            (error &&
              typeof error === "object" &&
              "message" in error &&
              (error as { message?: string }).message) ||
            "Failed to generate milestones. Please try again.";
      toast.error(String(errorMessage));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSkipAI = () => {
    if (createdProjectId) {
      router.push(`/projects/${createdProjectId}`);
    }
  };

  if (showAIPrompt && createdProjectId) {
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
                  <BreadcrumbPage>Generate Milestones</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
            <div className="max-w-3xl mx-auto w-full space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-primary" />
                    Generate Milestones with AI
                  </CardTitle>
                  <CardDescription>
                    Describe your project requirements and let AI create a
                    detailed milestone structure
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="aiPrompt">Project Requirements</Label>
                    <Textarea
                      id="aiPrompt"
                      placeholder="Describe what you want to build, key features, technology stack, and any specific requirements..."
                      rows={8}
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      Be as detailed as possible for better milestone generation
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={handleGenerateMilestones}
                      disabled={!aiPrompt || isGenerating}
                      className="flex-1"
                      size="lg"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating Milestones...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Milestones
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSkipAI}
                      disabled={isGenerating}
                      size="lg"
                    >
                      Skip for Now
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
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
                <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Create Project</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          <div className="max-w-3xl mx-auto w-full space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Create New Project
              </h1>
              <p className="text-muted-foreground mt-1">
                Set up a new project to start accepting contributions
              </p>
            </div>

            {/* Show warning if user doesn't have sponsor role */}
            {!isLoadingUser && currentUser && !hasRequiredRole && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Role Required</AlertTitle>
                <AlertDescription>
                  You need the SPONSOR role to create projects.
                  {!currentUser.onboardingCompleted ? (
                    <>
                      {" "}
                      Please{" "}
                      <Button
                        variant="link"
                        className="p-0 h-auto font-normal underline"
                        onClick={() => router.push("/onboarding")}
                      >
                        complete onboarding
                      </Button>{" "}
                      and select the SPONSOR role.
                    </>
                  ) : (
                    <>
                      {" "}
                      Please update your role in{" "}
                      <Button
                        variant="link"
                        className="p-0 h-auto font-normal underline"
                        onClick={() => router.push("/settings")}
                      >
                        settings
                      </Button>
                      .
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
                <CardDescription>
                  Provide basic information about your project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="title">Project Title *</Label>
                    <Input
                      id="title"
                      placeholder="My Awesome Project"
                      {...register("title", { required: "Title is required" })}
                    />
                    {errors.title && (
                      <p className="text-sm text-destructive">
                        {errors.title.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description *</Label>
                    <Textarea
                      id="description"
                      placeholder="Describe your project, its goals, and what you're looking to achieve..."
                      rows={6}
                      {...register("description", {
                        required: "Description is required",
                      })}
                    />
                    {errors.description && (
                      <p className="text-sm text-destructive">
                        {errors.description.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="repositoryUrl">Repository</Label>
                    {isLoadingRepos ? (
                      <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          Loading repositories...
                        </span>
                      </div>
                    ) : githubAppStatus?.isConfigured &&
                      githubRepos?.repositories &&
                      githubRepos.repositories.length > 0 ? (
                      <Select
                        onValueChange={(value) =>
                          setValue("repositoryUrl", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a repository" />
                        </SelectTrigger>
                        <SelectContent>
                          {githubRepos.repositories.map((repo) => (
                            <SelectItem key={repo.id} value={repo.htmlUrl}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {repo.fullName}
                                </span>
                                {repo.private && (
                                  <Lock className="w-3 h-3 text-muted-foreground" />
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                          <span className="text-sm text-muted-foreground">
                            {githubAppStatus?.isConfigured
                              ? "No GitHub App installations found"
                              : "GitHub App not configured"}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            // Get JWT token from localStorage
                            const token = localStorage.getItem("jwt_token");
                            if (!token) {
                              toast.error(
                                "Please login first to install GitHub App"
                              );
                              return;
                            }

                            // Use backend install endpoint with auth token
                            const installUrl = `${
                              process.env.NEXT_PUBLIC_API_URL
                            }/api/github/install?organizationId=${
                              selectedOrgId || ""
                            }&token=${token}`;
                            window.location.href = installUrl;
                          }}
                        >
                          Install Evolvx-Ai GitHub App
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {isLoadingRepos
                        ? "Fetching your repositories from GitHub..."
                        : githubAppStatus?.isConfigured &&
                          githubRepos?.repositories &&
                          githubRepos.repositories.length > 0
                        ? "Select a repository from your GitHub App installations"
                        : "Install the GitHub App to access your repositories"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tokenNetwork">Select Token *</Label>
                    <Select
                      defaultValue="arbitrum"
                      onValueChange={(value: "base" | "polygon" | "arbitrum") =>
                        setValue("tokenNetwork", value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select token" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="arbitrum">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">Arbitrum</div>
                          </div>
                        </SelectItem>
                        <SelectItem value="base">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">Base</div>
                          </div>
                        </SelectItem>
                        <SelectItem value="polygon">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">Polygon</div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose the token for payments. Supported chains: Base,
                      Polygon, Arbitrum (default)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="repoType">Repository Access Type *</Label>
                    <Select
                      defaultValue={RepoType.PUBLIC}
                      onValueChange={(value) =>
                        setValue("repoType", value as RepoType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select access type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={RepoType.PUBLIC}>
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4" />
                            <div>
                              <div className="font-medium">Public</div>
                              <div className="text-xs text-muted-foreground">
                                Anyone can view and contribute
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value={RepoType.PRIVATE}>
                          <div className="flex items-center gap-2">
                            <Lock className="w-4 h-4" />
                            <div>
                              <div className="font-medium">Private</div>
                              <div className="text-xs text-muted-foreground">
                                Only invited members can access
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value={RepoType.PRIVATE_INVITE}>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <div>
                              <div className="font-medium">
                                Private (Invite Only)
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Sponsor must invite contributors
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value={RepoType.PRIVATE_REQUEST}>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            <div>
                              <div className="font-medium">
                                Private (Join Request)
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Contributors can request to join
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value={RepoType.OPEN_EVENT}>
                          <div className="flex items-center gap-2">
                            <CalendarDays className="w-4 h-4" />
                            <div>
                              <div className="font-medium">Open Event</div>
                              <div className="text-xs text-muted-foreground">
                                Time-limited public project
                              </div>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose how contributors can access your project repository
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="orgId">Organization *</Label>
                    {organizations && organizations.length > 0 ? (
                      <Select
                        value={selectedOrgId}
                        onValueChange={(value) => setValue("orgId", value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations?.map((org) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 p-3 border rounded-md bg-muted/50">
                          <span className="text-sm text-muted-foreground">
                            No organizations found
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => router.push("/organizations/create")}
                        >
                          Create Organization
                        </Button>
                      </div>
                    )}
                    {errors.orgId && (
                      <p className="text-sm text-destructive">
                        Organization is required
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Projects must belong to an organization
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      disabled={isCreating || !hasRequiredRole || isLoadingUser}
                      className="flex-1"
                      size="lg"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating Project...
                        </>
                      ) : (
                        "Create Project"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.back()}
                      disabled={isCreating}
                      size="lg"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function CreateProjectPage() {
  return (
    <RoleGuard allowedRoles={[UserRole.SPONSOR, UserRole.ADMIN]}>
      <CreateProjectContent />
    </RoleGuard>
  );
}
