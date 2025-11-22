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
import { Loader2, UserPlus } from "lucide-react";

interface JoinRequestButtonProps {
  projectId: string;
  projectTitle: string;
}

export function JoinRequestButton({
  projectId,
  projectTitle,
}: JoinRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const submitRequest = useSubmitJoinRequest();

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
        <Button size="lg" className="gap-2">
          <UserPlus className="w-5 h-5" />
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
