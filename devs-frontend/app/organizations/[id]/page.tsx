"use client";

import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import {
  useOrganization,
  useOrganizationMembers,
  useDeleteOrganization,
  useRemoveMember,
} from "@/hooks/use-organizations";
import { useProjects } from "@/hooks/use-projects";
import { AppSidebar } from "@/components/app-sidebar";
import { InviteMemberForm } from "@/components/organization/invite-member-form";
import { PendingInvitesList } from "@/components/organization/pending-invites-list";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, Users, FolderKanban, Plus, Trash2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useState } from "react";
import { toast } from "sonner";

export default function OrganizationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const { data: organization, isLoading } = useOrganization(id);
  const { data: members, isLoading: membersLoading } =
    useOrganizationMembers(id);
  const { data: projects, isLoading: projectsLoading } = useProjects({
    organizationId: id,
  });
  const deleteOrganization = useDeleteOrganization();
  const removeMember = useRemoveMember();

  const handleDelete = async () => {
    try {
      await deleteOrganization.mutateAsync(id);
      toast.success("Organization deleted successfully");
      router.push("/organizations");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to delete organization";
      toast.error(message);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    try {
      await removeMember.mutateAsync({ organizationId: id, memberId });
      toast.success("Member removed successfully");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove member";
      toast.error(message);
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

  if (!organization) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 items-center justify-center">
            <Card>
              <CardContent className="py-12 px-8">
                <div className="text-center space-y-4">
                  <Building2 className="w-16 h-16 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold">
                      Organization not found
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      The organization you&apos;re looking for doesn&apos;t
                      exist.
                    </p>
                  </div>
                  <Button onClick={() => router.push("/organizations")}>
                    Back to Organizations
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
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/organizations">
                  Organizations
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{organization.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          {/* Organization Header */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {organization.logoUrl ? (
                    <Image
                      src={organization.logoUrl}
                      alt={organization.name}
                      width={64}
                      height={64}
                      className="rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <CardTitle className="text-2xl">
                      {organization.name}
                    </CardTitle>
                    {organization.description && (
                      <CardDescription className="mt-2">
                        {organization.description}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Are you absolutely sure?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently
                        delete the organization and remove all associated data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="projects" className="space-y-6">
            <TabsList>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="members">Members</TabsTrigger>
            </TabsList>

            {/* Projects Tab */}
            <TabsContent value="projects" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Projects</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage projects under this organization
                  </p>
                </div>
                <Button
                  onClick={() => router.push("/projects/create")}
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </div>

              {projectsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...Array(2)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : projects && projects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {projects.map((project) => (
                    <Card
                      key={project.id}
                      className="hover:border-primary cursor-pointer transition-all"
                      onClick={() => router.push(`/projects/${project.id}`)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="line-clamp-1">
                            {project.title}
                          </CardTitle>
                          <Badge
                            variant={
                              project.status === "ACTIVE"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {project.status}
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2">
                          {project.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <FolderKanban className="w-4 h-4" />
                            <span>
                              {project._count?.milestones || 0} milestones
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            <span>
                              {project._count?.contributions || 0} contributions
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center space-y-4">
                      <FolderKanban className="w-12 h-12 mx-auto text-muted-foreground" />
                      <div>
                        <h3 className="text-lg font-semibold">
                          No projects yet
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Create your first project to get started
                        </p>
                      </div>
                      <Button onClick={() => router.push("/projects/create")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Project
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Members Tab */}
            <TabsContent value="members" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Members</h3>
                  <p className="text-sm text-muted-foreground">
                    Manage team members and their roles
                  </p>
                </div>
                <InviteMemberForm organizationId={id} />
              </div>

              <div className="mt-6">
                <PendingInvitesList organizationId={id} />
              </div>

              {membersLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="py-6">
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-12 w-12 rounded-full" />
                          <div className="flex-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-48 mt-2" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : members && members.length > 0 ? (
                <div className="space-y-4">
                  {members.map((member) => (
                    <Card key={member.id}>
                      <CardContent className="py-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {member.user.avatarUrl ? (
                              <Image
                                src={member.user.avatarUrl}
                                alt={member.user.githubUsername}
                                width={48}
                                height={48}
                                className="rounded-full"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                                <Users className="h-6 w-6 text-primary" />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold">
                                {member.user.name || member.user.githubUsername}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                @{member.user.githubUsername}
                                {member.user.email && ` • ${member.user.email}`}
                              </p>
                              <Badge variant="secondary" className="mt-1">
                                {member.role}
                              </Badge>
                            </div>
                          </div>
                          {member.role !== "OWNER" && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Remove member?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove{" "}
                                    {member.user.githubUsername} from the
                                    organization.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      handleRemoveMember(member.id)
                                    }
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12">
                    <div className="text-center space-y-4">
                      <Users className="w-12 h-12 mx-auto text-muted-foreground" />
                      <div>
                        <h3 className="text-lg font-semibold">
                          No members yet
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Invite team members to collaborate
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
