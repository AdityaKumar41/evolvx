"use client";

import { Milestone, SubMilestone } from "@/lib/types";
import { MilestoneCard } from "./milestone-card";
import { Card, CardContent } from "@/components/ui/card";
import { FolderKanban, Loader2 } from "lucide-react";

interface MilestoneTreeProps {
  milestones: Milestone[];
  projectId: string;
  isLoading?: boolean;
  onMilestoneUpdate?: (milestoneId: string, data: Partial<Milestone>) => void;
  onSubMilestoneUpdate?: (
    subMilestoneId: string,
    data: Partial<SubMilestone>
  ) => void;
  onSubMilestoneClick?: (milestoneId: string, subMilestoneId: string) => void;
}

export function MilestoneTree({
  milestones,
  // projectId,
  isLoading,
  onMilestoneUpdate,
  onSubMilestoneUpdate,
  onSubMilestoneClick,
}: MilestoneTreeProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!milestones || milestones.length === 0) {
    return (
      <Card className="bg-[#111111] border-white/5">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-12 w-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <FolderKanban className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2 text-white">
            No Milestones Yet
          </h3>
          <p className="text-muted-foreground max-w-sm">
            Create your first milestone to start tracking progress, or use AI to
            generate a plan automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {milestones.map((milestone, index) => (
        <MilestoneCard
          key={milestone.id}
          milestone={milestone}
          defaultOpen={index === 0} // Open first milestone by default
          onUpdate={onMilestoneUpdate}
          onSubMilestoneUpdate={onSubMilestoneUpdate}
          onSubMilestoneClick={onSubMilestoneClick}
        />
      ))}
    </div>
  );
}
