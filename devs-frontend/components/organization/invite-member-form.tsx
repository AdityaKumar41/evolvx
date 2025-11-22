"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Mail, Github, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInviteMember } from "@/hooks/use-organization-invites";
import { toast } from "sonner";

interface InviteMemberFormProps {
  organizationId: string;
}

interface FormData {
  inviteType: "email" | "github";
  email: string;
  githubUsername: string;
  role: string;
}

export function InviteMemberForm({ organizationId }: InviteMemberFormProps) {
  const [open, setOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const { register, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    defaultValues: {
      inviteType: "email",
      email: "",
      githubUsername: "",
      role: "MEMBER",
    },
  });

  const inviteMember = useInviteMember(organizationId);
  const inviteType = watch("inviteType");

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        role: data.role,
        ...(data.inviteType === "email"
          ? { email: data.email }
          : { githubUsername: data.githubUsername }),
      };

      const response = await inviteMember.mutateAsync(payload);

      if (response.invite?.inviteUrl) {
        setInviteUrl(response.invite.inviteUrl);
      } else {
        // User was added directly (existing user)
        setOpen(false);
        reset();
      }
    } catch {
      // Error handled by the hook
    }
  };

  const handleCopyLink = () => {
    if (inviteUrl) {
      navigator.clipboard.writeText(inviteUrl);
      toast.success("Invite link copied to clipboard!");
    }
  };

  const handleClose = () => {
    setOpen(false);
    setInviteUrl(null);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {!inviteUrl ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite Member</DialogTitle>
              <DialogDescription>
                Invite someone to join your organization as a sponsor
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label>Invite by</Label>
                <Select
                  value={inviteType}
                  onValueChange={(value) =>
                    setValue("inviteType", value as "email" | "github")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <div className="flex items-center">
                        <Mail className="mr-2 h-4 w-4" />
                        Email Address
                      </div>
                    </SelectItem>
                    <SelectItem value="github">
                      <div className="flex items-center">
                        <Github className="mr-2 h-4 w-4" />
                        GitHub Username
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {inviteType === "email" ? (
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="colleague@company.com"
                    {...register("email", { required: inviteType === "email" })}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="githubUsername">GitHub Username</Label>
                  <Input
                    id="githubUsername"
                    type="text"
                    placeholder="octocat"
                    {...register("githubUsername", {
                      required: inviteType === "github",
                    })}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  defaultValue="MEMBER"
                  onValueChange={(value) => setValue("role", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OWNER">Owner</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Owner and Admin roles will grant Sponsor privileges
                </p>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteMember.isPending}>
                  {inviteMember.isPending ? "Sending..." : "Send Invite"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite Sent!</DialogTitle>
              <DialogDescription>
                Share this link with the invitee
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Input value={inviteUrl} readOnly className="flex-1" />
                <Button type="button" size="sm" onClick={handleCopyLink}>
                  Copy
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                This link will expire in 7 days. The invitee will need to sign
                in with GitHub to accept the invite.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
