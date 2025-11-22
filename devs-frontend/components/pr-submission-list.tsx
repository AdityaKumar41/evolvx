"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePRSubmissions, useReviewPR } from "@/hooks/use-pr-submissions";
import { PRSubmission, PRSubmissionStatus } from "@/lib/types";
import { toast } from "sonner";
import {
  Loader2,
  Check,
  X,
  GitPullRequest,
  ExternalLink,
  Image as ImageIcon,
  Clock,
  Bot,
  Eye,
  CheckCircle2,
  XCircle,
  GitMerge,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PRSubmissionListProps {
  submilestoneId: string;
  canReview?: boolean;
}

export function PRSubmissionList({
  submilestoneId,
  canReview = false,
}: PRSubmissionListProps) {
  const { data: submissions, isLoading } = usePRSubmissions(submilestoneId);
  const reviewPR = useReviewPR();
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const handleReview = async (submissionId: string, approved: boolean) => {
    try {
      await reviewPR.mutateAsync({
        submissionId,
        data: { approved, feedback },
      });
      toast.success(approved ? "PR approved!" : "PR rejected");
      setReviewingId(null);
      setFeedback("");
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
            "Failed to review PR";
      toast.error(String(errorMessage));
    }
  };

  const getStatusBadge = (status: PRSubmissionStatus) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
      case "AI_REVIEW":
        return (
          <Badge variant="secondary" className="gap-1">
            <Bot className="w-3 h-3" />
            AI Review
          </Badge>
        );
      case "SPONSOR_REVIEW":
        return (
          <Badge variant="default" className="gap-1">
            <Eye className="w-3 h-3" />
            Sponsor Review
          </Badge>
        );
      case "APPROVED":
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </Badge>
        );
      case "REJECTED":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="w-3 h-3" />
            Rejected
          </Badge>
        );
      case "MERGED":
        return (
          <Badge variant="default" className="gap-1 bg-purple-500">
            <GitMerge className="w-3 h-3" />
            Merged
          </Badge>
        );
    }
  };

  const SubmissionCard = ({ submission }: { submission: PRSubmission }) => {
    const isReviewing = reviewingId === submission.id;

    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={submission.contributor?.avatarUrl} />
                  <AvatarFallback>
                    {submission.contributor?.githubUsername?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">
                      {submission.contributor?.githubUsername || "Unknown User"}
                    </h4>
                    {getStatusBadge(submission.status)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <GitPullRequest className="w-4 h-4" />
                    <a
                      href={submission.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      {submission.prNumber
                        ? `PR #${submission.prNumber}`
                        : "View Pull Request"}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Submitted{" "}
                    {formatDistanceToNow(new Date(submission.createdAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </div>
            </div>

            {submission.notes && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium mb-1">Notes:</p>
                <p className="text-muted-foreground">{submission.notes}</p>
              </div>
            )}

            {submission.aiReviewScore !== null &&
              submission.aiReviewScore !== undefined && (
                <div className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Bot className="w-4 h-4" />
                    <p className="font-medium">AI Review Score:</p>
                    <Badge variant="secondary">
                      {(submission.aiReviewScore * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  {submission.aiReviewFeedback && (
                    <p className="text-muted-foreground">
                      {JSON.stringify(submission.aiReviewFeedback)}
                    </p>
                  )}
                </div>
              )}

            {submission.sponsorFeedback && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <p className="font-medium mb-1">Sponsor Feedback:</p>
                <p className="text-muted-foreground">
                  {submission.sponsorFeedback}
                </p>
              </div>
            )}

            {submission.screenshots && submission.screenshots.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ImageIcon className="w-4 h-4" />
                  Screenshots ({submission.screenshots.length})
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {submission.screenshots.map((screenshot) => (
                    <a
                      key={screenshot.id}
                      href={screenshot.s3Url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-video rounded-lg border overflow-hidden hover:border-primary"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={screenshot.s3Url}
                        alt={screenshot.filename}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                        <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {canReview &&
              (submission.status === "PENDING" ||
                submission.status === "AI_REVIEW" ||
                submission.status === "SPONSOR_REVIEW") && (
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-600 hover:bg-green-50"
                    onClick={() => setReviewingId(submission.id)}
                  >
                    <Check className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 border-red-600 hover:bg-red-50"
                    onClick={() => setReviewingId(submission.id)}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
          </div>
        </CardContent>

        <Dialog open={isReviewing} onOpenChange={() => setReviewingId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Review Pull Request</DialogTitle>
              <DialogDescription>
                Provide feedback for this PR submission
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="feedback">Feedback (Optional)</Label>
                <Textarea
                  id="feedback"
                  placeholder="Provide feedback or reasons for your decision..."
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setReviewingId(null);
                  setFeedback("");
                }}
                disabled={reviewPR.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
                onClick={() => handleReview(submission.id, false)}
                disabled={reviewPR.isPending}
              >
                {reviewPR.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Reject
                  </>
                )}
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => handleReview(submission.id, true)}
                disabled={reviewPR.isPending}
              >
                {reviewPR.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Approve
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!submissions || submissions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" />
            Pull Request Submissions
          </CardTitle>
          <CardDescription>No PR submissions yet</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitPullRequest className="w-5 h-5" />
            Pull Request Submissions
          </CardTitle>
          <CardDescription>
            {submissions.length} submission{submissions.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
      </Card>
      {submissions.map((submission) => (
        <SubmissionCard key={submission.id} submission={submission} />
      ))}
    </div>
  );
}
