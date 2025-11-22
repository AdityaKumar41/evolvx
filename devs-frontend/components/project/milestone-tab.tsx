"use client";

import { useMemo } from "react";
import { Milestone, SubMilestone, MilestoneStatus } from "@/lib/types";
import Plan, { Task } from "@/components/ui/agent-plan";
import { ProjectAIAssistant } from "@/components/ai/project-ai-assistant";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import type {
  MilestoneGenerationProgress,
  StreamedMilestone,
} from "@/hooks/use-ai-milestone-generation";

interface MilestoneTabProps {
  milestones: Milestone[];
  projectId: string;
  projectName?: string;
  isLoading?: boolean;
  progress?: MilestoneGenerationProgress | null;
  streamedMilestones?: StreamedMilestone[];
  isGenerating?: boolean;
  onMilestoneUpdate?: (milestoneId: string, data: Partial<Milestone>) => void;
  onSubMilestoneUpdate?: (
    subMilestoneId: string,
    data: Partial<SubMilestone>
  ) => void;
  onSubMilestoneClick?: (milestoneId: string, subMilestoneId: string) => void;
  onGenerateMilestones?: (prompt: string, attachments?: File[]) => void;
}

export function MilestoneTab({
  milestones,
  projectId,
  projectName,
  isLoading,
  progress,
  streamedMilestones = [],
  isGenerating,
}: MilestoneTabProps) {
  const hasMilestones = milestones && milestones.length > 0;
  const hasStreamedMilestones = streamedMilestones.length > 0;

  const tasks: Task[] = useMemo(() => {
    if (!milestones) return [];

    const mapStatus = (status: MilestoneStatus): string => {
      switch (status) {
        case MilestoneStatus.COMPLETED:
          return "completed";
        case MilestoneStatus.IN_PROGRESS:
          return "in-progress";
        case MilestoneStatus.CLAIMED:
          return "in-progress";
        case MilestoneStatus.RESCOPED:
          return "need-help";
        case MilestoneStatus.OPEN:
        default:
          return "pending";
      }
    };

    return milestones.map((m) => ({
      id: m.id,
      title: m.title,
      description: m.description,
      status: mapStatus(m.status),
      priority: "medium",
      level: 0,
      dependencies: [],
      subtasks: (m.subMilestones || []).map((sm) => ({
        id: sm.id,
        title:
          sm.description.split("\n")[0].substring(0, 60) +
          (sm.description.length > 60 ? "..." : ""),
        description: sm.description,
        status: mapStatus(sm.status),
        priority: "medium",
        tools: [],
      })),
    }));
  }, [milestones]);

  // Split Layout - AI Assistant on left, content on right
  return (
    <div className="flex h-full gap-6 relative">
      {/* Left Sidebar - AI Assistant */}
      <div className="hidden md:block w-[400px] shrink-0">
        <ProjectAIAssistant
          projectId={projectId}
          projectName={projectName}
          className="h-[calc(100vh-12rem)] sticky top-4"
        />
      </div>

      {/* Mobile AI Assistant - Bottom Sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg">
        <ProjectAIAssistant
          projectId={projectId}
          projectName={projectName}
          className="h-[50vh]"
        />
      </div>

      {/* Right Side - Content */}
      <div className="flex-1 overflow-y-auto pb-[50vh] md:pb-0">
        {/* Perplexity-Style Generation Progress */}
        {isGenerating && progress && (
          <div className="mb-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Progress Header */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                </div>
                <div
                  className="absolute inset-0 rounded-full bg-primary/20 animate-ping"
                  style={{ animationDuration: "2s" }}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className="text-sm font-medium">Generating Milestones</h3>
                  <span className="text-xs text-muted-foreground tabular-nums font-mono">
                    {progress.progress || 0}%
                  </span>
                </div>
                <div className="w-full bg-secondary/50 rounded-full h-1 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${progress.progress || 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Current Status */}
            <div className="pl-11 space-y-2">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {progress.message}
              </p>
              {hasStreamedMilestones && (
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {streamedMilestones.length}
                    </span>{" "}
                    milestone{streamedMilestones.length !== 1 ? "s" : ""}{" "}
                    generated
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Streaming Milestones Preview */}
        {hasStreamedMilestones && isGenerating && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2 pl-11">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground font-medium">
                PREVIEW
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {streamedMilestones.map((milestone, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.05 }}
                  className="group"
                >
                  <div className="relative pl-11">
                    {/* Timeline dot */}
                    <div className="absolute left-3 top-2 w-2 h-2 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />

                    {/* Card */}
                    <div className="rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-4 hover:border-primary/30 hover:bg-card/80 transition-all">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h4 className="font-medium text-sm flex-1 leading-snug">
                          {milestone.title}
                        </h4>
                        {milestone.reward && (
                          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                            {milestone.reward} pts
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
                        {milestone.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {milestone.subMilestones &&
                          milestone.subMilestones.length > 0 && (
                            <span className="flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-current" />
                              <span className="font-medium text-foreground">
                                {milestone.subMilestones.length}
                              </span>{" "}
                              task
                              {milestone.subMilestones.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        {milestone.estimatedDays && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-current" />
                            <span className="font-medium text-foreground">
                              ~{milestone.estimatedDays}
                            </span>{" "}
                            day{milestone.estimatedDays !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {isLoading && !hasMilestones ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center h-full py-20 space-y-4"
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground animate-pulse">
                Loading milestones...
              </p>
            </motion.div>
          ) : hasMilestones ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="h-full"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">
                  Project Milestones
                </h2>
                <p className="text-muted-foreground">
                  Review and manage your project roadmap.
                </p>
              </div>

              <Plan initialTasks={tasks} />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full py-20 space-y-4 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No milestones yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Use the Evolvx Assistant on the left to generate milestones
                  from your project requirements
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
