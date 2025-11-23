"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAAWallet } from "@/hooks/use-aa-wallet";
import { useSessionKeys } from "@/hooks/use-session-keys";

interface AASetupStepProps {
  userId?: string;
  onComplete: () => void;
}

/**
 * Simple AA Setup: Smart Account + Session Key
 * GitHub-style minimal UI
 */
export function AASetupStep({ userId, onComplete }: AASetupStepProps) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const {
    smartAccount,
    isLoading: isLoadingAccount,
    createSmartAccount,
  } = useAAWallet({ userId, autoCreate: false });
  const { registerSessionKey, isRegistering, activeSessionKey } =
    useSessionKeys(userId, smartAccount?.smartAccountAddress);

  const [step, setStep] = useState<
    "idle" | "creating-account" | "registering-key" | "complete"
  >("idle");

  useEffect(() => {
    if (smartAccount?.smartAccountAddress && activeSessionKey) {
      setStep("complete");
    }
  }, [smartAccount, activeSessionKey]);

  const handleSetup = async () => {
    if (!userId || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    try {
      // Step 1: Create smart account
      if (!smartAccount?.smartAccountAddress) {
        setStep("creating-account");
        toast.loading("Creating smart account...");

        const account = await createSmartAccount();
        if (!account) {
          throw new Error("Failed to create smart account");
        }

        toast.dismiss();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Step 2: Register session key
      setStep("registering-key");

      const message = `Authorize DevSponsor AI Features\n\nEnables gasless AI chat & image generation\nNo wallet popups for 30 days\n\nSmart Account: ${smartAccount?.smartAccountAddress}\nWallet: ${address}`;

      toast.info("Check your wallet to sign");

      await signMessageAsync({ message });

      const sessionKey = await registerSessionKey({
        maxCreditsPerPrompt: 100,
        maxTotalSpend: 10000,
        validDuration: 30 * 24 * 60 * 60,
      });

      if (!sessionKey) {
        throw new Error("Failed to register session key");
      }

      setStep("complete");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      onComplete();
    } catch (error) {
      console.error("AA setup error:", error);
      setStep("idle");

      if (error instanceof Error && error.message.includes("User rejected")) {
        toast.error("Signature required to enable AI features");
      } else {
        toast.error("Setup failed. Please try again.");
      }
    }
  };

  if (isLoadingAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (step === "complete") {
    return (
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-green-500" />
          </div>
        </div>
        <div>
          <p className="font-medium text-green-500">AI Features Enabled</p>
          <p className="text-sm text-muted-foreground">You're all set!</p>
        </div>
      </div>
    );
  }

  if (step !== "idle") {
    return (
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
        <div>
          <p className="font-medium">
            {step === "creating-account" && "Creating account..."}
            {step === "registering-key" && "Check your wallet"}
          </p>
          <p className="text-sm text-muted-foreground">
            {step === "registering-key" && "Sign to enable AI features"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Enable AI Features</h3>
        <p className="text-sm text-muted-foreground">
          Sign once to use AI without wallet popups (30 days)
        </p>
      </div>

      <Button
        onClick={handleSetup}
        size="lg"
        className="w-full"
        disabled={isRegistering || !userId || !address}
      >
        Enable AI Features
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        One signature • No gas fees • Automatic micropayments
      </p>
    </div>
  );
}
