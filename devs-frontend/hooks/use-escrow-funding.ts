"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";

export const ESCROW_AND_YIELD_ADDRESS = process.env
  .NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as `0x${string}`;

export interface EscrowFundingParams {
  projectId: string;
  milestoneId?: string;
  amount: string; // in ETH/tokens
  tokenAddress?: string;
  enableYield: boolean;
}

export interface EscrowFundingResult {
  txHash: string;
  escrowPoolId: string;
  totalDeposited: string;
  yieldEnabled: boolean;
}

export interface EscrowPoolInfo {
  poolId: string;
  balance: string;
  lockedAmount: string;
  availableAmount: string;
  yieldGenerated: string;
  yieldEnabled: boolean;
  tokenAddress: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
}

/**
 * Hook to fund escrow pool for a project/milestone
 */
export function useFundEscrow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: EscrowFundingParams) => {
      const response = await apiClient.post("/api/escrow/deposit", {
        projectId: params.projectId,
        milestoneId: params.milestoneId,
        amount: params.amount,
        tokenAddress: params.tokenAddress,
        yieldEnabled: params.enableYield,
      });
      return response.data as EscrowFundingResult;
    },
    onSuccess: (data, variables) => {
      // Invalidate project and escrow queries
      queryClient.invalidateQueries({
        queryKey: ["project", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["escrowPool"] });

      // Show success notification
      const yieldStatus = data.yieldEnabled
        ? "with Aave yield farming enabled"
        : "without yield";

      toast.success("Escrow funded successfully!", {
        description: `${
          data.totalDeposited
        } deposited ${yieldStatus}. Pool ID: ${data.escrowPoolId.slice(
          0,
          10
        )}... | View: https://sepolia.arbiscan.io/tx/${data.txHash}`,
        duration: 8000,
      });

      return data;
    },
    onError: (
      error: Error | { response?: { data?: { message?: string } } }
    ) => {
      const errorMessage =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message ||
        (error as Error).message ||
        "Please try again";

      toast.error("Failed to fund escrow", {
        description: errorMessage,
      });
    },
  });
}

/**
 * Hook to get escrow pool information
 */
export function useEscrowPool(projectId?: string, milestoneId?: string) {
  return useQuery({
    queryKey: ["escrowPool", projectId, milestoneId],
    queryFn: async () => {
      if (!projectId) return null;

      const params = new URLSearchParams({ projectId });
      if (milestoneId) params.append("milestoneId", milestoneId);

      const response = await apiClient.get(`/api/escrow/pool?${params}`);
      return response.data as EscrowPoolInfo;
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Refetch every 30 seconds to get yield updates
  });
}

/**
 * Hook to get escrow pool balance (including yield)
 */
export function useEscrowBalance(projectId?: string) {
  return useQuery({
    queryKey: ["escrowBalance", projectId],
    queryFn: async () => {
      if (!projectId) return null;

      const response = await apiClient.get(
        `/api/escrow/balance?projectId=${projectId}`
      );
      return response.data as {
        totalBalance: string;
        lockedAmount: string;
        availableAmount: string;
        yieldGenerated: string;
        yieldAPY?: number;
      };
    },
    enabled: !!projectId,
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Hook to withdraw from escrow (sponsor only, after project completion)
 */
export function useWithdrawEscrow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      projectId: string;
      amount: string;
      recipient: string;
    }) => {
      const response = await apiClient.post("/api/escrow/withdraw", params);
      return response.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["project", variables.projectId],
      });
      queryClient.invalidateQueries({ queryKey: ["escrowPool"] });
      queryClient.invalidateQueries({ queryKey: ["escrowBalance"] });

      toast.success("Withdrawn from escrow", {
        description: `${variables.amount} withdrawn successfully`,
      });
    },
    onError: (
      error: Error | { response?: { data?: { message?: string } } }
    ) => {
      const errorMessage =
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message || (error as Error).message;

      toast.error("Failed to withdraw from escrow", {
        description: errorMessage,
      });
    },
  });
}
