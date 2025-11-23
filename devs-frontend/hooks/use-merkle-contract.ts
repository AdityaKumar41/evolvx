"use client";

import {
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Address } from "viem";
import { toast } from "sonner";
import MerkleCommitStorageABI from "../../contracts/abi/MerkleCommitStorage.json";

// Contract address from deployment
const MERKLE_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_MERKLE_CONTRACT_ADDRESS as Address;

export interface UseMerkleContractProps {
  milestoneId?: bigint;
}

/**
 * Hook to interact with MerkleCommitStorage smart contract using wagmi
 */
export function useMerkleContract({
  milestoneId,
}: UseMerkleContractProps = {}) {
  // Commit milestone root
  const {
    writeContract: commitRoot,
    data: commitRootHash,
    isPending: isCommitRootPending,
    error: commitRootError,
  } = useWriteContract();

  const { isLoading: isCommitRootConfirming, isSuccess: isCommitRootSuccess } =
    useWaitForTransactionReceipt({
      hash: commitRootHash,
    });

  // Commit milestone hash
  const {
    writeContract: commitHash,
    data: commitHashHash,
    isPending: isCommitHashPending,
    error: commitHashError,
  } = useWriteContract();

  const { isLoading: isCommitHashConfirming, isSuccess: isCommitHashSuccess } =
    useWaitForTransactionReceipt({
      hash: commitHashHash,
    });

  // Update milestone root
  const {
    writeContract: updateRoot,
    data: updateRootHash,
    isPending: isUpdateRootPending,
    error: updateRootError,
  } = useWriteContract();

  const { isLoading: isUpdateRootConfirming, isSuccess: isUpdateRootSuccess } =
    useWaitForTransactionReceipt({
      hash: updateRootHash,
    });

  // Read contract data - get milestone root
  const { data: milestoneRoot, refetch: refetchRoot } = useReadContract({
    address: MERKLE_CONTRACT_ADDRESS,
    abi: MerkleCommitStorageABI.abi,
    functionName: "getMilestoneRoot",
    args: milestoneId !== undefined ? [milestoneId] : undefined,
    query: {
      enabled: milestoneId !== undefined,
    },
  });

  // Read contract data - get milestone hash
  const { data: milestoneHash, refetch: refetchHash } = useReadContract({
    address: MERKLE_CONTRACT_ADDRESS,
    abi: MerkleCommitStorageABI.abi,
    functionName: "getMilestoneHash",
    args: milestoneId !== undefined ? [milestoneId] : undefined,
    query: {
      enabled: milestoneId !== undefined,
    },
  });

  /**
   * Commit Merkle root for milestone
   */
  const handleCommitRoot = (
    milestoneId: bigint,
    root: `0x${string}`,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    commitRoot(
      {
        address: MERKLE_CONTRACT_ADDRESS,
        abi: MerkleCommitStorageABI.abi,
        functionName: "commitMilestoneRoot",
        args: [milestoneId, root],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Merkle root committed. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Commit root failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  /**
   * Commit milestone hash
   */
  const handleCommitHash = (
    milestoneId: bigint,
    hash: `0x${string}`,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    commitHash(
      {
        address: MERKLE_CONTRACT_ADDRESS,
        abi: MerkleCommitStorageABI.abi,
        functionName: "commitMilestoneHash",
        args: [milestoneId, hash],
      },
      {
        onSuccess: (txHash) => {
          toast.success(
            `Milestone hash committed. Tx: ${txHash.slice(0, 10)}...`
          );
          callbacks?.onSuccess?.(txHash);
        },
        onError: (error) => {
          toast.error(`Commit hash failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  /**
   * Update existing Merkle root
   */
  const handleUpdateRoot = (
    milestoneId: bigint,
    newRoot: `0x${string}`,
    callbacks?: {
      onSuccess?: (hash: string) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    updateRoot(
      {
        address: MERKLE_CONTRACT_ADDRESS,
        abi: MerkleCommitStorageABI.abi,
        functionName: "updateMilestoneRoot",
        args: [milestoneId, newRoot],
      },
      {
        onSuccess: (hash) => {
          toast.success(`Merkle root updated. Tx: ${hash.slice(0, 10)}...`);
          callbacks?.onSuccess?.(hash);
        },
        onError: (error) => {
          toast.error(`Update root failed: ${error.message}`);
          callbacks?.onError?.(error);
        },
      }
    );
  };

  return {
    // Write functions
    commitRoot: handleCommitRoot,
    commitHash: handleCommitHash,
    updateRoot: handleUpdateRoot,

    // Transaction states
    isCommitRootPending: isCommitRootPending || isCommitRootConfirming,
    isCommitRootSuccess,
    commitRootHash,
    commitRootError,

    isCommitHashPending: isCommitHashPending || isCommitHashConfirming,
    isCommitHashSuccess,
    commitHashHash,
    commitHashError,

    isUpdateRootPending: isUpdateRootPending || isUpdateRootConfirming,
    isUpdateRootSuccess,
    updateRootHash,
    updateRootError,

    // Read data
    milestoneRoot,
    milestoneHash,

    // Refetch functions
    refetchRoot,
    refetchHash,
  };
}
