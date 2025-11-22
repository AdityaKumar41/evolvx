import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import {
  CreateOrganizationRequest,
  InviteMemberRequest,
  Organization,
  OrganizationMember,
} from "@/lib/types";

export function useOrganizations() {
  return useQuery<Organization[]>({
    queryKey: ["organizations"],
    queryFn: async () => {
      const response = await apiClient.get("/api/organizations");
      return response.data.organizations || response.data;
    },
  });
}

export function useOrganization(organizationId: string) {
  return useQuery<Organization>({
    queryKey: ["organization", organizationId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/organizations/${organizationId}`
      );
      return response.data.organization || response.data;
    },
    enabled: !!organizationId,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateOrganizationRequest) => {
      const response = await apiClient.post("/api/organizations", data);
      return response.data.organization || response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      data,
    }: {
      organizationId: string;
      data: Partial<CreateOrganizationRequest>;
    }) => {
      const response = await apiClient.put(
        `/api/organizations/${organizationId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["organization", variables.organizationId],
      });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const response = await apiClient.delete(
        `/api/organizations/${organizationId}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      email,
      githubUsername,
      role,
    }: {
      organizationId: string;
      email?: string;
      githubUsername?: string;
      role?: string;
    }) => {
      const response = await apiClient.post(
        `/api/organizations/${organizationId}/invite`,
        { email, githubUsername, role }
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["organization", variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", variables.organizationId],
      });
    },
  });
}

export function useOrganizationMembers(organizationId: string) {
  return useQuery<OrganizationMember[]>({
    queryKey: ["organization-members", organizationId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/organizations/${organizationId}/members`
      );
      return response.data;
    },
    enabled: !!organizationId,
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      organizationId,
      memberId,
    }: {
      organizationId: string;
      memberId: string;
    }) => {
      const response = await apiClient.delete(
        `/api/organizations/${organizationId}/members/${memberId}`
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["organization", variables.organizationId],
      });
      queryClient.invalidateQueries({
        queryKey: ["organization-members", variables.organizationId],
      });
    },
  });
}
