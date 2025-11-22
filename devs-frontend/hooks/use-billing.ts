import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";

export interface BillingInfo {
  creditBalance: number;
  billingMode: "CREDIT" | "MICROPAYMENT" | "HYBRID";
  currency: string;
}

export interface UsageLog {
  id: string;
  workflow: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  billedVia: string;
  createdAt: string;
  metadata?: any;
}

export function useBilling(userId?: string) {
  const queryClient = useQueryClient();

  const { data: billingInfo, isLoading } = useQuery<BillingInfo>({
    queryKey: ["billing", userId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/billing/credits/balance`);
      return response.data;
    },
    enabled: !!userId,
  });

  const updateBillingMode = useMutation({
    mutationFn: async (mode: "CREDIT" | "MICROPAYMENT" | "HYBRID") => {
      const response = await apiClient.put(`/api/billing/mode`, { mode });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing", userId] });
      toast.success("Billing mode updated");
    },
    onError: () => {
      toast.error("Failed to update billing mode");
    },
  });

  return {
    billingInfo,
    isLoading,
    updateBillingMode: updateBillingMode.mutate,
    isUpdating: updateBillingMode.isPending,
  };
}

export function useUsageLogs(userId?: string, projectId?: string) {
  return useQuery<UsageLog[]>({
    queryKey: ["usage-logs", userId, projectId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/billing/usage`, {
        params: { projectId },
      });
      return response.data.logs || response.data;
    },
    enabled: !!userId,
  });
}

export function useAddCredit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      amount,
      paymentMethod,
    }: {
      amount: number;
      paymentMethod: string;
    }) => {
      const response = await apiClient.post(`/api/billing/credits/add`, {
        amount,
        paymentMethod,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      toast.success("Credits added successfully");
    },
    onError: () => {
      toast.error("Failed to add credits");
    },
  });
}
