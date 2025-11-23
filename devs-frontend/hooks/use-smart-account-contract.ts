"use client";

import {
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Address } from "viem";
import { toast } from "sonner";
import CreditManagerABI from "../../contracts/abi/CreditManagerV2.json";

// Contract address from deployment
const CREDIT_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_CREDIT_MANAGER_ADDRESS as Address;

export interface UseSmartAccountContractProps {
  accountAddress?: Address;
}

/**
 * Hook to interact with CreditManager smart contract using wagmi
 */
export function useSmartAccountContract({
  accountAddress,
}: UseSmartAccountContractProps = {}) {
  // Buy credits
  const {
    writeContract: buyCredits,
    data: buyHash,
    isPending: isBuyPending,
    error: buyError,
  } = useWriteContract();

  const { isLoading: isBuyConfirming, isSuccess: isBuySuccess } =
    useWaitForTransactionReceipt({
      hash: buyHash,
    });

  // Spend credits
  const {
    writeContract: spendCredits,
    data: spendHash,
    isPending: isSpendPending,
    error: spendError,
  } = useWriteContract();

  const { isLoading: isSpendConfirming, isSuccess: isSpendSuccess } =
    useWaitForTransactionReceipt({
      hash: spendHash,
    });

  // Read contract data - get credit balance
  const { data: creditBalance, refetch: refetchBalance } = useReadContract({
    address: CREDIT_MANAGER_ADDRESS,
    abi: CreditManagerABI.abi,
    functionName: "getBalance",
    args: accountAddress ? [accountAddress] : undefined,
    query: {
      enabled: !!accountAddress,
    },
  });

  // Read contract data - get credit price
  const { data: creditPrice } = useReadContract({
    address: CREDIT_MANAGER_ADDRESS,
    abi: CreditManagerABI.abi,
    functionName: "getCreditPrice",
  });

  /**
   * Buy credits for smart account
   */
  const handleBuyCredits = (
    amount: number,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    if (!creditPrice) {
      toast.error("Credit price not loaded");
      return;
    }

    const totalCost = BigInt(amount) * (creditPrice as bigint);

    buyCredits(
      {
        address: CREDIT_MANAGER_ADDRESS,
        abi: CreditManagerABI.abi,
        functionName: "buyCredits",
        args: [BigInt(amount)],
        value: totalCost,
      },
      {
        onSuccess: (hash) => {
          toast.success(`Credits purchased. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Purchase failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  /**
   * Spend credits from smart account
   */
  const handleSpendCredits = (
    amount: number,
    purpose: string,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    spendCredits(
      {
        address: CREDIT_MANAGER_ADDRESS,
        abi: CreditManagerABI.abi,
        functionName: "spendCredits",
        args: [BigInt(amount), purpose],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Credits spent. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Spend failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  return {
    // Write functions
    buyCredits: handleBuyCredits,
    spendCredits: handleSpendCredits,

    // Transaction states
    isBuyPending: isBuyPending || isBuyConfirming,
    isBuySuccess,
    buyHash,
    buyError,

    isSpendPending: isSpendPending || isSpendConfirming,
    isSpendSuccess,
    spendHash,
    spendError,

    // Read data
    creditBalance,
    creditPrice,

    // Refetch functions
    refetchBalance,
  };
}
