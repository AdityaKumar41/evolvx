"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEscrow } from "@/hooks/use-escrow";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

interface SubmitToOnchainButtonProps {
  projectId: string;
  projectStatus: string;
  tokenAddress?: string;
  totalMilestoneReward?: number;
  onSuccess?: () => void;
}

export function SubmitToOnchainButton({
  projectId,
  projectStatus,
  tokenAddress = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73", // Default WPOL
  totalMilestoneReward = 0,
  onSuccess,
}: SubmitToOnchainButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(
    totalMilestoneReward.toString()
  );
  const [step, setStep] = useState<"submit" | "deposit">("submit");
  const { address, isConnected } = useAccount();

  const {
    submitProjectOnchain,
    isSubmittingOnchain,
    depositToEscrow,
    isDepositingToEscrow,
  } = useEscrow(projectId);

  // Only show button if project is in DRAFT status
  if (projectStatus !== "DRAFT") {
    return null;
  }

  if (!isConnected) {
    return (
      <Button disabled className="gap-2">
        <Upload className="h-4 w-4" />
        Connect Wallet to Submit
      </Button>
    );
  }

  const handleSubmitOnchain = async () => {
    try {
      // This calls the backend to generate Merkle tree and prepare onchain submission
      submitProjectOnchain(projectId, {
        onSuccess: (data) => {
          toast.success(
            `Merkle root generated: ${data.merkleRoot.slice(0, 10)}...`
          );
          setStep("deposit");
        },
        onError: (error) => {
          console.error("Error submitting to onchain:", error);
          toast.error("Failed to submit project to onchain");
        },
      });
    } catch (error) {
      console.error("Error submitting to onchain:", error);
    }
  };

  const handleDepositToEscrow = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("Please enter a valid deposit amount");
      return;
    }

    if (!address) {
      toast.error("Wallet not connected");
      return;
    }

    try {
      // This will trigger wagmi transaction through the hook
      depositToEscrow(
        {
          projectId,
          amount: depositAmount,
          tokenAddress,
        },
        {
          onSuccess: () => {
            toast.success("Deposit completed successfully!");
            setIsOpen(false);
            setStep("submit");
            onSuccess?.();
          },
          onError: (error) => {
            console.error("Error depositing to escrow:", error);
            toast.error("Failed to deposit to escrow");
          },
        }
      );
    } catch (error) {
      console.error("Error depositing to escrow:", error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" />
          Submit to Onchain
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        {step === "submit" ? (
          <>
            <DialogHeader>
              <DialogTitle>Submit Project to Onchain</DialogTitle>
              <DialogDescription>
                This will generate a Merkle tree from your milestones and submit
                it to the blockchain. This action is required before depositing
                funds to escrow.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">What happens next:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Merkle tree will be generated from your milestones</li>
                  <li>
                    Merkle root will be stored in MerkleCommitStorage contract
                  </li>
                  <li>Project hash will be registered in MilestoneManager</li>
                  <li>
                    After confirmation, you can deposit funds to activate the
                    project
                  </li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isSubmittingOnchain}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitOnchain}
                disabled={isSubmittingOnchain}
              >
                {isSubmittingOnchain ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Submit to Onchain
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Deposit to Escrow</DialogTitle>
              <DialogDescription>
                Your project has been successfully submitted to the blockchain.
                Now deposit funds to activate it and allow contributors to start
                working.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Deposit Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="Enter amount in tokens"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: {totalMilestoneReward} tokens (total milestone
                  rewards)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="token">Token Address</Label>
                <Input id="token" value={tokenAddress} disabled />
                <p className="text-xs text-muted-foreground">
                  WPOL token on Arbitrum Sepolia
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <p className="font-medium mb-1">Connected Wallet:</p>
                <p className="font-mono">{address}</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("submit");
                  setIsOpen(false);
                }}
                disabled={isDepositingToEscrow}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDepositToEscrow}
                disabled={isDepositingToEscrow}
              >
                {isDepositingToEscrow ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Depositing...
                  </>
                ) : (
                  "Deposit & Activate"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
