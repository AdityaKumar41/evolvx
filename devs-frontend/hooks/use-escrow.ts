import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";
import { useEscrowContract } from "./use-escrow-contract";
import { useMerkleContract } from "./use-merkle-contract";

export interface EscrowBalance {
  totalAmount: string;
  lockedAmount: string;
  availableAmount: string;
  yieldGenerated: string;
  tokenAddress: string;
  status: "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";
}

export interface SubmitOnchainResult {
  success: boolean;
  merkleRoot: string;
  projectHash: string;
  txHash?: string;
  message: string;
}

export interface DepositToEscrowParams {
  amount: string;
  tokenAddress: string;
}

export function useEscrow(projectId?: string) {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  // Use wagmi contract hooks
  const escrowContract = useEscrowContract();
  const merkleContract = useMerkleContract();

  // Get escrow balance for project
  const { data: escrowBalance, isLoading } = useQuery<EscrowBalance>({
    queryKey: ["escrow-balance", projectId],
    queryFn: async () => {
      const response = await apiClient.get(
        `/api/projects/${projectId}/escrow-balance`
      );
      return response.data.balance;
    },
    enabled: !!projectId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Submit project to onchain (generates Merkle tree)
  const submitProjectOnchain = useMutation({
    mutationFn: async (projectId: string) => {
      const response = await apiClient.post(
        `/api/projects/${projectId}/submit-onchain`
      );
      return response.data;
    },
    onSuccess: (data: SubmitOnchainResult) => {
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast.success(
        data.message || "Project submitted to onchain successfully"
      );
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(
        err?.response?.data?.message || "Failed to submit project onchain"
      );
    },
  });

  // Deposit to escrow - now uses wagmi for actual blockchain transaction
  const depositToEscrow = useMutation({
    mutationFn: async ({
      projectId,
      amount,
      tokenAddress,
    }: {
      projectId: string;
      amount: string;
      tokenAddress: string;
    }) => {
      if (!address) {
        throw new Error("Wallet not connected");
      }

      // First, call backend to prepare the transaction data
      const response = await apiClient.post(
        `/api/projects/${projectId}/prepare-deposit`,
        {
          amount,
          tokenAddress,
        }
      );

      const { milestoneId } = response.data;

      // Return data needed for the wagmi transaction
      return {
        projectId,
        milestoneId: BigInt(milestoneId),
        amount,
        tokenAddress: tokenAddress as `0x${string}`,
        sponsor: address as `0x${string}`,
      };
    },
    onSuccess: (data) => {
      // Execute the blockchain transaction using wagmi
      escrowContract.depositToEscrow(
        data.milestoneId,
        data.sponsor,
        data.tokenAddress,
        data.amount,
        {
          onSuccess: (txHash) => {
            queryClient.invalidateQueries({
              queryKey: ["escrow-balance", data.projectId],
            });
            queryClient.invalidateQueries({
              queryKey: ["project", data.projectId],
            });
            toast.success(
              `Successfully deposited ${
                data.amount
              } to escrow. Tx: ${txHash.slice(0, 10)}...`
            );
          },
          onError: (error) => {
            toast.error(`Deposit failed: ${error.message}`);
          },
        }
      );
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || "Failed to prepare deposit");
    },
  });

  return {
    escrowBalance,
    isLoading,
    submitProjectOnchain: submitProjectOnchain.mutate,
    isSubmittingOnchain: submitProjectOnchain.isPending,
    depositToEscrow: depositToEscrow.mutate,
    isDepositingToEscrow:
      depositToEscrow.isPending || escrowContract.isDepositPending,

    // Expose wagmi contract methods for direct use
    escrowContract,
    merkleContract,
  };
}
