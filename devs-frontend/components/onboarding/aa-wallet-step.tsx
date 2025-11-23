"use client";

import { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  Sparkles,
  CreditCard,
} from "lucide-react";
import { useAAWallet } from "@/hooks/use-aa-wallet";

interface AAOnboardingStepProps {
  userId?: string;
  userRole?: "SPONSOR" | "CONTRIBUTOR";
  onComplete?: (smartAccountAddress: string) => void;
}

/**
 * Account Abstraction onboarding step
 * Auto-creates smart account without MetaMask popups
 */
export function AAOnboardingStep({
  userId,
  userRole,
  onComplete,
}: AAOnboardingStepProps) {
  const {
    smartAccount,
    isLoading,
    isCreating,
    createSmartAccount,
    hasSmartAccount,
  } = useAAWallet({ userId, autoCreate: false });

  useEffect(() => {
    if (hasSmartAccount && smartAccount?.smartAccountAddress) {
      // Auto-complete after showing success
      const timer = setTimeout(() => {
        onComplete?.(smartAccount.smartAccountAddress);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [hasSmartAccount, smartAccount, onComplete]);

  const handleCreateWallet = async () => {
    await createSmartAccount();
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (hasSmartAccount && smartAccount) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <CardTitle className="text-xl">
                Your EvolvX Smart Wallet is Ready!
              </CardTitle>
              <CardDescription>
                No MetaMask needed - gasless transactions enabled
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-background">
              <span className="text-sm font-medium">Smart Account Address</span>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {smartAccount.smartAccountAddress.slice(0, 10)}...
                {smartAccount.smartAccountAddress.slice(-8)}
              </code>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-background">
              <span className="text-sm font-medium">Network</span>
              <Badge variant="outline">Arbitrum Sepolia</Badge>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-background">
              <span className="text-sm font-medium">Free Credits</span>
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <span className="font-semibold">
                  {smartAccount.creditBalance || "100"}
                </span>
              </div>
            </div>
          </div>

          <Alert>
            <Sparkles className="h-4 w-4" />
            <AlertDescription>
              <strong>What you can do now:</strong>
              <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                {userRole === "SPONSOR" ? (
                  <>
                    <li>Create projects without gas fees</li>
                    <li>Fund milestones with one click</li>
                    <li>Enable yield farming on escrow</li>
                  </>
                ) : (
                  <>
                    <li>Submit work without gas fees</li>
                    <li>Mark milestones complete instantly</li>
                    <li>Receive payments directly</li>
                  </>
                )}
                <li>All transactions are gasless (sponsored by EvolvX)</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="text-xs text-muted-foreground text-center pt-2">
            Redirecting you to dashboard...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <div>
            <CardTitle>Create Your Smart Wallet</CardTitle>
            <CardDescription>
              One-click setup - No crypto wallet needed!
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            <strong>What is a Smart Wallet?</strong>
            <ul className="list-disc list-inside mt-2 text-sm space-y-1">
              <li>✨ No MetaMask popups or transaction signatures</li>
              <li>⛽ Gas-free transactions (we cover the fees)</li>
              <li>🎁 100 free credits to get started</li>
              <li>🔐 Secure and owned by you</li>
              <li>🚀 Web2-like experience on Web3</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="p-4 rounded-lg border bg-muted/30">
            <h4 className="font-medium text-sm mb-2">How it works:</h4>
            <ol className="list-decimal list-inside text-sm space-y-1 text-muted-foreground">
              <li>We create a secure smart contract wallet for you</li>
              <li>Your wallet is funded with 100 free credits</li>
              <li>You can transact without paying gas fees</li>
              <li>All actions are one-click (no popups!)</li>
            </ol>
          </div>

          <Button
            onClick={handleCreateWallet}
            disabled={isCreating}
            className="w-full h-12 text-base"
            size="lg"
          >
            {isCreating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Creating Your Smart Wallet...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Create Smart Wallet (Free)
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Your wallet will be created instantly. No gas fees, no complex
            setup.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
