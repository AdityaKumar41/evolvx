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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJoinRequests, useReviewJoinRequest } from "@/hooks/use-projects";
import { JoinRequest, JoinRequestStatus } from "@/lib/types";
import { toast } from "sonner";
import { Loader2, Check, X, Clock, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface JoinRequestListProps {
  projectId: string;
}

export function JoinRequestList({ projectId }: JoinRequestListProps) {
  const [activeTab, setActiveTab] = useState<string>("pending");
  const { data: pendingRequests, isLoading: loadingPending } = useJoinRequests(
    projectId,
    "PENDING"
  );
  const { data: allRequests, isLoading: loadingAll } =
    useJoinRequests(projectId);
  const reviewRequest = useReviewJoinRequest();

  const handleReview = async (requestId: string, approved: boolean) => {
    try {
      await reviewRequest.mutateAsync({ requestId, approved });
      toast.success(
        approved ? "Join request approved!" : "Join request declined"
      );
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
            "Failed to review request";
      toast.error(String(errorMessage));
    }
  };

  const getStatusBadge = (status: JoinRequestStatus) => {
    switch (status) {
      case "PENDING":
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
      case "ACCEPTED":
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <Check className="w-3 h-3" />
            Accepted
          </Badge>
        );
      case "DECLINED":
        return (
          <Badge variant="destructive" className="gap-1">
            <X className="w-3 h-3" />
            Declined
          </Badge>
        );
      case "EXPIRED":
        return (
          <Badge variant="secondary" className="gap-1">
            Expired
          </Badge>
        );
    }
  };

  const RequestCard = ({ request }: { request: JoinRequest }) => (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <Avatar className="w-12 h-12">
              <AvatarImage src={request.user?.avatarUrl} />
              <AvatarFallback>
                {request.user?.githubUsername?.[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">
                  {request.user?.githubUsername || "Unknown User"}
                </h4>
                {getStatusBadge(request.status)}
              </div>
              {request.user?.bio && (
                <p className="text-sm text-muted-foreground">
                  {request.user.bio}
                </p>
              )}
              {request.message && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  <p className="font-medium mb-1">Message:</p>
                  <p className="text-muted-foreground">{request.message}</p>
                </div>
              )}
              {request.user?.skills && request.user.skills.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {request.user.skills.map((skill) => (
                    <Badge key={skill} variant="secondary">
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Requested{" "}
                {formatDistanceToNow(new Date(request.createdAt), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </div>
          {request.status === "PENDING" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 border-green-600 hover:bg-green-50"
                onClick={() => handleReview(request.id, true)}
                disabled={reviewRequest.isPending}
              >
                {reviewRequest.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-1" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-600 hover:bg-red-50"
                onClick={() => handleReview(request.id, false)}
                disabled={reviewRequest.isPending}
              >
                {reviewRequest.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <X className="w-4 h-4 mr-1" />
                    Decline
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loadingPending && activeTab === "pending") {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Join Requests
            </CardTitle>
            <CardDescription>
              Review and manage contributor join requests
            </CardDescription>
          </div>
          {pendingRequests && pendingRequests.length > 0 && (
            <Badge variant="default" className="ml-auto">
              {pendingRequests.length} Pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">
              Pending {pendingRequests && `(${pendingRequests.length})`}
            </TabsTrigger>
            <TabsTrigger value="all">
              All {allRequests && `(${allRequests.length})`}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="space-y-4 mt-4">
            {loadingPending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : pendingRequests && pendingRequests.length > 0 ? (
              pendingRequests.map((request: JoinRequest) => (
                <RequestCard key={request.id} request={request} />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No pending join requests
              </div>
            )}
          </TabsContent>
          <TabsContent value="all" className="space-y-4 mt-4">
            {loadingAll ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : allRequests && allRequests.length > 0 ? (
              allRequests.map((request: JoinRequest) => (
                <RequestCard key={request.id} request={request} />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No join requests yet
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
