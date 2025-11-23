"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  GitBranch,
  ExternalLink,
  Wallet,
  Activity,
  Settings,
  User,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SubmitToOnchainButton } from "@/components/project/submit-to-onchain-button";

interface OverviewTabProps {
  project: any;
  progress: number;
  completedMilestones: number;
  totalMilestones: number;
}

export function OverviewTab({
  project,
  progress,
  completedMilestones,
  totalMilestones,
}: OverviewTabProps) {
  const router = useRouter();

  // Calculate total milestone rewards
  const totalReward =
    project.milestones?.reduce(
      (sum: number, m: any) => sum + (Number(m.totalReward) || 0),
      0
    ) || 0;

  return (
    <div className="space-y-6">
      {/* Project Header / Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <CardTitle className="text-2xl">{project.title}</CardTitle>
                <Badge
                  variant={
                    project.status === "ACTIVE" ? "default" : "secondary"
                  }
                >
                  {project.status}
                </Badge>
              </div>
              <CardDescription className="text-base">
                {project.description}
              </CardDescription>
            </div>
            {/* Submit to Onchain Button - Only shown for DRAFT projects */}
            <SubmitToOnchainButton
              projectId={project.id}
              projectStatus={project.status}
              totalMilestoneReward={totalReward}
              onSuccess={() => {
                // Refresh page to show updated project status
                router.refresh();
              }}
            />
          </div>
          {project.repositoryUrl && (
            <div className="flex items-center gap-2 mt-4">
              <GitBranch className="w-4 h-4 text-muted-foreground" />
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline flex items-center gap-1"
              >
                {project.repositoryUrl}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Progress</p>
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-sm font-medium">
                  {completedMilestones} / {totalMilestones} milestones completed
                </p>
              </div>
            </div>
            {project.budget && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Budget</p>
                <p className="text-lg font-semibold flex items-center gap-2">
                  <Wallet className="w-5 h-5" />
                  {project.budget}
                </p>
              </div>
            )}
            {project.fundingMode && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Funding Mode</p>
                <Badge variant="outline" className="text-sm">
                  {project.fundingMode}
                </Badge>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Activity Feed */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Placeholder activities */}
              <div className="flex gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-green-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">Project created</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-2 h-2 mt-2 rounded-full bg-blue-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    Status updated to {project.status}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Settings (Editable) */}
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Project Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Project Name</Label>
              <Input id="title" defaultValue={project.title} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" defaultValue={project.description} />
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm">
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sponsor Info */}
      {project.sponsor && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Sponsor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {project.sponsor.avatarUrl && (
                <Image
                  src={project.sponsor.avatarUrl}
                  alt={project.sponsor.githubUsername}
                  width={48}
                  height={48}
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div>
                <p className="font-semibold">
                  {project.sponsor.name || project.sponsor.githubUsername}
                </p>
                <p className="text-sm text-muted-foreground">
                  @{project.sponsor.githubUsername}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
