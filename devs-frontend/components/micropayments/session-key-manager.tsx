import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSessionKeys } from "@/hooks/use-session-keys";
import { useAuth } from "@/components/auth-provider";
import { useAccount } from "wagmi";
import {
  Key,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface SessionKeyManagerProps {
  smartAccountAddress?: string;
}

export function SessionKeyManager({
  smartAccountAddress,
}: SessionKeyManagerProps) {
  const { user } = useAuth();
  const { address } = useAccount();
  const {
    activeSessionKey,
    sessionKeys,
    isLoading,
    isRegistering,
    registerSessionKey,
    revokeSessionKey,
    needsRenewal,
    getRemainingCapacity,
    getExpiryStatus,
    hasActiveKey,
  } = useSessionKeys(user?.id, smartAccountAddress);

  if (!address) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Session Keys
          </CardTitle>
          <CardDescription>
            Connect your wallet to manage session keys
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleRegister = async () => {
    await registerSessionKey({
      maxCreditsPerPrompt: 10,
      maxTotalSpend: 1000,
      validDuration: 30 * 24 * 60 * 60, // 30 days
    });
  };

  const handleRevoke = async (keyId: string, keyAddress: string) => {
    if (confirm("Are you sure you want to revoke this session key?")) {
      await revokeSessionKey(keyId, keyAddress);
    }
  };

  const spendingPercentage = activeSessionKey
    ? (activeSessionKey.totalSpent / activeSessionKey.maxTotalSpend) * 100
    : 0;

  return (
    <div className="space-y-4">
      {/* Active Session Key Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Gasless Payments Status
          </CardTitle>
          <CardDescription>
            Session keys enable gasless AI payments without popups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasActiveKey ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-900 dark:text-amber-100">
                    No Active Session Key
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Register a session key to enable gasless AI payments. You'll
                    sign
                    <strong> once</strong> and never see a wallet popup again
                    for AI prompts.
                  </p>
                </div>
              </div>

              <Button
                onClick={handleRegister}
                disabled={isRegistering || !smartAccountAddress}
                className="w-full"
                size="lg"
              >
                <Key className="mr-2 h-4 w-4" />
                {isRegistering
                  ? "Registering..."
                  : "Register Session Key (Sign Once)"}
              </Button>

              {!smartAccountAddress && (
                <p className="text-sm text-muted-foreground text-center">
                  Smart account required. It will be created automatically when
                  you connect.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="font-semibold">Active & Ready</span>
                </div>
                <Badge
                  variant="outline"
                  className="bg-green-50 text-green-700 border-green-200"
                >
                  No Popups Mode
                </Badge>
              </div>

              <Separator />

              {/* Key Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Expiry */}
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Expiration</p>
                    <p className="text-sm text-muted-foreground">
                      {getExpiryStatus()}
                    </p>
                    {needsRenewal() && (
                      <Badge variant="destructive" className="mt-1">
                        Renewal Needed
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Spending Limit */}
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Spending Limit</p>
                    <p className="text-sm text-muted-foreground">
                      {getRemainingCapacity()} /{" "}
                      {activeSessionKey?.maxTotalSpend ?? 0} credits
                    </p>
                  </div>
                </div>
              </div>

              {/* Spending Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Usage</span>
                  <span className="font-medium">
                    {spendingPercentage.toFixed(1)}%
                  </span>
                </div>
                <Progress
                  value={spendingPercentage}
                  className={cn(
                    spendingPercentage > 80 && "bg-red-100",
                    spendingPercentage > 50 &&
                      spendingPercentage <= 80 &&
                      "bg-amber-100"
                  )}
                />
              </div>

              {/* On-chain Info */}
              {activeSessionKey?.onChainTxHash && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Registered on-chain</span>
                  <a
                    href={`https://sepolia.arbiscan.io/tx/${activeSessionKey.onChainTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                  >
                    View TX
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}

              <Separator />

              {/* Actions */}
              <div className="flex gap-2">
                {needsRenewal() && (
                  <Button
                    onClick={handleRegister}
                    disabled={isRegistering}
                    variant="default"
                    className="flex-1"
                  >
                    <Key className="mr-2 h-4 w-4" />
                    Renew Session Key
                  </Button>
                )}
                {activeSessionKey && (
                  <Button
                    onClick={() =>
                      handleRevoke(
                        activeSessionKey.id,
                        activeSessionKey.publicKey
                      )
                    }
                    variant="outline"
                    className="flex-1"
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Revoke Key
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Session Keys */}
      {sessionKeys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">All Session Keys</CardTitle>
            <CardDescription>
              Manage all your session keys across devices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sessionKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm">
                        {key.publicKey.slice(0, 10)}...{key.publicKey.slice(-8)}
                      </p>
                      <Badge variant={key.active ? "default" : "secondary"}>
                        {key.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(key.expiresAt).toLocaleDateString()} •
                      {key.remainingCredits} credits remaining
                    </p>
                  </div>
                  {key.active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevoke(key.id, key.publicKey)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                How Session Keys Work
              </h4>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
                <li>
                  <strong>One signature</strong> when you register the session
                  key
                </li>
                <li>
                  <strong>Zero popups</strong> for all AI prompts afterward
                </li>
                <li>
                  <strong>Gasless payments</strong> - no transaction fees
                </li>
                <li>
                  <strong>Automatic spending limits</strong> protect your
                  account
                </li>
                <li>
                  <strong>Keys expire</strong> after 30 days for security
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
