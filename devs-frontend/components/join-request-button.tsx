"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitJoinRequest } from "@/hooks/use-projects";
import { toast } from "sonner";
import { Loader2, UserPlus, Lock, Check, Clock } from "lucide-react";
import { RepoType, JoinRequestStatus } from "@/lib/types";

interface JoinRequestButtonProps {
  projectId: string;
  projectTitle: string;
  repoType: RepoType;
  hasAccess?: boolean;
  joinRequestStatus?: JoinRequestStatus | null;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost";
}

export function JoinRequestButton({
  projectId,
  projectTitle,
  repoType,
  hasAccess = false,
  joinRequestStatus,
  size = "lg",
  variant = "default",
}: JoinRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const submitRequest = useSubmitJoinRequest();

  // Don't show button if already has access or project is PUBLIC
  if (hasAccess && repoType === RepoType.PUBLIC) {
    return null;
  }

  // If user already has access
  if (hasAccess && joinRequestStatus === JoinRequestStatus.ACCEPTED) {
    return (
      <Button size={size} variant="outline" disabled className="gap-2">
        <Check className="w-4 h-4" />
        Joined
      </Button>
    );
  }

  // Show status for pending/declined requests
  if (joinRequestStatus === JoinRequestStatus.PENDING) {
    return (
      <Button size={size} variant="outline" disabled className="gap-2">
        <Clock className="w-4 h-4" />
        Request Pending
      </Button>
    );
  }

  if (joinRequestStatus === JoinRequestStatus.DECLINED) {
    return (
      <Button size={size} variant="outline" disabled className="gap-2">
        <Lock className="w-4 h-4" />
        Request Declined
      </Button>
    );
  }

  // For PRIVATE_REQUEST projects, show request dialog
  if (repoType === RepoType.PRIVATE_REQUEST) {
    const handleSubmit = async () => {
      try {
        await submitRequest.mutateAsync({ projectId, message });
        toast.success("Join request submitted successfully!");
        setOpen(false);
        setMessage("");
      } catch (error: unknown) {
        const err = error as {
          response?: { data?: { message?: string } };
          message?: string;
        };
        const errorMessage =
          typeof error === "string"
            ? error
            : err?.response?.data?.message ||
              err?.message ||
              "Failed to submit join request";
        toast.error(String(errorMessage));
      }
    };

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size={size} variant={variant} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Request to Join
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Request to Join Project</DialogTitle>
            <DialogDescription>
              Send a request to join &quot;{projectTitle}&quot;. The project
              sponsor will review your request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="message">Message (Optional)</Label>
              <Textarea
                id="message"
                placeholder="Tell the sponsor why you'd like to join this project, your relevant skills, and what you can contribute..."
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitRequest.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitRequest.isPending}>
              {submitRequest.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // For PUBLIC projects, no button needed (instant access)
  if (repoType === RepoType.PUBLIC) {
    return null;
  }

  // For PRIVATE and PRIVATE_INVITE, show locked state
  return (
    <Button size={size} variant="outline" disabled className="gap-2">
      <Lock className="w-4 h-4" />
      Private Project
    </Button>
  );
}
