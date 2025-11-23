import { useState, useEffect, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { toast } from "sonner";
import apiClient from "@/lib/api-client";

// New SessionKeyRegistry contract address
export const SESSION_KEY_REGISTRY_ADDRESS = process.env
  .NEXT_PUBLIC_SESSION_KEY_REGISTRY_ADDRESS as `0x${string}`;
export const MICROPAYMENT_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_MICROPAYMENT_MANAGER_ADDRESS as `0x${string}`;

export interface SessionKey {
  id: string;
  publicKey: string;
  smartAccountAddress: string;
  maxCreditsPerPrompt: number;
  maxTotalSpend: number;
  totalSpent: number;
  remainingCredits: number;
  expiresAt: string;
  active: boolean;
  registeredOnChain: boolean;
  onChainTxHash?: string;
  status?: "active" | "expired" | "limit_reached" | "revoked";
}

export interface SessionKeyConfig {
  maxCreditsPerPrompt: number; // Max credits per AI prompt (default: 10)
  maxTotalSpend: number; // Total spending limit (default: 1000)
  validDuration: number; // Duration in seconds (default: 30 days)
}

const DEFAULT_CONFIG: SessionKeyConfig = {
  maxCreditsPerPrompt: 10,
  maxTotalSpend: 1000,
  validDuration: 30 * 24 * 60 * 60, // 30 days
};

/**
 * Hook for managing Account Abstraction session keys
 * Enables ONE signature for gasless micropayments
 */
export function useSessionKeys(userId?: string, smartAccountAddress?: string) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionKeys, setSessionKeys] = useState<SessionKey[]>([]);
  const [activeSessionKey, setActiveSessionKey] = useState<SessionKey | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  /**
   * Fetch all session keys for the user
   */
  const fetchSessionKeys = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    try {
      const response = await apiClient.get("/api/session-keys/list");
      setSessionKeys(response.data.sessionKeys || []);
    } catch (error) {
      console.error("Error fetching session keys:", error);
      toast.error("Failed to fetch session keys");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  /**
   * Fetch active session key for smart account
   */
  const fetchActiveSessionKey = useCallback(async () => {
    if (!smartAccountAddress) return;

    try {
      const response = await apiClient.get("/api/session-keys/active", {
        params: { smartAccountAddress },
      });
      setActiveSessionKey(response.data.sessionKey || null);
    } catch (error) {
      console.error("Error fetching active session key:", error);
      setActiveSessionKey(null);
    }
  }, [smartAccountAddress]);

  /**
   * Register a new session key (ONE signature)
   * This is the ONLY time the user needs to sign
   */
  const registerSessionKey = useCallback(
    async (config: Partial<SessionKeyConfig> = {}) => {
      if (!userId || !smartAccountAddress || !address) {
        toast.error("Please connect your wallet first");
        return null;
      }

      setIsRegistering(true);
      try {
        // Step 1: Request signature from user (ONLY ONCE)
        const message = `Authorize session key for gasless AI payments\n\nSmart Account: ${smartAccountAddress}\nValid for: ${
          config.validDuration || DEFAULT_CONFIG.validDuration / 86400
        } days\nMax per prompt: ${
          config.maxCreditsPerPrompt || DEFAULT_CONFIG.maxCreditsPerPrompt
        } credits\nTotal limit: ${
          config.maxTotalSpend || DEFAULT_CONFIG.maxTotalSpend
        } credits`;

        toast.info("Please sign the message in your wallet");
        const signature = await signMessageAsync({ message });

        toast.loading("Registering session key...");

        // Step 2: Backend generates session key and registers on-chain
        const response = await apiClient.post("/api/session-keys/register", {
          userId,
          smartAccountAddress,
          signature,
          config: {
            ...DEFAULT_CONFIG,
            ...config,
          },
        });

        const newSessionKey = response.data.sessionKey;

        toast.success("✅ Session key registered! No more popups needed.");

        // Update state
        setActiveSessionKey(newSessionKey);
        await fetchSessionKeys();

        return newSessionKey;
      } catch (error: any) {
        console.error("Error registering session key:", error);
        toast.error(
          error.response?.data?.error || "Failed to register session key"
        );
        return null;
      } finally {
        setIsRegistering(false);
      }
    },
    [userId, smartAccountAddress, address, signMessageAsync, fetchSessionKeys]
  );

  /**
   * Revoke a session key (database + on-chain)
   */
  const revokeSessionKey = useCallback(
    async (sessionKeyId: string, sessionKeyAddress: string) => {
      if (!smartAccountAddress) return false;

      try {
        toast.loading("Revoking session key...");

        await apiClient.post("/api/session-keys/revoke", {
          sessionKeyId,
          smartAccountAddress,
          sessionKeyAddress,
        });

        toast.success("Session key revoked");

        // Update state
        setSessionKeys((prev) =>
          prev.map((sk) =>
            sk.id === sessionKeyId ? { ...sk, active: false } : sk
          )
        );

        if (activeSessionKey?.id === sessionKeyId) {
          setActiveSessionKey(null);
        }

        return true;
      } catch (error: any) {
        console.error("Error revoking session key:", error);
        toast.error(
          error.response?.data?.error || "Failed to revoke session key"
        );
        return false;
      }
    },
    [smartAccountAddress, activeSessionKey]
  );

  /**
   * Check if session key needs renewal
   */
  const needsRenewal = useCallback(() => {
    if (!activeSessionKey) return true;

    const expiryDate = new Date(activeSessionKey.expiresAt);
    const now = new Date();
    const threeDays = 3 * 24 * 60 * 60 * 1000;

    // Renew if expired or expiring in < 3 days
    return expiryDate.getTime() - now.getTime() < threeDays;
  }, [activeSessionKey]);

  /**
   * Get remaining spending capacity
   */
  const getRemainingCapacity = useCallback(() => {
    if (!activeSessionKey) return 0;
    return activeSessionKey.remainingCredits;
  }, [activeSessionKey]);

  /**
   * Format expiry for display
   */
  const getExpiryStatus = useCallback(() => {
    if (!activeSessionKey) return "No active key";

    const expiryDate = new Date(activeSessionKey.expiresAt);
    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();

    if (diff < 0) return "Expired";

    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (days > 0) return `Expires in ${days}d ${hours}h`;
    if (hours > 0) return `Expires in ${hours}h`;
    return "Expiring soon";
  }, [activeSessionKey]);

  // Load session keys on mount
  useEffect(() => {
    if (userId) {
      fetchSessionKeys();
    }
  }, [userId, fetchSessionKeys]);

  // Load active session key when smart account changes
  useEffect(() => {
    if (smartAccountAddress) {
      fetchActiveSessionKey();
    }
  }, [smartAccountAddress, fetchActiveSessionKey]);

  return {
    sessionKeys,
    activeSessionKey,
    isLoading,
    isRegistering,
    registerSessionKey,
    revokeSessionKey,
    fetchSessionKeys,
    fetchActiveSessionKey,
    needsRenewal,
    getRemainingCapacity,
    getExpiryStatus,
    hasActiveKey: !!activeSessionKey && activeSessionKey.active,
  };
}
