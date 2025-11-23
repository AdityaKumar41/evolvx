"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";

// New MicropaymentManager contract address
export const MICROPAYMENT_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_MICROPAYMENT_MANAGER_ADDRESS as `0x${string}`;
export const MICROPAYMENT_PAYMASTER_ADDRESS = process.env
  .NEXT_PUBLIC_MICROPAYMENT_PAYMASTER_ADDRESS as `0x${string}`;

// TypeScript interfaces
export interface CostCalculation {
  baseCredits: number;
  platformFeeCredits: number;
  totalCredits: number;
  complexity: "SIMPLE" | "MEDIUM" | "COMPLEX" | "VERY_COMPLEX";
}

export interface MicropaymentHistory {
  id: string;
  credits: number;
  platformFeeCredits: number;
  totalCredits: number;
  promptComplexity: "SIMPLE" | "MEDIUM" | "COMPLEX" | "VERY_COMPLEX";
  status: "PENDING" | "SUCCESS" | "FAILED";
  promptText?: string;
  aiResponse?: string;
  createdAt: string;
  settledAt?: string;
  userOpHash?: string;
  transactionHash?: string;
}

/**
 * Calculate cost for a prompt (no mutation needed, just calculation)
 */
export function useCalculateCost() {
  return async (
    promptText: string,
    estimatedTokens?: number
  ): Promise<CostCalculation> => {
    const response = await apiClient.post("/api/micropayment/calculate-cost", {
      promptText,
      estimatedTokens,
    });
    return response.data.cost;
  };
}

/**
 * Get micropayment history (AI usage)
 */
export function useMicropaymentHistory(limit: number = 100) {
  return useQuery({
    queryKey: ["micropaymentHistory", limit],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/micropayment/history?limit=${limit}`
      );
      return response.data.micropayments as MicropaymentHistory[];
    },
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Get statistics from micropayment history
 */
export function useMicropaymentStats() {
  const { data: history } = useMicropaymentHistory(1000);

  if (!history || history.length === 0) {
    return {
      totalSpent: 0,
      totalPrompts: 0,
      averageCost: 0,
      successfulPayments: 0,
    };
  }

  const totalSpent = history.reduce(
    (sum, payment) => sum + Number(payment.totalCredits),
    0
  );
  const totalPrompts = history.length;
  const successfulPayments = history.filter(
    (p) => p.status === "SUCCESS"
  ).length;
  const averageCost = totalSpent / totalPrompts;

  return {
    totalSpent,
    totalPrompts,
    averageCost,
    successfulPayments,
  };
}

/**
 * Charge micropayment for AI prompt (via session key - gasless)
 */
export function useChargeMicropayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      promptText: string;
      estimatedTokens?: number;
    }) => {
      const response = await apiClient.post("/api/micropayment/charge", {
        promptText: params.promptText,
        estimatedTokens: params.estimatedTokens,
      });
      return response.data;
    },
    onSuccess: (data) => {
      // Invalidate queries to refresh balance and history
      queryClient.invalidateQueries({ queryKey: ["micropaymentHistory"] });
      queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      queryClient.invalidateQueries({ queryKey: ["smart-account"] });

      // Show success toast with cost
      if (data.cost) {
        toast.success(
          `AI prompt charged: ${data.cost.totalCredits} credits (${data.cost.complexity})`,
          {
            description: data.userOpHash
              ? `UserOp: ${data.userOpHash.slice(0, 10)}...`
              : "Gasless payment via session key",
          }
        );
      }
    },
    onError: (error: any) => {
      toast.error("Failed to charge micropayment", {
        description: error.response?.data?.message || error.message,
      });
    },
  });
}

/**
 * Get current session key balance and spending info
 */
export function useSessionKeyBalance() {
  return useQuery({
    queryKey: ["sessionKeyBalance"],
    queryFn: async () => {
      const response = await apiClient.get("/api/session-keys/balance");
      return response.data as {
        totalSpent: number;
        remainingCredits: number;
        maxTotalSpend: number;
        maxPerPrompt: number;
        expiresAt: string;
        isExpired: boolean;
        limitReached: boolean;
      };
    },
    refetchInterval: 10000, // Refetch every 10 seconds during active usage
  });
}
