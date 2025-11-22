import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export function usePendingInvites(organizationId: string) {
  return useQuery({
    queryKey: ["organization-invites", organizationId],
    queryFn: async () => {
      const response = await api.organizations.getPendingInvites(
        organizationId
      );
      return response.data;
    },
    enabled: !!organizationId,
  });
}

export function useInviteMember(organizationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      email?: string;
      githubUsername?: string;
      role: string;
    }) => {
      const response = await api.organizations.inviteMember(
        organizationId,
        data
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["organization-invites", organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organization", organizationId],
      });
      toast.success(data.message || "Invite sent successfully!");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to send invite");
    },
  });
}

export function useValidateInviteToken(token: string) {
  return useQuery({
    queryKey: ["invite-token", token],
    queryFn: async () => {
      const response = await api.organizations.validateInviteToken(token);
      return response.data;
    },
    enabled: !!token,
    retry: false,
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const response = await api.organizations.acceptInvite(inviteId);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({
        queryKey: ["organization", data.organization?.id],
      });
      toast.success(data.message || "Invite accepted successfully!");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to accept invite");
    },
  });
}

export function useAcceptInviteByToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const response = await api.organizations.acceptInviteByToken(token);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({
        queryKey: ["organization", data.organization?.id],
      });
      toast.success(data.message || "Invite accepted successfully!");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to accept invite");
    },
  });
}

export function useDeclineInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const response = await api.organizations.declineInvite(inviteId);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success(data.message || "Invite declined successfully!");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to decline invite");
    },
  });
}

export function useDeclineInviteByToken() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const response = await api.organizations.declineInviteByToken(token);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      toast.success(data.message || "Invite declined successfully!");
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { error?: string } } };
      toast.error(err.response?.data?.error || "Failed to decline invite");
    },
  });
}
