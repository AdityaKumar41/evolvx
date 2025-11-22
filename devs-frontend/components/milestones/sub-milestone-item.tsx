"use client";

import { useState } from "react";
import { SubMilestone } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  FileText,
  CheckCircle2,
  Circle,
  Clock,
  MoreHorizontal,
  Image as ImageIcon,
  Code,
  Zap,
  Bug,
  BookOpen,
  ArrowRight,
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

interface SubMilestoneItemProps {
  subMilestone: SubMilestone;
  onUpdate?: (subMilestoneId: string, data: Partial<SubMilestone>) => void;
  onClick?: () => void;
}

const getTaskIcon = (taskType?: string) => {
  switch (taskType) {
    case "ui":
      return <ImageIcon className="h-4 w-4 text-purple-400" />;
    case "code":
      return <Code className="h-4 w-4 text-blue-400" />;
    case "feature":
      return <Zap className="h-4 w-4 text-yellow-400" />;
    case "bug":
      return <Bug className="h-4 w-4 text-red-400" />;
    case "docs":
      return <BookOpen className="h-4 w-4 text-green-400" />;
    default:
      return <FileText className="h-4 w-4 text-muted-foreground" />;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "COMPLETED":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "IN_PROGRESS":
      return <Clock className="h-4 w-4 text-blue-500" />;
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/50" />;
  }
};

export function SubMilestoneItem({
  subMilestone,
  onUpdate,
  onClick,
}: SubMilestoneItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(subMilestone.description);

  const handleSave = () => {
    if (editedTitle.trim() && editedTitle !== subMilestone.description) {
      onUpdate?.(subMilestone.id, { description: editedTitle });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditedTitle(subMilestone.description);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 pl-4 rounded-lg border-l-2 border-transparent hover:border-primary/50 hover:bg-white/5 transition-all cursor-pointer",
        subMilestone.status === "COMPLETED" && "opacity-60"
      )}
    >
      {/* Status Icon */}
      <div className="shrink-0">{getStatusIcon(subMilestone.status)}</div>

      {/* Task Type Icon */}
      <div className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
        {getTaskIcon(subMilestone.taskType)}
      </div>

      {/* Title (Editable) */}
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <Input
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="h-7 text-sm bg-background/50"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            onClick={onClick}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
            className={cn(
              "text-sm text-white/90 truncate hover:text-primary transition-colors",
              subMilestone.status === "COMPLETED" &&
                "line-through text-muted-foreground"
            )}
          >
            {subMilestone.description}
          </div>
        )}
      </div>

      {/* Metadata & Actions */}
      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
        {subMilestone.points && (
          <Badge
            variant="secondary"
            className="bg-white/5 hover:bg-white/10 text-xs font-normal"
          >
            {subMilestone.points} pts
          </Badge>
        )}

        {subMilestone.assignedTo ? (
          <Badge
            variant="outline"
            className="text-[10px] h-5 border-white/10 text-muted-foreground"
          >
            Assigned
          </Badge>
        ) : subMilestone.status === "OPEN" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs hover:bg-primary/10 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              // Handle claim logic here or via dropdown
            }}
          >
            Claim
          </Button>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-white"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onClick}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Open Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              Rename Task
            </DropdownMenuItem>
            <DropdownMenuItem>Claim Task</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              Delete Task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
