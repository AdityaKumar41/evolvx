"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wallet, CheckCircle2, AlertCircle } from "lucide-react";
import { useSmartAccountFactory } from "@/hooks/use-smart-account-factory";
import { toast } from "sonner";
import apiClient from "@/lib/api-client";

interface SmartAccountSetupProps {
  onComplete?: (smartAccountAddress: string) => void;
}

export function SmartAccountSetup({ onComplete }: SmartAccountSetupProps) {
  const { address, isConnected } = useAccount();
  const [isCheckingAccount, setIsCheckingAccount] = useState(false);
  const [hasSmartAccount, setHasSmartAccount] = useState(false);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(
    null
  );

  const {
    deploySmartAccount,
    predictedAddress,
    isCreatePending,
    isConfirming,
    isConfirmed,
  } = useSmartAccountFactory({
    onAccountCreated: async (accountAddress) => {
      // Notify backend about the new smart account
      try {
        await apiClient.post("/api/wallet/register-smart-account", {
          smartAccountAddress: accountAddress,
        });

        setSmartAccountAddress(accountAddress);
        setHasSmartAccount(true);
        toast.success("Smart Account registered successfully!");
        onComplete?.(accountAddress);
      } catch (error) {
        console.error("Error registering smart account:", error);
        toast.error("Failed to register smart account with backend");
      }
    },
  });

  // Check if user already has a smart account
  useEffect(() => {
    const checkSmartAccount = async () => {
      if (!isConnected || !address) return;

      setIsCheckingAccount(true);
      try {
        const response = await apiClient.get("/api/wallet/smart-account-info");

        if (response.data.accountInfo?.smartAccountAddress) {
          setSmartAccountAddress(response.data.accountInfo.smartAccountAddress);
          setHasSmartAccount(true);
        }
      } catch (error) {
        console.error("Error checking smart account:", error);
        // If error, user likely doesn't have an account yet
        setHasSmartAccount(false);
      } finally {
        setIsCheckingAccount(false);
      }
    };

    checkSmartAccount();
  }, [isConnected, address]);

  const handleDeployAccount = () => {
    deploySmartAccount(undefined, undefined, {
      onSuccess: (accountAddress) => {
        console.log("Smart Account deployed at:", accountAddress);
      },
      onError: (error) => {
        console.error("Deployment error:", error);
      },
    });
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Smart Account Setup</CardTitle>
          <CardDescription>
            Connect your wallet to set up a smart account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Please connect your wallet to continue
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isCheckingAccount) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Smart Account Setup</CardTitle>
          <CardDescription>
            Checking your smart account status...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (hasSmartAccount && smartAccountAddress) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <CardTitle>Smart Account Active</CardTitle>
          </div>
          <CardDescription>
            Your ERC-4337 smart account is ready to use
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-1">
              Smart Account Address
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background px-2 py-1 rounded">
                {smartAccountAddress}
              </code>
              <Badge variant="outline" className="text-xs">
                Active
              </Badge>
            </div>
          </div>

          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Your smart account supports gasless transactions and credit-based
              payments. You can now create projects and manage escrow deposits.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deploy Smart Account</CardTitle>
        <CardDescription>
          Create your ERC-4337 smart account to enable gasless transactions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">Your Wallet Address</div>
          <code className="text-xs bg-muted px-2 py-1 rounded block">
            {address}
          </code>
        </div>

        {predictedAddress && (
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Predicted Smart Account Address
            </div>
            <code className="text-xs bg-muted px-2 py-1 rounded block">
              {predictedAddress}
            </code>
          </div>
        )}

        <Alert>
          <Wallet className="h-4 w-4" />
          <AlertDescription>
            <strong>What is a Smart Account?</strong>
            <ul className="list-disc list-inside mt-2 text-sm space-y-1">
              <li>Supports gasless transactions via paymaster</li>
              <li>Credit-based payments for AI services</li>
              <li>Session keys for delegated access</li>
              <li>Enhanced security with multi-sig capabilities</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Button
            onClick={handleDeployAccount}
            disabled={isCreatePending || isConfirming}
            className="w-full"
          >
            {isCreatePending || isConfirming ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isCreatePending ? "Deploying..." : "Confirming..."}
              </>
            ) : (
              <>
                <Wallet className="mr-2 h-4 w-4" />
                Deploy Smart Account
              </>
            )}
          </Button>

          {isConfirmed && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-600">
                Smart Account deployed successfully! Registering with backend...
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          <strong>Note:</strong> Deploying a smart account requires a one-time
          gas fee. Once deployed, many transactions can be gasless through the
          paymaster.
        </div>
      </CardContent>
    </Card>
  );
}
