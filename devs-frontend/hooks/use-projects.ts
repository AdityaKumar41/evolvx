import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import {
  CreateProjectRequest,
  FundProjectRequest,
  GenerateMilestonesRequest,
  Project,
} from "@/lib/types";

export function useProjects(filters?: {
  status?: string;
  sponsorId?: string;
  organizationId?: string;
}) {
  return useQuery<Project[]>({
    queryKey: ["projects", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.sponsorId) params.append("sponsorId", filters.sponsorId);
      if (filters?.organizationId)
        params.append("organizationId", filters.organizationId);

      const response = await apiClient.get(
        `/api/projects?${params.toString()}`
      );
      return response.data.projects || response.data;
    },
  });
}

export function useProject(projectId: string) {
  return useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/projects/${projectId}`);
      return response.data.project || response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProjectRequest) => {
      const response = await apiClient.post("/api/projects", data);
      return response.data.project || response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useFundProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: FundProjectRequest;
    }) => {
      const response = await apiClient.post(
        `/api/projects/${projectId}/fund`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useGenerateMilestones() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: GenerateMilestonesRequest;
    }) => {
      const response = await apiClient.post(
        `/api/projects/${projectId}/ai/generate`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["milestones", variables.projectId],
      });
    },
  });
}

export function useProjectFunding(projectId: string) {
  return useQuery({
    queryKey: ["project-funding", projectId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/funding/project/${projectId}/remaining`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useProjectSpending(projectId: string) {
  return useQuery({
    queryKey: ["project-spending", projectId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/payments/project/${projectId}/spending`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

// Join Request Hooks
export function useSubmitJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      message,
    }: {
      projectId: string;
      message?: string;
    }) => {
      const response = await apiClient.post(`/api/projects/${projectId}/join`, {
        message,
      });
      return response.data.joinRequest;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project", variables.projectId],
      });
    },
  });
}

export function useJoinRequests(projectId: string, status?: string) {
  return useQuery({
    queryKey: ["join-requests", projectId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.append("status", status);

      const response = await apiClient.get(
        `/api/projects/${projectId}/join-requests?${params.toString()}`
      );
      return response.data.joinRequests || [];
    },
    enabled: !!projectId,
  });
}

export function useReviewJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      approved,
    }: {
      requestId: string;
      approved: boolean;
    }) => {
      const endpoint = approved
        ? `/api/projects/join-requests/${requestId}/approve`
        : `/api/projects/join-requests/${requestId}/decline`;

      const response = await apiClient.put(endpoint);
      return response.data.joinRequest;
    },
    onSuccess: (joinRequest) => {
      queryClient.invalidateQueries({
        queryKey: ["join-requests", joinRequest.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["project", joinRequest.projectId],
      });
    },
  });
}
