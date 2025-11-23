"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  Loader2,
  FileText,
  Github,
  Brain,
  Database,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MilestoneGenerationProgress,
  StreamedMilestone,
} from "@/hooks/use-ai-milestone-generation";

interface MilestoneGenerationProgressDisplayProps {
  progress: MilestoneGenerationProgress | null;
  streamedMilestones: StreamedMilestone[];
  isConnected: boolean;
}

const stageIcons = {
  started: Sparkles,
  "analyzing-documents": FileText,
  "fetching-github": Github,
  "generating-claude": Brain,
  "generating-gpt": Brain,
  saving: Database,
  completed: CheckCircle2,
  error: XCircle,
};

const stageLabels = {
  started: "Initializing",
  "analyzing-documents": "Analyzing Documents",
  "fetching-github": "Fetching GitHub Context",
  "generating-claude": "Generating with Claude",
  "generating-gpt": "Generating with GPT-4o",
  saving: "Saving to Database",
  completed: "Completed",
  error: "Failed",
};

export function MilestoneGenerationProgressDisplay({
  progress,
  streamedMilestones,
  isConnected,
}: MilestoneGenerationProgressDisplayProps) {
  if (!progress) return null;

  const Icon = stageIcons[progress.stage];
  const isError = progress.stage === "error";
  const isCompleted = progress.stage === "completed";
  const isInProgress = !isError && !isCompleted;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {Icon && (
                <Icon
                  className={cn(
                    "h-5 w-5",
                    isError && "text-destructive",
                    isCompleted && "text-green-600",
                    isInProgress && "animate-pulse text-blue-600"
                  )}
                />
              )}
              {stageLabels[progress.stage]}
            </CardTitle>
            <CardDescription>{progress.message}</CardDescription>
          </div>
          {!isConnected && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Circle className="h-3 w-3 fill-yellow-500 text-yellow-500" />
              Connecting...
            </div>
          )}
          {isConnected && isInProgress && (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <>
          {/* Progress bar */}
          {progress.progress !== undefined && (
            <div className="space-y-2">
              <Progress
                value={progress.progress}
                className={cn(
                  "h-2",
                  isError && "bg-destructive/20",
                  isCompleted && "bg-green-100"
                )}
              />
              <p className="text-xs text-muted-foreground text-right">
                {progress.progress}%
              </p>
            </div>
          )}

          {/* Streamed milestones preview */}
          {streamedMilestones.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Generated Milestones ({streamedMilestones.length})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {streamedMilestones.map((milestone, index) => (
                  <Card
                    key={index}
                    className="p-3 bg-linear-to-br from-blue-50 to-purple-50 border-blue-200 animate-in slide-in-from-bottom-4 duration-300"
                  >
                    <h5 className="font-semibold text-sm flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      {milestone.title}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {milestone.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {milestone.reward && (
                        <span className="flex items-center gap-1">
                          <span className="font-semibold text-blue-600">
                            {milestone.reward}
                          </span>
                          points
                        </span>
                      )}
                      {milestone.estimatedDays && (
                        <span>~{milestone.estimatedDays} days</span>
                      )}
                      {milestone.subMilestones && (
                        <span>{milestone.subMilestones.length} tasks</span>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ) : null}

          {/* Completion data */}
          {isCompleted && progress.data && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-green-900">
                    Milestone Generation Completed!
                  </p>
                  <div className="grid grid-cols-3 gap-4 mt-2 text-xs text-green-700">
                    {progress.data.milestonesCount !== undefined && (
                      <div>
                        <p className="font-semibold">
                          {String(progress.data.milestonesCount)}
                        </p>
                        <p className="text-muted-foreground">Milestones</p>
                      </div>
                    )}
                    {progress.data.totalPoints !== undefined && (
                      <div>
                        <p className="font-semibold">
                          {String(progress.data.totalPoints)}
                        </p>
                        <p className="text-muted-foreground">Total Points</p>
                      </div>
                    )}
                    {progress.data.totalEstimatedHours !== undefined && (
                      <div>
                        <p className="font-semibold">
                          {String(progress.data.totalEstimatedHours)}h
                        </p>
                        <p className="text-muted-foreground">Est. Hours</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error state */}
          {isError && progress.data?.error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-destructive">
                    Generation Failed
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {progress.data.error as string}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      </CardContent>
    </Card>
  );
}
