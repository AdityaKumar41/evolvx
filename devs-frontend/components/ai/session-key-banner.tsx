"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { useSessionKeys } from "@/hooks/use-session-keys";
import { useAAWallet } from "@/hooks/use-aa-wallet";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";

interface SessionKeyBannerProps {
  userId?: string;
  compact?: boolean;
}

export function SessionKeyBanner({
  userId,
  compact = false,
}: SessionKeyBannerProps) {
  const { smartAccount, isLoading: isLoadingWallet } = useAAWallet({
    userId,
    autoCreate: true,
  });
  const {
    hasActiveKey,
    activeSessionKey,
    isLoading,
    needsRenewal,
    getRemainingCapacity,
  } = useSessionKeys(userId, smartAccount?.smartAccountAddress);

  // Show loading state while creating wallet or checking session key
  if (isLoading || isLoadingWallet) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Shield className="w-4 h-4 animate-pulse" />
        <span>
          {isLoadingWallet
            ? "Setting up your smart account..."
            : "Checking session key..."}
        </span>
      </div>
    );
  }

  // No smart account (shouldn't happen with autoCreate, but keep as fallback)
  if (!smartAccount?.smartAccountAddress) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Smart Account Required</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>You need a smart account to use AI features.</p>
          <Button asChild size="sm">
            <Link href="/billing/account-abstraction">Complete Onboarding</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // No active session key
  if (!hasActiveKey || !activeSessionKey) {
    return (
      <Alert variant="destructive">
        <Shield className="h-4 w-4" />
        <AlertTitle>Session Key Required</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Register a session key to use AI features without wallet popups on
            every prompt!
          </p>
          <Button asChild size="sm">
            <Link href="/billing/account-abstraction">
              <Shield className="w-4 h-4 mr-2" />
              Register Session Key (One Signature)
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Session key expired
  if (new Date(activeSessionKey.expiresAt) < new Date()) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Session Key Expired</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Your session key has expired. Please renew it to continue using AI
            features.
          </p>
          <Button asChild size="sm">
            <Link href="/billing/account-abstraction">Renew Session Key</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Session key needs renewal soon
  if (needsRenewal()) {
    const expiresIn = formatDistanceToNow(
      new Date(activeSessionKey.expiresAt),
      { addSuffix: true }
    );

    return (
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertTitle>Session Key Expiring Soon</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Your session key expires {expiresIn}. Renew it to avoid
            interruptions.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing/account-abstraction">Renew Now</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Active session key - compact view
  if (compact) {
    const remainingCapacity = getRemainingCapacity();

    return (
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="outline" className="gap-1">
          <CheckCircle2 className="w-3 h-3 text-green-500" />
          <span>Gasless Mode Active</span>
        </Badge>
        <span className="text-muted-foreground">
          {remainingCapacity}% credits remaining
        </span>
      </div>
    );
  }

  // Active session key - full view
  const remainingCapacity = getRemainingCapacity();
  const expiresIn = formatDistanceToNow(new Date(activeSessionKey.expiresAt), {
    addSuffix: true,
  });
  const totalSpent = Number(activeSessionKey.totalSpent);
  const maxTotalSpend = Number(activeSessionKey.maxTotalSpend);

  return (
    <Alert className="border-green-500/50 bg-green-500/5">
      <CheckCircle2 className="h-4 w-4 text-green-500" />
      <AlertTitle className="text-green-700 dark:text-green-400">
        ✨ Gasless Mode Active - No Wallet Popups!
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Credits Used: {totalSpent} / {maxTotalSpend}
            </span>
            <span className="text-muted-foreground">
              {remainingCapacity}% remaining
            </span>
          </div>
          <Progress value={remainingCapacity} className="h-2" />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Expires {expiresIn}
          </span>
          <Button
            asChild
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
          >
            <Link href="/billing/account-abstraction">
              Manage Session Keys
              <ExternalLink className="w-3 h-3 ml-1" />
            </Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
