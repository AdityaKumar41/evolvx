"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { GitHubAppStatus, GitHubRepository } from "@/lib/types";

export function useGitHubAppStatus() {
  return useQuery<GitHubAppStatus>({
    queryKey: ["github", "app-status"],
    queryFn: async () => {
      const response = await apiClient.get("/api/github/app/status");
      return response.data;
    },
  });
}

export function useGitHubRepositories() {
  return useQuery<{ repositories: GitHubRepository[] }>({
    queryKey: ["github", "repositories"],
    queryFn: async () => {
      try {
        console.log("[useGitHubRepositories] Fetching repositories...");
        const response = await apiClient.get("/api/github/repositories");
        console.log(
          "[useGitHubRepositories] Success:",
          response.data?.repositories?.length || 0,
          "repositories"
        );
        return response.data;
      } catch (error: any) {
        console.error(
          "[useGitHubRepositories] Error:",
          error.response?.status,
          error.message
        );
        throw error;
      }
    },
    retry: 1, // Only retry once on failure
    retryDelay: 1000, // Wait 1 second before retry
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
