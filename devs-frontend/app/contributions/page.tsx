"use client";

import { useAuth } from "@/components/auth-provider";
import { useContributions } from "@/hooks/use-contributions";
import { Contribution } from "@/lib/types";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitPullRequest,
  Clock,
  CheckCircle2,
  XCircle,
  DollarSign,
  ExternalLink,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRouter } from "next/navigation";

export default function ContributionsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: contributions, isLoading } = useContributions({
    contributorId: user?.id,
  });

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      {
        variant: "default" | "secondary" | "destructive" | "outline";
        icon: React.ComponentType<{ className?: string }>;
      }
    > = {
      PENDING: { variant: "secondary", icon: Clock },
      APPROVED: { variant: "default", icon: CheckCircle2 },
      REJECTED: { variant: "destructive", icon: XCircle },
      PAID: { variant: "outline", icon: DollarSign },
    };

    const config = statusConfig[status] || statusConfig.PENDING;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

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
                <BreadcrumbPage>My Contributions</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>

        {/* Main Content */}
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              My Contributions
            </h1>
            <p className="text-muted-foreground mt-1">
              Track your pull requests, milestones, and earnings
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : contributions && contributions.length > 0 ? (
            <div className="space-y-4">
              {contributions.map((contribution: Contribution) => (
                <Card key={contribution.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                          <GitPullRequest className="h-5 w-5" />
                          {contribution.subMilestone?.description?.split(
                            "\n"
                          )[0] || "Contribution"}
                        </CardTitle>
                        <CardDescription className="mt-2">
                          Submilestone Contribution
                        </CardDescription>
                      </div>
                      {getStatusBadge(contribution.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Points</p>
                        <p className="font-semibold">
                          {contribution.subMilestone?.points || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-semibold">
                          {contribution.amountPaid || "0"} ETH
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Submitted</p>
                        <p className="font-semibold">
                          {new Date(
                            contribution.createdAt
                          ).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <p className="font-semibold">{contribution.status}</p>
                      </div>
                    </div>

                    {contribution.prUrl && (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={contribution.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2"
                          >
                            <ExternalLink className="h-4 w-4" />
                            View Pull Request
                          </a>
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          router.push(
                            `/projects/detail/submilestones/${contribution.subMilestoneId}`
                          )
                        }
                      >
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 px-8">
                <div className="text-center space-y-4">
                  <GitPullRequest className="w-16 h-16 mx-auto text-muted-foreground" />
                  <div>
                    <h3 className="text-lg font-semibold">
                      No contributions yet
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Browse projects and claim tasks to get started
                    </p>
                  </div>
                  <Button onClick={() => router.push("/projects")}>
                    Browse Projects
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
