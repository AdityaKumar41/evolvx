"use client";

import React, { useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SessionKeyManager } from "@/components/micropayments/session-key-manager";
import { MicropaymentHistory } from "@/components/micropayments/micropayment-history";
import { useAuth } from "@/components/auth-provider";
import { useAAWallet } from "@/hooks/use-aa-wallet";
import { useSessionKeys } from "@/hooks/use-session-keys";
import { Wallet, Key, History, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export function AADashboard() {
  const { user } = useAuth();
  const { smartAccount, createSmartAccount, isCreating } = useAAWallet({
    userId: user?.id,
    autoCreate: false,
  });

  const { activeSessionKey, hasActiveKey } = useSessionKeys(
    user?.id,
    smartAccount?.smartAccountAddress
  );

  // Auto-create smart account if user doesn't have one
  useEffect(() => {
    if (user && !smartAccount && !isCreating) {
      createSmartAccount();
    }
  }, [user, smartAccount, isCreating, createSmartAccount]);

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Account Abstraction Dashboard</CardTitle>
          <CardDescription>
            Connect your wallet to access gasless AI payments
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Account Abstraction
          </h1>
          <p className="text-muted-foreground mt-1">
            Gasless AI payments with session keys
          </p>
        </div>
        {hasActiveKey && (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <Zap className="h-3 w-3 mr-1" />
            Gasless Mode Active
          </Badge>
        )}
      </div>

      <Separator />

      {/* Smart Account Info */}
      {smartAccount && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Smart Account
            </CardTitle>
            <CardDescription>
              Your account abstraction smart contract wallet
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Address</span>
              <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                {smartAccount.smartAccountAddress.slice(0, 10)}...
                {smartAccount.smartAccountAddress.slice(-8)}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="outline">
                {smartAccount.isDeployed ? "Deployed" : "Virtual"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="session-keys" className="space-y-4">
        <TabsList>
          <TabsTrigger value="session-keys" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Session Keys
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Payment History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="session-keys" className="space-y-4">
          <SessionKeyManager
            smartAccountAddress={smartAccount?.smartAccountAddress}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <MicropaymentHistory limit={100} />
        </TabsContent>
      </Tabs>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="font-semibold">Gasless Transactions</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  All AI payments are sponsored - no gas fees
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <Key className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h4 className="font-semibold">One Signature</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Sign once, use forever (or until expiry)
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Wallet className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h4 className="font-semibold">Smart Account</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  ERC-4337 compliant smart contract wallet
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
