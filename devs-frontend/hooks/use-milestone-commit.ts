"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";

export const MERKLE_COMMIT_STORAGE_ADDRESS = process.env
  .NEXT_PUBLIC_MERKLE_CONTRACT_ADDRESS as `0x${string}`;

export interface MilestoneCommitResult {
  milestoneId: string;
  merkleRoot: string;
  txHash: string;
  submilestoneCount: number;
  totalAmount: string;
  metadataUri?: string;
}

export interface MilestoneCommitmentStatus {
  isCommitted: boolean;
  merkleRoot?: string;
  commitTxHash?: string;
  committedAt?: string;
  metadataUri?: string;
}

/**
 * Hook to commit milestone to blockchain via Merkle tree
 */
export function useCommitMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      milestoneId: string;
      metadataUri?: string;
    }) => {
      const response = await apiClient.post(
        `/api/milestones/${params.milestoneId}/commit`,
        {
          metadataUri: params.metadataUri,
        }
      );
      return response.data as MilestoneCommitResult;
    },
    onSuccess: (data) => {
      // Invalidate milestone queries
      queryClient.invalidateQueries({
        queryKey: ["milestone", data.milestoneId],
      });
      queryClient.invalidateQueries({ queryKey: ["milestones"] });

      // Show success notification
      toast.success("Milestone committed to blockchain!", {
        description: `Merkle Root: ${data.merkleRoot.slice(
          0,
          16
        )}... | View on Arbiscan: https://sepolia.arbiscan.io/tx/${
          data.txHash
        }`,
        duration: 8000,
      });

      return data;
    },
    onError: (error: any) => {
      toast.error("Failed to commit milestone", {
        description:
          error.response?.data?.message || error.message || "Please try again",
      });
    },
  });
}

/**
 * Hook to check if milestone is committed on-chain
 */
export function useMilestoneCommitmentStatus(milestoneId?: string) {
  return useQuery({
    queryKey: ["milestoneCommitment", milestoneId],
    queryFn: async () => {
      if (!milestoneId) return null;
      const response = await apiClient.get(
        `/api/milestones/${milestoneId}/commitment-status`
      );
      return response.data as MilestoneCommitmentStatus;
    },
    enabled: !!milestoneId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Hook to finalize milestone (prevent further changes)
 */
export function useFinalizeMilestone() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (milestoneId: string) => {
      const response = await apiClient.post(
        `/api/milestones/${milestoneId}/finalize`
      );
      return response.data;
    },
    onSuccess: (_, milestoneId) => {
      queryClient.invalidateQueries({ queryKey: ["milestone", milestoneId] });
      toast.success("Milestone finalized on blockchain");
    },
    onError: (error: any) => {
      toast.error("Failed to finalize milestone", {
        description: error.response?.data?.message || error.message,
      });
    },
  });
}
