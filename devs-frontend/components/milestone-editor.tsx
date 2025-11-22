"use client";

import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Milestone, SubMilestone, MilestoneStatus } from "@/lib/types";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  GripVertical,
  Save,
  Edit2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MilestoneEditorProps {
  projectId: string;
  initialMilestones?: Milestone[];
  onSave?: (milestones: Milestone[]) => void;
}

interface EditableMilestone extends Milestone {
  isEditing?: boolean;
  isOpen?: boolean;
  submilestones?: EditableSubMilestone[];
}

interface EditableSubMilestone extends Omit<SubMilestone, "milestoneId"> {
  isEditing?: boolean;
  milestoneId?: string;
  label?: string; // Display label for UI
}

function SortableMilestone({
  milestone,
  onUpdate,
  onDelete,
  onAddSubMilestone,
  onUpdateSubMilestone,
  onDeleteSubMilestone,
}: {
  milestone: EditableMilestone;
  onUpdate: (milestone: EditableMilestone) => void;
  onDelete: () => void;
  onAddSubMilestone: () => void;
  onUpdateSubMilestone: (subId: string, sub: EditableSubMilestone) => void;
  onDeleteSubMilestone: (subId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: milestone.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const totalPoints = useMemo(() => {
    return (
      (milestone.submilestones || []).reduce(
        (sum, sub) => sum + (sub.points || 0),
        0
      ) + (milestone.points || 0)
    );
  }, [milestone]);

  const toggleEdit = () => {
    onUpdate({ ...milestone, isEditing: !milestone.isEditing });
  };

  const toggleOpen = () => {
    onUpdate({ ...milestone, isOpen: !milestone.isOpen });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("mb-3", isDragging && "opacity-50")}
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <button
              className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-5 h-5" />
            </button>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-6 w-6"
                onClick={toggleOpen}
              >
                {milestone.isOpen ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <div className="flex-1 space-y-2">
              {milestone.isEditing ? (
                <div className="space-y-2">
                  <Input
                    value={milestone.title}
                    onChange={(e) =>
                      onUpdate({ ...milestone, title: e.target.value })
                    }
                    placeholder="Milestone title"
                  />
                  <Textarea
                    value={milestone.description || ""}
                    onChange={(e) =>
                      onUpdate({ ...milestone, description: e.target.value })
                    }
                    placeholder="Description"
                    rows={2}
                  />
                  <Input
                    type="number"
                    value={milestone.points || 0}
                    onChange={(e) =>
                      onUpdate({
                        ...milestone,
                        points: parseInt(e.target.value) || 0,
                      })
                    }
                    placeholder="Points"
                    className="w-32"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{milestone.title}</CardTitle>
                    <Badge variant="secondary">{totalPoints} points</Badge>
                    {milestone.submilestones &&
                      milestone.submilestones.length > 0 && (
                        <Badge variant="outline">
                          {milestone.submilestones.length} tasks
                        </Badge>
                      )}
                  </div>
                  {milestone.description && (
                    <CardDescription>{milestone.description}</CardDescription>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-1">
              {milestone.isEditing ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleEdit}
                  className="h-8 w-8 p-0"
                >
                  <Check className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleEdit}
                  className="h-8 w-8 p-0"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="h-8 w-8 p-0 text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="pl-8 space-y-2">
              {(milestone.submilestones || []).map((sub) => (
                <SubMilestoneItem
                  key={sub.id}
                  submilestone={sub}
                  onUpdate={(updated) => onUpdateSubMilestone(sub.id, updated)}
                  onDelete={() => onDeleteSubMilestone(sub.id)}
                />
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={onAddSubMilestone}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Task
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </div>
  );
}

function SubMilestoneItem({
  submilestone,
  onUpdate,
  onDelete,
}: {
  submilestone: EditableSubMilestone;
  onUpdate: (sub: EditableSubMilestone) => void;
  onDelete: () => void;
}) {
  const toggleEdit = () => {
    onUpdate({ ...submilestone, isEditing: !submilestone.isEditing });
  };

  return (
    <div className="flex items-start gap-2 p-3 border rounded-lg bg-muted/30">
      <div className="flex-1 space-y-2">
        {submilestone.isEditing ? (
          <>
            <Input
              value={submilestone.label || submilestone.description}
              onChange={(e) =>
                onUpdate({
                  ...submilestone,
                  label: e.target.value,
                  description: e.target.value,
                })
              }
              placeholder="Task label"
            />
            <Textarea
              value={submilestone.description || ""}
              onChange={(e) =>
                onUpdate({ ...submilestone, description: e.target.value })
              }
              placeholder="Detailed description"
              rows={2}
            />
            <Input
              type="number"
              value={submilestone.points || 0}
              onChange={(e) =>
                onUpdate({
                  ...submilestone,
                  points: parseInt(e.target.value) || 0,
                })
              }
              placeholder="Points"
              className="w-32"
            />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <h4 className="font-medium">
                {submilestone.label || submilestone.description}
              </h4>
              {submilestone.points > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {submilestone.points} pts
                </Badge>
              )}
            </div>
            {submilestone.label &&
              submilestone.description &&
              submilestone.label !== submilestone.description && (
                <p className="text-sm text-muted-foreground">
                  {submilestone.description}
                </p>
              )}
          </>
        )}
      </div>
      <div className="flex gap-1">
        {submilestone.isEditing ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleEdit}
            className="h-7 w-7 p-0"
          >
            <Check className="w-3 h-3" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleEdit}
            className="h-7 w-7 p-0"
          >
            <Edit2 className="w-3 h-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="h-7 w-7 p-0 text-destructive"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

export function MilestoneEditor({
  projectId,
  initialMilestones = [],
  onSave,
}: MilestoneEditorProps) {
  const [milestones, setMilestones] = useState<EditableMilestone[]>(
    initialMilestones.map((m) => ({ ...m, isOpen: true }))
  );
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setMilestones((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        setHasChanges(true);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addMilestone = () => {
    const timestamp = Date.now();
    const now = new Date().toISOString();
    const newMilestone: EditableMilestone = {
      id: `temp-${timestamp}`,
      projectId,
      title: "New Milestone",
      description: "",
      status: MilestoneStatus.OPEN,
      points: 0,
      order: milestones.length,
      createdByAI: false,
      createdAt: now,
      updatedAt: now,
      isEditing: true,
      isOpen: true,
      submilestones: [],
    };
    setMilestones([...milestones, newMilestone]);
    setHasChanges(true);
  };

  const updateMilestone = (index: number, updated: EditableMilestone) => {
    const newMilestones = [...milestones];
    newMilestones[index] = updated;
    setMilestones(newMilestones);
    setHasChanges(true);
  };

  const deleteMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const addSubMilestone = (milestoneIndex: number) => {
    const milestone = milestones[milestoneIndex];
    // eslint-disable-next-line react-hooks/purity
    const timestamp = Date.now();
    const now = new Date().toISOString();
    const newSub: EditableSubMilestone = {
      id: `temp-sub-${timestamp}`,
      milestoneId: milestone.id,
      label: "New Task",
      description: "New Task",
      status: MilestoneStatus.OPEN,
      points: 0,
      acceptanceCriteria: "",
      createdByAI: false,
      createdAt: now,
      updatedAt: now,
      isEditing: true,
    };
    updateMilestone(milestoneIndex, {
      ...milestone,
      submilestones: [...(milestone.submilestones || []), newSub],
    });
  };

  const updateSubMilestone = (
    milestoneIndex: number,
    subId: string,
    updated: EditableSubMilestone
  ) => {
    const milestone = milestones[milestoneIndex];
    const submilestones = (milestone.submilestones || []).map((sub) =>
      sub.id === subId ? updated : sub
    );
    updateMilestone(milestoneIndex, { ...milestone, submilestones });
  };

  const deleteSubMilestone = (milestoneIndex: number, subId: string) => {
    const milestone = milestones[milestoneIndex];
    const submilestones = (milestone.submilestones || []).filter(
      (sub) => sub.id !== subId
    );
    updateMilestone(milestoneIndex, { ...milestone, submilestones });
  };

  const handleSave = () => {
    if (onSave) {
      onSave(milestones);
    }
    setHasChanges(false);
  };

  const totalPoints = useMemo(() => {
    return milestones.reduce((sum, m) => {
      const milestonePoints = m.points || 0;
      const subPoints =
        (m.submilestones || []).reduce(
          (subSum, sub) => subSum + (sub.points || 0),
          0
        ) || 0;
      return sum + milestonePoints + subPoints;
    }, 0);
  }, [milestones]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Milestone Structure</CardTitle>
              <CardDescription>
                Create and organize milestones with nested tasks
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">
                Total:{" "}
                <span className="font-semibold">{totalPoints} points</span>
              </div>
              {hasChanges && (
                <Button onClick={handleSave} size="sm">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={milestones.map((m) => m.id)}
          strategy={verticalListSortingStrategy}
        >
          {milestones.map((milestone, index) => (
            <Collapsible key={milestone.id} open={milestone.isOpen}>
              <SortableMilestone
                milestone={milestone}
                onUpdate={(updated) => updateMilestone(index, updated)}
                onDelete={() => deleteMilestone(index)}
                onAddSubMilestone={() => addSubMilestone(index)}
                onUpdateSubMilestone={(subId, sub) =>
                  updateSubMilestone(index, subId, sub)
                }
                onDeleteSubMilestone={(subId) =>
                  deleteSubMilestone(index, subId)
                }
              />
            </Collapsible>
          ))}
        </SortableContext>
      </DndContext>

      <Button onClick={addMilestone} variant="outline" className="w-full">
        <Plus className="w-4 h-4 mr-2" />
        Add Milestone
      </Button>
    </div>
  );
}
