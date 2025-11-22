"use client";

import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import {
  useValidateInviteToken,
  useDeclineInviteByToken,
} from "@/hooks/use-organization-invites";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const { data, isLoading, error } = useValidateInviteToken(token);
  const declineInvite = useDeclineInviteByToken();

  const handleAcceptInvite = () => {
    // Store invite token in localStorage for use after GitHub auth
    if (typeof window !== "undefined") {
      localStorage.setItem("pending_invite_token", token);
    }

    // Redirect to GitHub OAuth with invite token
    const backend =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
    window.location.href = `${backend}/auth/github?inviteToken=${token}`;
  };

  const handleDeclineInvite = async () => {
    try {
      await declineInvite.mutateAsync(token);
      toast.success("Invite declined");
      router.push("/");
    } catch (error) {
      // Error already handled by the hook
      console.error("Failed to decline invite:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Invite</CardTitle>
            <CardDescription>
              This invite link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/")} className="w-full">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invite = data?.invite;

  return (
    <div className="flex items-center justify-center min-h-screen p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">You&apos;re Invited!</CardTitle>
          <CardDescription>
            Join {invite?.organization?.name} on DevSponsor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            {invite?.organization?.avatarUrl && (
              <div className="flex justify-center">
                <Image
                  src={invite.organization.avatarUrl}
                  alt={invite.organization.name}
                  width={80}
                  height={80}
                  className="rounded-full"
                />
              </div>
            )}

            <div className="text-center space-y-2">
              <h3 className="font-semibold text-lg">
                {invite?.organization?.name}
              </h3>
              {invite?.organization?.description && (
                <p className="text-sm text-muted-foreground">
                  {invite.organization.description}
                </p>
              )}
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invited by:</span>
                <span className="font-medium">
                  {invite?.inviter?.name || invite?.inviter?.githubUsername}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Role:</span>
                <span className="font-medium capitalize">
                  {invite?.role?.toLowerCase()}
                </span>
              </div>
              {invite?.email && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{invite.email}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Button onClick={handleAcceptInvite} className="w-full" size="lg">
              Accept Invite & Sign in with GitHub
            </Button>
            <Button
              variant="outline"
              onClick={handleDeclineInvite}
              className="w-full"
              disabled={declineInvite.isPending}
            >
              {declineInvite.isPending ? "Declining..." : "Decline"}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            By accepting, you&apos;ll be redirected to sign in with GitHub.
            After authentication, you&apos;ll automatically join this
            organization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
