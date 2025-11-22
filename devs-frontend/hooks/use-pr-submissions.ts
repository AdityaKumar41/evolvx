import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { PRSubmission, SubmitPRRequest, ReviewPRRequest } from "@/lib/types";

export function useSubmitPR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      submilestoneId,
      data,
    }: {
      submilestoneId: string;
      data: SubmitPRRequest;
    }) => {
      const formData = new FormData();
      formData.append("prUrl", data.prUrl);
      if (data.prNumber) formData.append("prNumber", data.prNumber.toString());
      if (data.notes) formData.append("notes", data.notes);

      // Add screenshots
      if (data.screenshots) {
        data.screenshots.forEach((file) => {
          formData.append("screenshots", file);
        });
      }

      const response = await apiClient.post(
        `/api/submilestones/${submilestoneId}/submit-pr`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      return response.data.prSubmission;
    },
    onSuccess: (prSubmission) => {
      queryClient.invalidateQueries({
        queryKey: ["pr-submissions", prSubmission.subMilestoneId],
      });
      queryClient.invalidateQueries({
        queryKey: ["submilestone", prSubmission.subMilestoneId],
      });
    },
  });
}

export function usePRSubmissions(submilestoneId: string) {
  return useQuery<PRSubmission[]>({
    queryKey: ["pr-submissions", submilestoneId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/submilestones/${submilestoneId}/submissions`
      );
      return response.data.submissions || [];
    },
    enabled: !!submilestoneId,
  });
}

export function usePRSubmission(submissionId: string) {
  return useQuery<PRSubmission>({
    queryKey: ["pr-submission", submissionId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/submilestones/submissions/${submissionId}`
      );
      return response.data.submission;
    },
    enabled: !!submissionId,
  });
}

export function useReviewPR() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      submissionId,
      data,
    }: {
      submissionId: string;
      data: ReviewPRRequest;
    }) => {
      const response = await apiClient.put(
        `/api/submilestones/submissions/${submissionId}/review`,
        data
      );
      return response.data.submission;
    },
    onSuccess: (submission) => {
      queryClient.invalidateQueries({
        queryKey: ["pr-submission", submission.id],
      });
      queryClient.invalidateQueries({
        queryKey: ["pr-submissions", submission.subMilestoneId],
      });
      queryClient.invalidateQueries({
        queryKey: ["submilestone", submission.subMilestoneId],
      });
    },
  });
}
