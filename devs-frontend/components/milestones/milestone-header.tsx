"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Milestone } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Wallet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface MilestoneHeaderProps {
  milestone: Milestone;
  isOpen: boolean;
  onToggle: () => void;
  onUpdate?: (milestoneId: string, data: Partial<Milestone>) => void;
}

export function MilestoneHeader({
  milestone,
  isOpen,
  onToggle,
  onUpdate,
}: MilestoneHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(milestone.title);

  const handleSave = () => {
    if (editedTitle.trim() && editedTitle !== milestone.title) {
      onUpdate?.(milestone.id, { title: editedTitle });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditedTitle(milestone.title);
      setIsEditing(false);
    }
  };

  const subMilestones = milestone.subMilestones || [];
  const completedCount = subMilestones.filter(
    (sm) => sm.status === "COMPLETED"
  ).length;
  const totalCount = subMilestones.length;

  return (
    <div
      onClick={onToggle}
      className="group flex items-center gap-4 p-4 cursor-pointer select-none hover:bg-white/5 transition-colors"
    >
      {/* Expand Arrow */}
      <motion.div
        animate={{ rotate: isOpen ? 90 : 0 }}
        transition={{ duration: 0.2 }}
        className="text-muted-foreground group-hover:text-white transition-colors"
      >
        <ChevronRight className="h-5 w-5" />
      </motion.div>

      {/* Folder Icon */}
      <div className="shrink-0">
        {isOpen ? (
          <FolderOpen className="h-5 w-5 text-blue-500" />
        ) : (
          <Folder className="h-5 w-5 text-muted-foreground group-hover:text-blue-400 transition-colors" />
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 grid gap-1">
        <div className="flex items-center gap-3">
          {isEditing ? (
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              className="h-8 text-lg font-semibold bg-background/50"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <h3
              className="text-lg font-semibold text-white/90 truncate group-hover:text-white transition-colors"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              {milestone.title}
            </h3>
          )}

          <Badge
            variant={milestone.status === "COMPLETED" ? "default" : "outline"}
            className={cn(
              "ml-2 text-xs font-normal",
              milestone.status === "IN_PROGRESS" &&
                "border-blue-500/30 text-blue-400 bg-blue-500/10"
            )}
          >
            {milestone.status.replace("_", " ")}
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="truncate max-w-[400px]">
            {milestone.description}
          </span>
          <span className="w-1 h-1 rounded-full bg-white/20" />
          <span
            className={cn(
              completedCount === totalCount && totalCount > 0
                ? "text-green-400"
                : ""
            )}
          >
            {completedCount} of {totalCount} completed
          </span>
          {milestone.points && (
            <>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="flex items-center gap-1 text-white/70">
                <Wallet className="h-3 w-3" />
                {milestone.points} pts
              </span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            // Add sub-milestone logic
          }}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Task
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              Rename Milestone
            </DropdownMenuItem>
            <DropdownMenuItem>Edit Description</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Delete Milestone
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
