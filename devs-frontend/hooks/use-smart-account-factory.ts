import {
  useWriteContract,
  useReadContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { Address } from "viem";
import { toast } from "sonner";

import SmartAccountFactoryABI from "../../contracts/abi/SmartAccountFactory.json";

// Contract address from deployment
const SMART_ACCOUNT_FACTORY_ADDRESS = process.env
  .NEXT_PUBLIC_SMART_ACCOUNT_FACTORY_ADDRESS as Address;

export interface UseSmartAccountFactoryProps {
  onAccountCreated?: (accountAddress: Address) => void;
}

/**
 * Hook to interact with SmartAccountFactory contract using wagmi
 * Allows sponsors to deploy their own ERC-4337 smart accounts
 */
export function useSmartAccountFactory({
  onAccountCreated,
}: UseSmartAccountFactoryProps = {}) {
  const { address: userAddress } = useAccount();

  // Write: Create Account
  const {
    writeContract: createAccount,
    data: createHash,
    isPending: isCreatePending,
    error: createError,
  } = useWriteContract();

  // Wait for transaction confirmation
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: createHash,
    });

  // Read: Get counterfactual address (before deployment)
  const { data: predictedAddress, refetch: refetchPredictedAddress } =
    useReadContract({
      address: SMART_ACCOUNT_FACTORY_ADDRESS,
      abi: SmartAccountFactoryABI.abi,
      functionName: "getAddress",
      args: userAddress
        ? [userAddress as Address, BigInt(0)] // Default salt = 0
        : undefined,
    });

  // Read: Entry Point
  const { data: entryPoint } = useReadContract({
    address: SMART_ACCOUNT_FACTORY_ADDRESS,
    abi: SmartAccountFactoryABI.abi,
    functionName: "entryPoint",
  });

  // Read: Account Implementation
  const { data: accountImplementation } = useReadContract({
    address: SMART_ACCOUNT_FACTORY_ADDRESS,
    abi: SmartAccountFactoryABI.abi,
    functionName: "accountImplementation",
  });

  /**
   * Create a new smart account for the sponsor
   * @param owner - Owner address (defaults to connected wallet)
   * @param salt - Salt for deterministic address (defaults to 0)
   * @param callbacks - Success/error callbacks
   */
  const deploySmartAccount = (
    owner?: Address,
    salt?: bigint,
    callbacks?: {
      onSuccess?: (accountAddress: Address) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    const ownerAddress = owner || (userAddress as Address);
    const saltValue = salt || BigInt(0);

    if (!ownerAddress) {
      const error = new Error("Owner address is required");
      callbacks?.onError?.(error);
      toast.error("Please connect your wallet first");
      return;
    }

    createAccount(
      {
        address: SMART_ACCOUNT_FACTORY_ADDRESS,
        abi: SmartAccountFactoryABI.abi,
        functionName: "createAccount",
        args: [ownerAddress, saltValue],
      },
      {
        onSuccess: (hash) => {
          toast.success(
            `Smart Account deployment initiated! Tx: ${hash.slice(0, 10)}...`
          );

          // Extract account address from transaction receipt
          // Note: The actual address will be in the SmartAccountCreated event
          if (predictedAddress) {
            callbacks?.onSuccess?.(predictedAddress as Address);
            onAccountCreated?.(predictedAddress as Address);
          }
        },
        onError: (error) => {
          console.error("Error creating smart account:", error);
          callbacks?.onError?.(error as Error);
          toast.error(`Failed to create smart account: ${error.message}`);
        },
      }
    );
  };

  /**
   * Get predicted address for user's smart account
   * @param owner - Owner address
   */
  const getPredictedAddress = async (owner?: Address) => {
    const ownerAddress = owner || (userAddress as Address);

    if (!ownerAddress) {
      return null;
    }

    const { data } = await refetchPredictedAddress();
    return data as Address | null;
  };

  return {
    // Write functions
    deploySmartAccount,
    getPredictedAddress,

    // State
    isCreatePending,
    isConfirming,
    isConfirmed,
    createHash,
    createError,

    // Read data
    predictedAddress: predictedAddress as Address | undefined,
    entryPoint: entryPoint as Address | undefined,
    accountImplementation: accountImplementation as Address | undefined,

    // Contract address
    factoryAddress: SMART_ACCOUNT_FACTORY_ADDRESS,
  };
}
