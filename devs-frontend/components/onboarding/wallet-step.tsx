"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Wallet, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useLinkWallet } from "@/hooks/use-auth";

interface WalletStepProps {
  onConnected: (address: string) => void;
}

export function WalletStep({ onConnected }: WalletStepProps) {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const linkWallet = useLinkWallet();
  const [isLinking, setIsLinking] = useState(false);

  const handleLinkWallet = async () => {
    if (!address) return;

    try {
      setIsLinking(true);
      const message = `Sign this message to link your wallet to DevSponsor.\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      await linkWallet.mutateAsync({
        walletAddress: address,
        signature,
      });

      toast.success("Wallet linked successfully!");
      onConnected(address);
    } catch (error) {
      console.error("Failed to link wallet:", error);
      toast.error("Failed to link wallet. Please try again.");
    } finally {
      setIsLinking(false);
    }
  };

  if (isConnected && address) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-background border-2 border-green-500 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-green-500" />
            </div>
          </div>
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-bold bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text text-transparent">
            Wallet Connected
          </h3>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-muted">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <p className="text-sm font-mono font-medium">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <Button
            onClick={handleLinkWallet}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
            size="lg"
            disabled={isLinking}
          >
            {isLinking ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Linking Wallet...
              </>
            ) : (
              "Continue to Next Step"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-primary to-purple-500 flex items-center justify-center animate-pulse">
              <Wallet className="w-10 h-10 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-purple-500 blur-xl opacity-50" />
          </div>
        </div>
        <h3 className="text-2xl font-bold">Connect Your Wallet</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Connect your Web3 wallet to securely access DevSponsor and manage your
          projects
        </p>
      </div>

      <Card className="p-6 bg-gradient-to-br from-background to-muted border-2">
        <div className="flex justify-center">
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openAccountModal,
              openChainModal,
              openConnectModal,
              mounted,
            }) => {
              const ready = mounted;
              const connected = ready && account && chain;

              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: {
                      opacity: 0,
                      pointerEvents: "none",
                      userSelect: "none",
                    },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <Button
                          onClick={openConnectModal}
                          size="lg"
                          className="w-full min-w-[280px] bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white font-semibold"
                        >
                          <Wallet className="w-5 h-5 mr-2" />
                          Connect Wallet
                        </Button>
                      );
                    }

                    return null;
                  })()}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3 pt-2">
        <Card className="p-3 text-center">
          <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xs font-medium">Secure</p>
        </Card>
        <Card className="p-3 text-center">
          <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xs font-medium">Fast</p>
        </Card>
        <Card className="p-3 text-center">
          <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </div>
          <p className="text-xs font-medium">Easy</p>
        </Card>
      </div>
    </div>
  );
}
