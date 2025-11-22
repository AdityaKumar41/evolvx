"use client";

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
import { useCreateOrganization } from "@/hooks/use-organizations";
import { CreateOrganizationRequest } from "@/lib/types";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useState } from "react";
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

export default function CreateOrganizationPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateOrganizationRequest>();
  const createOrganization = useCreateOrganization();
  const [isCreating, setIsCreating] = useState(false);

  const onSubmit = async (data: CreateOrganizationRequest) => {
    try {
      setIsCreating(true);
      const organization = await createOrganization.mutateAsync(data);
      toast.success("Organization created successfully!");
      router.push(`/organizations/${organization.id}`);
    } catch (error: any) {
      console.error("Failed to create organization:", error);
      const errorMessage =
        error?.message || "Failed to create organization. Please try again.";
      toast.error(errorMessage);
    } finally {
      setIsCreating(false);
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
                <BreadcrumbLink href="/organizations">
                  Organizations
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Create Organization</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          <div className="max-w-2xl mx-auto w-full space-y-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Create Organization
              </h1>
              <p className="text-muted-foreground mt-1">
                Set up a new organization to manage projects and team members
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>
                  Provide information about your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Organization Name *</Label>
                    <Input
                      id="name"
                      placeholder="Acme Corporation"
                      {...register("name", {
                        required: "Organization name is required",
                      })}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description (Optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="Tell us about your organization, its mission, and goals..."
                      rows={6}
                      {...register("description")}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logo URL (Optional)</Label>
                    <Input
                      id="logoUrl"
                      placeholder="https://example.com/logo.png"
                      {...register("logoUrl")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Provide a URL to your organization logo
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      disabled={isCreating}
                      className="flex-1"
                      size="lg"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Create Organization"
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
