"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Loader2, Sparkles, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { useAAWallet } from "@/hooks/use-aa-wallet";
import { useSessionKeys } from "@/hooks/use-session-keys";

interface AASetupStepProps {
  userId?: string;
  onComplete: () => void;
}

/**
 * Complete AA Setup: Smart Account + Session Key
 * User signs ONCE to enable gasless AI features
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
    // Check if already complete
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
      // Step 1: Create smart account (if not exists)
      if (!smartAccount?.smartAccountAddress) {
        setStep("creating-account");
        toast.loading("Creating your smart account...");

        const account = await createSmartAccount();
        if (!account) {
          throw new Error("Failed to create smart account");
        }

        toast.dismiss();
        toast.success("Smart account created!");

        // Wait a bit for backend to process
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Step 2: Register session key (ONE signature)
      setStep("registering-key");

      const message = `Authorize DevSponsor AI Features\n\nThis signature enables:\n✅ Gasless AI chat & image generation\n✅ No wallet popups for 30 days\n✅ Automatic micropayments\n\nSmart Account: ${smartAccount?.smartAccountAddress}\nWallet: ${address}`;

      toast.info("Sign to enable AI features (one-time)", {
        description: "This is the ONLY signature you'll need",
      });

      await signMessageAsync({ message });

      // Register session key with backend
      const sessionKey = await registerSessionKey({
        maxCreditsPerPrompt: 100, // Higher limit for micropayments
        maxTotalSpend: 10000, // Higher total limit
        validDuration: 30 * 24 * 60 * 60, // 30 days
      });

      if (!sessionKey) {
        throw new Error("Failed to register session key");
      }

      setStep("complete");

      // Small delay for visual feedback
      await new Promise((resolve) => setTimeout(resolve, 1500));

      onComplete();
    } catch (error) {
      console.error("AA setup error:", error);
      setStep("idle");

      if (error instanceof Error && error.message.includes("User rejected")) {
        toast.error(
          "Signature cancelled. AI features won't work without this."
        );
      } else {
        toast.error("Setup failed. Please try again.");
      }
    }
  };

  // Loading state
  if (isLoadingAccount) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading account info...</p>
      </div>
    );
  }

  // Complete state
  if (step === "complete") {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-14 h-14 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 blur-2xl opacity-40 animate-pulse" />
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-bold text-green-500 mb-2">
            ✨ AI Features Activated!
          </h3>
          <p className="text-muted-foreground">
            You can now use AI chat, image generation, and more - all without
            wallet popups
          </p>
        </div>

        <Card className="p-4 bg-green-500/10 border-green-500/20">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <Shield className="h-5 w-5 text-green-500 mx-auto mb-1" />
              <p className="font-medium text-green-500">Gasless</p>
              <p className="text-xs text-muted-foreground">No fees</p>
            </div>
            <div>
              <Zap className="h-5 w-5 text-green-500 mx-auto mb-1" />
              <p className="font-medium text-green-500">Instant</p>
              <p className="text-xs text-muted-foreground">No popups</p>
            </div>
            <div>
              <Sparkles className="h-5 w-5 text-green-500 mx-auto mb-1" />
              <p className="font-medium text-green-500">30 Days</p>
              <p className="text-xs text-muted-foreground">Valid for</p>
            </div>
          </div>
        </Card>

        <Button
          onClick={onComplete}
          size="lg"
          className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
        >
          Continue to Profile
        </Button>
      </div>
    );
  }

  // Setup in progress
  if (step !== "idle") {
    return (
      <div className="space-y-6 text-center">
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-2">
            {step === "creating-account" && "Creating Smart Account..."}
            {step === "registering-key" && "Registering Session Key..."}
          </h3>
          <p className="text-sm text-muted-foreground">
            {step === "creating-account" && "Setting up your gasless wallet"}
            {step === "registering-key" &&
              "Please sign the message in your wallet"}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm">Smart Account</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            {step === "registering-key" ? (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            ) : (
              <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
            )}
            <span className="text-sm">Session Key</span>
          </div>
        </div>
      </div>
    );
  }

  // Initial setup prompt
  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-primary to-purple-500 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-purple-500 blur-xl opacity-50" />
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-bold mb-2">Enable AI Features</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Sign once to unlock gasless AI chat, image generation, and more - no
            popups for 30 days!
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-4 bg-gradient-to-br from-background to-muted border-2">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">One Signature</p>
              <p className="text-sm text-muted-foreground">
                Sign once, then no more wallet popups for 30 days
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">Gasless AI</p>
              <p className="text-sm text-muted-foreground">
                Use AI features without paying gas fees
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">1000 Credits</p>
              <p className="text-sm text-muted-foreground">
                Enough for hundreds of AI prompts
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Button
        onClick={handleSetup}
        size="lg"
        className="w-full bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
        disabled={isRegistering || !userId || !address}
      >
        <Sparkles className="w-5 h-5 mr-2" />
        Enable AI Features (Sign Once)
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        By continuing, you authorize a session key for gasless transactions up
        to 1000 credits over 30 days
      </p>
    </div>
  );
}
