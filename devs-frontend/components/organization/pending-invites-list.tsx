"use client";

import { Mail, Github, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePendingInvites } from "@/hooks/use-organization-invites";
import { Skeleton } from "@/components/ui/skeleton";

interface PendingInvitesListProps {
  organizationId: string;
}

export function PendingInvitesList({
  organizationId,
}: PendingInvitesListProps) {
  const { data, isLoading } = usePendingInvites(organizationId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Invites</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-12 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const invites = data?.invites || [];

  if (invites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Invites</CardTitle>
          <CardDescription>No pending invites at the moment</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending Invites</CardTitle>
        <CardDescription>
          {invites.length} {invites.length === 1 ? "invite" : "invites"} waiting
          for acceptance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {invites.map(
            (invite: {
              id: string;
              email?: string;
              githubUsername?: string;
              role: string;
              expiresAt: string;
              inviter: {
                githubUsername: string;
                avatarUrl?: string;
              };
            }) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {invite.email ? (
                        <>
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{invite.email}</span>
                        </>
                      ) : (
                        <>
                          <Github className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            @{invite.githubUsername}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>
                        Expires{" "}
                        {new Date(invite.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {invite.role.toLowerCase()}
                  </Badge>
                </div>
              </div>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
