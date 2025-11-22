"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useOrganizations } from "@/hooks/use-organizations";
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
import { Plus, Building2, Users, FolderKanban } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function OrganizationsPage() {
  const router = useRouter();
  const { data: organizations, isLoading } = useOrganizations();

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
                <BreadcrumbPage>Organizations</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <Button
              onClick={() => router.push("/organizations/create")}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Organization
            </Button>
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
            <p className="text-muted-foreground mt-1">
              Manage your organizations and team members
            </p>
          </div>

          {/* Organizations Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
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
          ) : organizations && organizations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {organizations.map((org) => (
                <Card
                  key={org.id}
                  className="hover:border-primary cursor-pointer transition-all hover:shadow-lg"
                  onClick={() => router.push(`/organizations/${org.id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {org.logoUrl ? (
                          <Image
                            src={org.logoUrl}
                            alt={org.name}
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                            <Building2 className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <CardTitle className="line-clamp-1 text-lg">
                            {org.name}
                          </CardTitle>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {org.description && (
                      <CardDescription className="line-clamp-2">
                        {org.description}
                      </CardDescription>
                    )}

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>
                          {org._count?.members || 0} member
                          {org._count?.members !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FolderKanban className="w-4 h-4" />
                        <span>
                          {org._count?.projects || 0} project
                          {org._count?.projects !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/organizations/${org.id}`);
                      }}
                    >
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center space-y-4">
                  <div className="flex justify-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
                      <Building2 className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      No organizations yet
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Create your first organization to start managing projects
                      and team members
                    </p>
                  </div>
                  <Button onClick={() => router.push("/organizations/create")}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Organization
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
