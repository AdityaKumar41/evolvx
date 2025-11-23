import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { Address } from "viem";
import { toast } from "sonner";
import apiClient from "@/lib/api-client";

export interface SmartAccountInfo {
  smartAccountAddress: string;
  creditBalance: string;
  isDeployed: boolean;
  sessionKeys: Array<{
    key: string;
    expiresAt: number;
    spendingLimit: string;
  }>;
}

export interface UseAAWalletOptions {
  userId?: string;
  autoCreate?: boolean; // Auto-create smart account on mount
}

/**
 * Hook for managing Account Abstraction wallet
 * This provides a Web2-like experience without MetaMask popups
 */
export function useAAWallet({
  userId,
  autoCreate = false,
}: UseAAWalletOptions = {}) {
  const { address: eoaAddress } = useAccount();
  const [smartAccount, setSmartAccount] = useState<SmartAccountInfo | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  /**
   * Create smart account without user interaction
   * This happens in the background via backend
   */
  const createSmartAccount = useCallback(async () => {
    if (!userId) {
      toast.error("User ID is required");
      return null;
    }

    setIsCreating(true);
    try {
      // Call backend to create smart account using RootManager
      const response = await apiClient.post(
        "/api/wallet/create-smart-account",
        {
          ownerAddress: eoaAddress || undefined,
          initialCredits: 100, // Free credits for new users
        }
      );

      // Backend returns { success, smartAccount: {...}, message }
      const { smartAccount: accountData } = response.data;

      const newSmartAccount: SmartAccountInfo = {
        smartAccountAddress: accountData.smartAccountAddress,
        creditBalance: accountData.creditBalance,
        isDeployed: true,
        sessionKeys: accountData.sessionKeys || [],
      };

      setSmartAccount(newSmartAccount);

      toast.success("Your EvolvX Smart Wallet is Ready!", {
        description: `Address: ${accountData.smartAccountAddress.slice(
          0,
          10
        )}...`,
      });

      return newSmartAccount;
    } catch (error) {
      console.error("Error creating smart account:", error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(
        err?.response?.data?.message || "Failed to create smart account"
      );
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [userId, eoaAddress]);

  // Fetch existing smart account
  useEffect(() => {
    if (!userId) return;

    const fetchSmartAccount = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.get("/api/wallet/smart-account-info");

        if (response.data.accountInfo) {
          setSmartAccount(response.data.accountInfo);
        } else if (autoCreate && eoaAddress) {
          // Auto-create if enabled
          await createSmartAccount();
        }
      } catch (error) {
        console.error("Error fetching smart account:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSmartAccount();
  }, [userId, autoCreate, eoaAddress, createSmartAccount]);

  /**
   * Execute a gasless transaction
   * No MetaMask popup, sponsored by paymaster
   */
  const executeGasless = async (
    target: Address,
    data: `0x${string}`,
    value: bigint = BigInt(0)
  ) => {
    if (!smartAccount) {
      toast.error("Smart account not initialized");
      return null;
    }

    try {
      // Send UserOperation via backend bundler
      const response = await apiClient.post("/api/wallet/execute-transaction", {
        smartAccountAddress: smartAccount.smartAccountAddress,
        target,
        data,
        value: value.toString(),
      });

      return response.data.txHash;
    } catch (error) {
      console.error("Error executing gasless transaction:", error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || "Transaction failed");
      return null;
    }
  };

  /**
   * Register a session key for auto-signing
   * Allows transactions without approval for 7 days
   */
  const registerSessionKey = async (
    sessionKey: Address,
    validUntil: number,
    spendingLimit: string
  ) => {
    if (!smartAccount) {
      toast.error("Smart account not initialized");
      return false;
    }

    try {
      await apiClient.post("/api/wallet/register-session-key", {
        sessionKey,
        validUntil,
        spendingLimit,
      });

      // Update local state
      setSmartAccount((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sessionKeys: [
            ...prev.sessionKeys,
            { key: sessionKey, expiresAt: validUntil, spendingLimit },
          ],
        };
      });

      toast.success("Session key registered - Auto-sign enabled for 7 days");
      return true;
    } catch (error) {
      console.error("Error registering session key:", error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(
        err?.response?.data?.message || "Failed to register session key"
      );
      return false;
    }
  };

  /**
   * Fund smart account with crypto
   */
  const fundAccount = async (amount: string, tokenAddress?: Address) => {
    if (!smartAccount) {
      toast.error("Smart account not initialized");
      return false;
    }

    try {
      await apiClient.post("/api/wallet/fund-account", {
        amount,
        tokenAddress,
      });

      toast.success(`Funded ${amount} to your smart wallet`);
      return true;
    } catch (error) {
      console.error("Error funding account:", error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || "Failed to fund account");
      return false;
    }
  };

  /**
   * Buy credits using smart account
   */
  const buyCredits = async (amount: number) => {
    if (!smartAccount) {
      toast.error("Smart account not initialized");
      return false;
    }

    try {
      const response = await apiClient.post("/api/wallet/buy-credits", {
        amount,
      });

      setSmartAccount((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          creditBalance: response.data.newBalance,
        };
      });

      toast.success(`Purchased ${amount} credits`);
      return true;
    } catch (error) {
      console.error("Error buying credits:", error);
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err?.response?.data?.message || "Failed to buy credits");
      return false;
    }
  };

  return {
    // State
    smartAccount,
    isLoading,
    isCreating,
    hasSmartAccount: !!smartAccount,

    // Actions
    createSmartAccount,
    executeGasless,
    registerSessionKey,
    fundAccount,
    buyCredits,

    // Helper getters
    smartAccountAddress: smartAccount?.smartAccountAddress,
    creditBalance: smartAccount?.creditBalance,
    isDeployed: smartAccount?.isDeployed,
  };
}
