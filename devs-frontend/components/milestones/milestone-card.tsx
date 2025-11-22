"use client";

import { useState } from "react";
import { Milestone, SubMilestone } from "@/lib/types";
import { MilestoneHeader } from "./milestone-header";
import { MilestoneBody } from "./milestone-body";
import { SubMilestoneItem } from "./sub-milestone-item";
import { cn } from "@/lib/utils";

interface MilestoneCardProps {
  milestone: Milestone;
  defaultOpen?: boolean;
  onUpdate?: (milestoneId: string, data: Partial<Milestone>) => void;
  onSubMilestoneUpdate?: (
    subMilestoneId: string,
    data: Partial<SubMilestone>
  ) => void;
  onSubMilestoneClick?: (milestoneId: string, subMilestoneId: string) => void;
}

export function MilestoneCard({
  milestone,
  defaultOpen = false,
  onUpdate,
  onSubMilestoneUpdate,
  onSubMilestoneClick,
}: MilestoneCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "rounded-xl border border-white/5 bg-[#111111] shadow-sm transition-all duration-200",
        "hover:border-white/10 hover:shadow-md",
        isOpen && "border-white/10 ring-1 ring-white/5"
      )}
    >
      <MilestoneHeader
        milestone={milestone}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        onUpdate={onUpdate}
      />

      <MilestoneBody isOpen={isOpen}>
        <div className="p-2 space-y-1">
          {milestone.subMilestones && milestone.subMilestones.length > 0 ? (
            milestone.subMilestones.map((subMilestone) => (
              <SubMilestoneItem
                key={subMilestone.id}
                subMilestone={subMilestone}
                onUpdate={onSubMilestoneUpdate}
                onClick={() =>
                  onSubMilestoneClick?.(milestone.id, subMilestone.id)
                }
              />
            ))
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No tasks yet. Click &quot;Add Task&quot; to get started.
            </div>
          )}
        </div>
      </MilestoneBody>
    </div>
  );
}
