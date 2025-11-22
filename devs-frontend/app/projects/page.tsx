"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProjects } from "@/hooks/use-projects";
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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  FolderKanban,
  DollarSign,
  GitBranch,
  Plus,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ProjectsPage() {
  const router = useRouter();
  const { data: projects, isLoading } = useProjects();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = projects?.filter(
    (project) =>
      project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                <BreadcrumbPage>Projects</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => router.push("/projects/create")} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Browse Projects
            </h1>
            <p className="text-muted-foreground mt-1">
              Find projects to contribute to and earn rewards
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Browse Projects
            </h1>
            <p className="text-muted-foreground mt-1">
              Find projects to contribute to and earn rewards
            </p>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Projects Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
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
          ) : filteredProjects && filteredProjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project) => (
                <Card
                  key={project.id}
                  className="hover:border-primary cursor-pointer transition-all hover:shadow-lg"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="line-clamp-1">
                          {project.title}
                        </CardTitle>
                        <CardDescription className="line-clamp-2 mt-1">
                          {project.description}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="ml-2">
                        {project.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {project.description}
                    </p>

                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <FolderKanban className="w-4 h-4 text-muted-foreground" />
                        <span>
                          {project._count?.milestones || 0} milestones
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <GitBranch className="w-4 h-4 text-muted-foreground" />
                        <span>
                          {project._count?.contributions || 0} contributors
                        </span>
                      </div>
                    </div>

                    {project.budget && (
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <DollarSign className="w-4 h-4" />
                        <span>Budget: ${project.budget}</span>
                      </div>
                    )}

                    <Button className="w-full" variant="outline">
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-2">
                  <FolderKanban className="w-12 h-12 mx-auto text-muted-foreground" />
                  <h3 className="text-lg font-semibold">No projects found</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? "Try adjusting your search query"
                      : "No active projects available at the moment"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
