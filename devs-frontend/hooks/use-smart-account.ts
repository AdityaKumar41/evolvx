import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";
import { useSmartAccountContract } from "./use-smart-account-contract";

// New SmartAccountV2 contract address
export const SMART_ACCOUNT_V2_ADDRESS = process.env
  .NEXT_PUBLIC_SMART_ACCOUNT_V2_ADDRESS as `0x${string}`;

export interface SmartAccountInfo {
  address: string;
  creditBalance: number;
  sessionKeys: Array<{
    key: string;
    validUntil: number;
    spendingLimit: string;
    active: boolean;
    totalSpent: number;
  }>;
  isDeployed?: boolean;
  nonce?: number;
}

export interface SessionKeyParams {
  sessionKey: string;
  validUntil: number;
  spendingLimit: string;
}

export function useSmartAccount(userId?: string) {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  // Use wagmi contract hooks
  const smartAccountContract = useSmartAccountContract({
    accountAddress: address as `0x${string}`,
  });

  // Get smart account info
  const { data: accountInfo, isLoading } = useQuery<SmartAccountInfo>({
    queryKey: ["smart-account", userId],
    queryFn: async () => {
      const response = await apiClient.get("/api/wallet/smart-account-info");
      return response.data.accountInfo;
    },
    enabled: !!userId,
  });

  // Get credit balance from contract or API
  const { data: creditBalance, isLoading: isLoadingBalance } = useQuery<number>(
    {
      queryKey: ["credit-balance", userId],
      queryFn: async () => {
        // Try to get from contract first
        if (smartAccountContract.creditBalance) {
          return Number(smartAccountContract.creditBalance);
        }
        // Fallback to API
        const response = await apiClient.get("/api/wallet/credit-balance");
        return response.data.balance;
      },
      enabled: !!userId,
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  );

  // Buy credits - now uses wagmi for blockchain transaction
  const buyCredits = useMutation({
    mutationFn: async (amount: number) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      // Execute the blockchain transaction directly
      return new Promise<{ amount: number; txHash: string }>(
        (resolve, reject) => {
          smartAccountContract.buyCredits(amount, {
            onSuccess: (txHash) => {
              resolve({ amount, txHash });
            },
            onError: (error) => {
              reject(error);
            },
          });
        }
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["credit-balance", userId] });
      queryClient.invalidateQueries({ queryKey: ["smart-account", userId] });
      smartAccountContract.refetchBalance();

      toast.success(
        `Successfully purchased ${data.amount} credits. Tx: ${data.txHash.slice(
          0,
          10
        )}...`
      );
    },
    onError: (error: unknown) => {
      const err = error as Error;
      toast.error(err.message || "Failed to purchase credits");
    },
  });

  // Register session key mutation
  const registerSessionKey = useMutation({
    mutationFn: async (params: SessionKeyParams) => {
      const response = await apiClient.post(
        "/api/wallet/register-session-key",
        params
      );
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["smart-account", userId] });
      toast.success(
        `Session key registered. Tx: ${data.txHash.slice(0, 10)}...`
      );
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(
        err?.response?.data?.message || "Failed to register session key"
      );
    },
  });

  return {
    accountInfo,
    creditBalance,
    isLoading: isLoading || isLoadingBalance,
    buyCredits: buyCredits.mutate,
    isBuyingCredits: buyCredits.isPending || smartAccountContract.isBuyPending,
    registerSessionKey: registerSessionKey.mutate,
    isRegisteringSessionKey: registerSessionKey.isPending,

    // Expose wagmi contract methods for direct use
    smartAccountContract,
  };
}
