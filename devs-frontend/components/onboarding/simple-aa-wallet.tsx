"use client";

import { useEffect } from "react";
import { useAAWallet } from "@/hooks/use-aa-wallet";
import { Loader2 } from "lucide-react";

interface SimpleAAWalletProps {
  userId?: string;
  onComplete?: (smartAccountAddress: string) => void;
}

/**
 * Simple AA wallet creation matching GitHub login style
 */
export function SimpleAAWallet({ userId, onComplete }: SimpleAAWalletProps) {
  const { smartAccount, isLoading, isCreating, createSmartAccount } =
    useAAWallet({ userId, autoCreate: false });

  useEffect(() => {
    if (smartAccount?.smartAccountAddress) {
      const timer = setTimeout(() => {
        onComplete?.(smartAccount.smartAccountAddress);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [smartAccount, onComplete]);

  const handleCreate = async () => {
    await createSmartAccount();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (smartAccount?.smartAccountAddress) {
    return (
      <div className="text-center">
        <p className="text-green-400 font-medium">Smart Wallet Created</p>
        <p className="text-zinc-500 text-sm mt-2">
          {smartAccount.smartAccountAddress.slice(0, 6)}...
          {smartAccount.smartAccountAddress.slice(-4)}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={handleCreate}
      disabled={isCreating}
      className="px-6 py-3 rounded-full font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {isCreating ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating...
        </>
      ) : (
        "Create Smart Wallet"
      )}
    </button>
  );
}
