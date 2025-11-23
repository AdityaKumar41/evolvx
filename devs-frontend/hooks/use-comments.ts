import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    githubUsername: string;
    avatarUrl?: string;
    name?: string;
  };
}

export function useComments(submilestoneId: string) {
  return useQuery<Comment[]>({
    queryKey: ["comments", submilestoneId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/comments/submilestone/${submilestoneId}`
      );
      return response.data.comments;
    },
    enabled: !!submilestoneId,
  });
}

export function useCreateComment(submilestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const response = await apiClient.post(
        `/api/comments/submilestone/${submilestoneId}`,
        { content }
      );
      return response.data.comment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", submilestoneId] });
      toast.success("Comment posted successfully");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to post comment";
      toast.error(message);
    },
  });
}

export function useUpdateComment(submilestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      content,
    }: {
      commentId: string;
      content: string;
    }) => {
      const response = await apiClient.put(`/api/comments/${commentId}`, {
        content,
      });
      return response.data.comment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", submilestoneId] });
      toast.success("Comment updated successfully");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to update comment";
      toast.error(message);
    },
  });
}

export function useDeleteComment(submilestoneId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      await apiClient.delete(`/api/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comments", submilestoneId] });
      toast.success("Comment deleted successfully");
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : "Failed to delete comment";
      toast.error(message);
    },
  });
}
