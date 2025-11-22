import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { ClaimSubMilestoneRequest, Milestone } from "@/lib/types";

export function useProjectMilestones(projectId: string) {
  return useQuery<Milestone[]>({
    queryKey: ["milestones", projectId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/milestones/project/${projectId}`
      );
      return response.data.milestones || response.data;
    },
    enabled: !!projectId,
  });
}

export function useCreateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      data,
    }: {
      projectId: string;
      data: any;
    }) => {
      const response = await apiClient.post(
        `/api/milestones/project/${projectId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["milestones", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["project", variables.projectId],
      });
    },
  });
}

export function useClaimSubMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subMilestoneId,
      data,
    }: {
      subMilestoneId: string;
      data: ClaimSubMilestoneRequest;
    }) => {
      const response = await apiClient.post(
        `/api/milestones/${subMilestoneId}/claim`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      // Invalidate milestones query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
      queryClient.invalidateQueries({ queryKey: ["contributions"] });
    },
  });
}

export function useUpdateMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      milestoneId,
      data,
    }: {
      milestoneId: string;
      data: Partial<Milestone>;
    }) => {
      const response = await apiClient.patch(
        `/api/milestones/${milestoneId}`,
        data
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
    },
  });
}

export function useUpdateSubMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      subMilestoneId,
      data,
    }: {
      subMilestoneId: string;
      data: Partial<Milestone>;
    }) => {
      const response = await apiClient.patch(
        `/api/submilestones/${subMilestoneId}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["milestones"] });
    },
  });
}

export function useSubMilestone(subMilestoneId: string) {
  return useQuery({
    queryKey: ["submilestone", subMilestoneId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/submilestones/${subMilestoneId}`
      );
      return response.data.subMilestone || response.data;
    },
    enabled: !!subMilestoneId,
  });
}
