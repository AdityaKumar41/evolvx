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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitPR } from "@/hooks/use-pr-submissions";
import { toast } from "sonner";
import {
  Loader2,
  GitPullRequest,
  Upload,
  X,
  Image as ImageIcon,
} from "lucide-react";

interface PRSubmissionFormProps {
  submilestoneId: string;
  submilestoneTitle: string;
  trigger?: React.ReactNode;
}

export function PRSubmissionForm({
  submilestoneId,
  submilestoneTitle,
  trigger,
}: PRSubmissionFormProps) {
  const [open, setOpen] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const submitPR = useSubmitPR();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length !== files.length) {
      toast.error("Only image files are allowed");
    }

    if (screenshots.length + imageFiles.length > 5) {
      toast.error("Maximum 5 screenshots allowed");
      return;
    }

    setScreenshots([...screenshots, ...imageFiles]);
  };

  const removeScreenshot = (index: number) => {
    setScreenshots(screenshots.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!prUrl) {
      toast.error("PR URL is required");
      return;
    }

    try {
      await submitPR.mutateAsync({
        submilestoneId,
        data: {
          prUrl,
          prNumber: prNumber ? parseInt(prNumber) : undefined,
          notes,
          screenshots,
        },
      });
      toast.success("PR submitted successfully!");
      setOpen(false);
      // Reset form
      setPrUrl("");
      setPrNumber("");
      setNotes("");
      setScreenshots([]);
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
            "Failed to submit PR";
      toast.error(String(errorMessage));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="lg" className="gap-2">
            <GitPullRequest className="w-5 h-5" />
            Submit Pull Request
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Pull Request</DialogTitle>
          <DialogDescription>
            Submit your PR for &quot;{submilestoneTitle}&quot;
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="prUrl">Pull Request URL *</Label>
            <Input
              id="prUrl"
              type="url"
              placeholder="https://github.com/username/repo/pull/123"
              value={prUrl}
              onChange={(e) => setPrUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prNumber">PR Number (Optional)</Label>
            <Input
              id="prNumber"
              type="number"
              placeholder="123"
              value={prNumber}
              onChange={(e) => setPrNumber(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Describe your implementation, any special considerations, or notes for the reviewer..."
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>UI Screenshots (Optional, up to 5)</Label>
            <div className="space-y-3">
              {screenshots.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {screenshots.map((file, index) => (
                    <div
                      key={index}
                      className="relative group border rounded-lg p-2 hover:border-primary"
                    >
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm truncate flex-1">
                          {file.name}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => removeScreenshot(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {screenshots.length < 5 && (
                <div>
                  <Input
                    id="screenshots"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      document.getElementById("screenshots")?.click()
                    }
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Screenshots
                  </Button>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Upload screenshots of your UI implementation for review (PNG, JPG,
              max 10MB each)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitPR.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitPR.isPending || !prUrl}
          >
            {submitPR.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <GitPullRequest className="w-4 h-4 mr-2" />
                Submit PR
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
