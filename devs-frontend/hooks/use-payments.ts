import { useMutation, useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { Payment } from "@/lib/types";

export function useContributorEarnings(
  timeframe?: "week" | "month" | "year" | "all"
) {
  return useQuery({
    queryKey: ["earnings", timeframe],
    queryFn: async () => {
      const params = timeframe ? `?timeframe=${timeframe}` : "";
      const response = await apiClient.get(`/api/payments/earnings${params}`);
      return response.data;
    },
  });
}

export function useContributorPaymentHistory(page = 1, limit = 20) {
  return useQuery<{ payments: Payment[]; total: number }>({
    queryKey: ["payment-history", page, limit],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/payments/history?page=${page}&limit=${limit}`
      );
      return response.data;
    },
  });
}

export function useProjectPayments(projectId: string) {
  return useQuery<Payment[]>({
    queryKey: ["project-payments", projectId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/payments/project/${projectId}`
      );
      return response.data;
    },
    enabled: !!projectId,
  });
}

export function useRetryPayment() {
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiClient.post(`/api/payments/${paymentId}/retry`);
      return response.data;
    },
  });
}
