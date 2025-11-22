import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { Contribution } from "@/lib/types";

export function useProjectContributions(projectId: string) {
  return useQuery<Contribution[]>({
    queryKey: ["contributions", "project", projectId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/contributions/project/${projectId}`
      );
      return response.data.contributions || response.data;
    },
    enabled: !!projectId,
  });
}

export function useContribution(contributionId: string) {
  return useQuery<Contribution>({
    queryKey: ["contribution", contributionId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/contributions/${contributionId}`
      );
      return response.data.contribution || response.data;
    },
    enabled: !!contributionId,
  });
}

export function useMyContributions() {
  return useQuery<Contribution[]>({
    queryKey: ["my-contributions"],
    queryFn: async () => {
      const response = await apiClient.get("/api/contributions/my");
      return response.data.contributions || response.data;
    },
  });
}

export function useContributions(params?: { contributorId?: string }) {
  return useQuery<Contribution[]>({
    queryKey: ["contributions", params],
    queryFn: async () => {
      const queryParams = new URLSearchParams();
      if (params?.contributorId) {
        queryParams.append("contributorId", params.contributorId);
      }
      const response = await apiClient.get(
        `/api/contributions?${queryParams.toString()}`
      );
      return response.data.contributions || response.data;
    },
  });
}
