"use client";

import {
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, Address } from "viem";
import { toast } from "sonner";
import EscrowAndYieldABI from "../../contracts/abi/EscrowAndYield.json";

// Contract address from deployment
const ESCROW_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS as Address;

export interface UseEscrowContractProps {
  milestoneId?: bigint;
}

/**
 * Hook to interact with EscrowAndYield smart contract using wagmi
 */
export function useEscrowContract({
  milestoneId,
}: UseEscrowContractProps = {}) {
  // Deposit to escrow
  const {
    writeContract: depositToEscrow,
    data: depositHash,
    isPending: isDepositPending,
    error: depositError,
  } = useWriteContract();

  const { isLoading: isDepositConfirming, isSuccess: isDepositSuccess } =
    useWaitForTransactionReceipt({
      hash: depositHash,
    });

  // Deposit to yield
  const {
    writeContract: depositToYield,
    data: yieldHash,
    isPending: isYieldPending,
    error: yieldError,
  } = useWriteContract();

  const { isLoading: isYieldConfirming, isSuccess: isYieldSuccess } =
    useWaitForTransactionReceipt({
      hash: yieldHash,
    });

  // Release sub-milestone payment
  const {
    writeContract: releasePayment,
    data: releaseHash,
    isPending: isReleasePending,
    error: releaseError,
  } = useWriteContract();

  const { isLoading: isReleaseConfirming, isSuccess: isReleaseSuccess } =
    useWaitForTransactionReceipt({
      hash: releaseHash,
    });

  // Withdraw remaining funds
  const {
    writeContract: withdrawRemaining,
    data: withdrawHash,
    isPending: isWithdrawPending,
    error: withdrawError,
  } = useWriteContract();

  const { isLoading: isWithdrawConfirming, isSuccess: isWithdrawSuccess } =
    useWaitForTransactionReceipt({
      hash: withdrawHash,
    });

  // Read contract data - get deposit info
  const { data: depositInfo, refetch: refetchDeposit } = useReadContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: EscrowAndYieldABI.abi,
    functionName: "getDeposit",
    args: milestoneId ? [milestoneId] : undefined,
    query: {
      enabled: !!milestoneId,
    },
  });

  // Read contract data - get available balance
  const { data: availableBalance, refetch: refetchBalance } = useReadContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: EscrowAndYieldABI.abi,
    functionName: "getAvailableBalance",
    args: milestoneId ? [milestoneId] : undefined,
    query: {
      enabled: !!milestoneId,
    },
  });

  // Check if sub-milestone is paid
  const { data: isSubMilestonePaid } = useReadContract({
    address: ESCROW_CONTRACT_ADDRESS,
    abi: EscrowAndYieldABI.abi,
    functionName: "isSubMilestonePaid",
    args:
      milestoneId !== undefined
        ? [milestoneId, BigInt(0)] // You can pass subIndex as param
        : undefined,
    query: {
      enabled: milestoneId !== undefined,
    },
  });

  /**
   * Deposit funds to escrow mode
   */
  const handleDepositToEscrow = (
    milestoneId: bigint,
    sponsor: Address,
    token: Address,
    amount: string,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    depositToEscrow(
      {
        address: ESCROW_CONTRACT_ADDRESS,
        abi: EscrowAndYieldABI.abi,
        functionName: "depositToEscrowInternal",
        args: [milestoneId, sponsor, token, parseEther(amount)],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Deposit initiated. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Deposit failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  /**
   * Deposit funds to yield mode
   */
  const handleDepositToYield = (
    milestoneId: bigint,
    sponsor: Address,
    token: Address,
    amount: string,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    depositToYield(
      {
        address: ESCROW_CONTRACT_ADDRESS,
        abi: EscrowAndYieldABI.abi,
        functionName: "depositToYieldInternal",
        args: [milestoneId, sponsor, token, parseEther(amount)],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Yield deposit initiated. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Yield deposit failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  /**
   * Release payment for completed sub-milestone
   */
  const handleReleasePayment = (
    milestoneId: bigint,
    subIndex: bigint,
    contributor: Address,
    amount: string,
    proof: `0x${string}`[],
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    releasePayment(
      {
        address: ESCROW_CONTRACT_ADDRESS,
        abi: EscrowAndYieldABI.abi,
        functionName: "releaseSubMilestonePayment",
        args: [milestoneId, subIndex, contributor, parseEther(amount), proof],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Payment released. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Payment release failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  /**
   * Withdraw remaining funds after milestone completion
   */
  const handleWithdrawRemaining = (
    milestoneId: bigint,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    withdrawRemaining(
      {
        address: ESCROW_CONTRACT_ADDRESS,
        abi: EscrowAndYieldABI.abi,
        functionName: "withdrawRemaining",
        args: [milestoneId],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Withdrawal initiated. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Withdrawal failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  return {
    // Write functions
    depositToEscrow: handleDepositToEscrow,
    depositToYield: handleDepositToYield,
    releasePayment: handleReleasePayment,
    withdrawRemaining: handleWithdrawRemaining,

    // Transaction states
    isDepositPending: isDepositPending || isDepositConfirming,
    isDepositSuccess,
    depositHash,
    depositError,

    isYieldPending: isYieldPending || isYieldConfirming,
    isYieldSuccess,
    yieldHash,
    yieldError,

    isReleasePending: isReleasePending || isReleaseConfirming,
    isReleaseSuccess,
    releaseHash,
    releaseError,

    isWithdrawPending: isWithdrawPending || isWithdrawConfirming,
    isWithdrawSuccess,
    withdrawHash,
    withdrawError,

    // Read data
    depositInfo,
    availableBalance,
    isSubMilestonePaid,

    // Refetch functions
    refetchDeposit,
    refetchBalance,
  };
}
