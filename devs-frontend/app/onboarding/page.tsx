"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage } from "wagmi";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { UserRole } from "@/lib/types";
import { useLinkWallet, useCompleteOnboarding } from "@/hooks/use-auth";
import { useAuth } from "@/components/auth-provider";

const transitionProps = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
  mass: 0.5,
};

function ChipButton({
  label,
  isSelected,
  onClick,
}: {
  label: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      layout
      initial={false}
      animate={{
        backgroundColor: isSelected ? "#1e3a5f" : "rgba(39, 39, 42, 0.5)",
      }}
      whileHover={{
        backgroundColor: isSelected ? "#1e3a5f" : "rgba(39, 39, 42, 0.8)",
      }}
      whileTap={{
        backgroundColor: isSelected ? "#152943" : "rgba(39, 39, 42, 0.9)",
      }}
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 30,
        mass: 0.5,
        backgroundColor: { duration: 0.1 },
      }}
      className={`
        inline-flex items-center px-4 py-2 rounded-full text-base font-medium
        whitespace-nowrap overflow-hidden ring-1 ring-inset
        ${
          isSelected
            ? "text-blue-400 ring-[hsla(0,0%,100%,0.12)]"
            : "text-zinc-400 ring-[hsla(0,0%,100%,0.06)]"
        }
      `}
    >
      <span>{label}</span>
    </motion.button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { refreshUser } = useAuth();
  const linkWallet = useLinkWallet();
  const completeOnboarding = useCompleteOnboarding();

  const [currentStep, setCurrentStep] = useState(1);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isWalletLinked, setIsWalletLinked] = useState(false);
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [formData, setFormData] = useState({
    displayName: "",
    bio: "",
    skills: "",
    organization: "",
  });

  const totalSteps = 5;

  // If a JWT token exists (set by the auth callback), fetch current user
  // to determine GitHub/wallet connection and pre-fill profile fields.
  // Also redirect if onboarding is already completed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("jwt_token");
    if (!token) return;

    const backend =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`${backend}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!mounted) return;
        if (res.ok) {
          const data = await res.json();
          const user = data.user;

          // If user has already completed onboarding, redirect to dashboard
          if (user.onboardingCompleted) {
            const dashboardPath =
              user.role === UserRole.SPONSOR
                ? "/dashboard/sponsor"
                : "/dashboard/contributor";
            router.push(dashboardPath);
            return;
          }

          setIsGithubConnected(!!user.githubId);
          if (user.walletAddress) {
            setWalletAddress(user.walletAddress);
            setIsWalletLinked(true);
          }
          if (user.name) {
            setFormData((prev) => ({ ...prev, displayName: user.name }));
          } else if (user.githubUsername) {
            setFormData((prev) => ({
              ...prev,
              displayName: user.githubUsername,
            }));
          }
          if (user.bio) {
            setFormData((prev) => ({ ...prev, bio: user.bio }));
          }
          if (user.skills && user.skills.length > 0) {
            setFormData((prev) => ({
              ...prev,
              skills: user.skills.join(", "),
            }));
          }
          if (user.organizationName) {
            setFormData((prev) => ({
              ...prev,
              organization: user.organizationName,
            }));
          }
          if (user.role) {
            setSelectedRole(user.role as UserRole);
          }
        }
      } catch (err) {
        console.error("Failed to fetch current user after OAuth:", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleWalletLink = async () => {
    if (!address) return;

    try {
      const message = `Sign this message to link your wallet to DevSponsor.\n\nWallet: ${address}\nTimestamp: ${Date.now()}`;
      const signature = await signMessageAsync({ message });

      await linkWallet.mutateAsync({
        walletAddress: address,
        signature,
      });

      setWalletAddress(address);
      setIsWalletLinked(true);
      toast.success("Wallet linked successfully!");
    } catch (error) {
      console.error("Failed to link wallet:", error);
      toast.error("Failed to link wallet");
    }
  };

  const handleGithubConnect = () => {
    // Store the current onboarding state before redirect
    if (typeof window !== "undefined") {
      localStorage.setItem("onboarding_step", currentStep.toString());
      if (walletAddress) {
        localStorage.setItem("onboarding_wallet", walletAddress);
      }
    }
    // Redirect to backend GitHub OAuth endpoint
    const backend =
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
    window.location.href = `${backend}/auth/github`;
  };

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!selectedRole) return;

    try {
      const response = await completeOnboarding.mutateAsync({
        role: selectedRole,
        name: formData.displayName,
        bio: formData.bio,
        skills: formData.skills
          ? formData.skills.split(",").map((s) => s.trim())
          : undefined,
        organizationName: formData.organization || undefined,
      });

      // Refresh user data in AuthProvider to get updated role
      await refreshUser();

      toast.success("Onboarding completed!");

      // Redirect based on the role from the response
      if (
        response.user?.role === UserRole.SPONSOR ||
        response.user?.role === UserRole.ADMIN
      ) {
        router.push("/dashboard/sponsor");
      } else {
        router.push("/dashboard/contributor");
      }
    } catch (error) {
      console.error("Failed to complete onboarding:", error);
      toast.error("Failed to complete onboarding");
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return isConnected && isWalletLinked;
      case 2:
        return isGithubConnected;
      case 3:
        return selectedRole !== null;
      case 4:
        return formData.displayName.trim() !== "" && formData.bio.trim() !== "";
      case 5:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-[540px]">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-zinc-500 text-sm font-medium">
              Step {currentStep} of {totalSteps}
            </span>
          </div>
          <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500"
              initial={{ width: "0%" }}
              animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            />
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {currentStep === 1 && (
              <div>
                <h1 className="text-white text-xl font-semibold mb-4">
                  Connect Your Wallet
                </h1>
                <p className="text-zinc-400 text-base mb-12">
                  Link your wallet to get started with DevSponsor
                </p>
                <div className="flex flex-col items-center gap-6">
                  <ConnectButton />
                  {isConnected && !isWalletLinked && (
                    <button
                      onClick={handleWalletLink}
                      className="px-6 py-3 rounded-full font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all"
                    >
                      Link Wallet
                    </button>
                  )}
                  {isWalletLinked && (
                    <div className="text-center">
                      <p className="text-zinc-400 text-sm">Wallet Connected</p>
                      <p className="text-white font-mono text-sm mt-1">
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div>
                <h1 className="text-white text-xl font-semibold mb-4">
                  Connect GitHub Account
                </h1>
                <p className="text-zinc-400 text-base mb-12">
                  Link your GitHub account to track contributions
                </p>
                <div className="flex flex-col items-center gap-6">
                  {!isGithubConnected ? (
                    <button
                      onClick={handleGithubConnect}
                      className="px-6 py-3 rounded-full font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all"
                    >
                      Connect with GitHub
                    </button>
                  ) : (
                    <div className="text-center">
                      <p className="text-green-400 font-medium">
                        GitHub Connected
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div>
                <h1 className="text-white text-xl font-semibold mb-4">
                  Choose Your Role
                </h1>
                <p className="text-zinc-400 text-base mb-12">
                  Select how you want to participate
                </p>
                <motion.div
                  className="flex flex-wrap gap-3 overflow-visible"
                  layout
                  transition={transitionProps}
                >
                  <ChipButton
                    label="Sponsor"
                    isSelected={selectedRole === UserRole.SPONSOR}
                    onClick={() => setSelectedRole(UserRole.SPONSOR)}
                  />
                  <ChipButton
                    label="Contributor"
                    isSelected={selectedRole === UserRole.CONTRIBUTOR}
                    onClick={() => setSelectedRole(UserRole.CONTRIBUTOR)}
                  />
                </motion.div>
              </div>
            )}

            {currentStep === 4 && (
              <div>
                <h1 className="text-white text-xl font-semibold mb-4">
                  Complete Your Profile
                </h1>
                <p className="text-zinc-400 text-base mb-12">
                  Tell us a bit about yourself
                </p>
                <div className="space-y-6">
                  <div>
                    <Label className="text-zinc-300 mb-2 block">
                      Display Name
                    </Label>
                    <Input
                      placeholder="Your name"
                      value={formData.displayName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          displayName: e.target.value,
                        })
                      }
                      className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-300 mb-2 block">Bio</Label>
                    <Textarea
                      placeholder="Tell us about yourself"
                      value={formData.bio}
                      onChange={(e) =>
                        setFormData({ ...formData, bio: e.target.value })
                      }
                      className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600 min-h-[100px]"
                    />
                  </div>
                  {selectedRole === UserRole.CONTRIBUTOR && (
                    <div>
                      <Label className="text-zinc-300 mb-2 block">Skills</Label>
                      <Input
                        placeholder="React, Node.js, Solidity..."
                        value={formData.skills}
                        onChange={(e) =>
                          setFormData({ ...formData, skills: e.target.value })
                        }
                        className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                      />
                    </div>
                  )}
                  {selectedRole === UserRole.SPONSOR && (
                    <div>
                      <Label className="text-zinc-300 mb-2 block">
                        Organization
                      </Label>
                      <Input
                        placeholder="Company or project name"
                        value={formData.organization}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            organization: e.target.value,
                          })
                        }
                        className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-600"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div>
                <h1 className="text-white text-xl font-semibold mb-4">
                  Review Your Information
                </h1>
                <p className="text-zinc-400 text-base mb-12">
                  Make sure everything looks good before submitting
                </p>
                <div className="space-y-6">
                  <div className="p-6 border border-zinc-800 bg-[rgba(25,25,28,0)] rounded-3xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-medium">Wallet</h3>
                      <button
                        onClick={() => setCurrentStep(1)}
                        className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="text-zinc-400 font-mono text-sm">
                      {walletAddress
                        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(
                            -4
                          )}`
                        : "Not connected"}
                    </p>
                  </div>

                  <div className="p-6 border border-zinc-800 bg-[rgba(25,25,28,0)] rounded-3xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-medium">GitHub</h3>
                      <button
                        onClick={() => setCurrentStep(2)}
                        className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="text-zinc-400">
                      {isGithubConnected ? "Connected" : "Not connected"}
                    </p>
                  </div>

                  <div className="p-6 border border-zinc-800 bg-[rgba(25,25,28,0)] rounded-3xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-medium">Role</h3>
                      <button
                        onClick={() => setCurrentStep(3)}
                        className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
                      >
                        Edit
                      </button>
                    </div>
                    <p className="text-zinc-400">
                      {selectedRole === UserRole.SPONSOR
                        ? "Sponsor"
                        : selectedRole === UserRole.CONTRIBUTOR
                        ? "Contributor"
                        : "Not selected"}
                    </p>
                  </div>

                  <div className="p-6 border border-zinc-800 bg-[rgba(25,25,28,0)] rounded-3xl">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-white font-medium">Profile</h3>
                      <button
                        onClick={() => setCurrentStep(4)}
                        className="text-blue-400 hover:text-blue-300 transition-colors text-sm"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="space-y-2">
                      <p className="text-zinc-400">
                        <span className="text-zinc-500">Name:</span>{" "}
                        {formData.displayName || "Not provided"}
                      </p>
                      <p className="text-zinc-400">
                        <span className="text-zinc-500">Bio:</span>{" "}
                        {formData.bio || "Not provided"}
                      </p>
                      {selectedRole === UserRole.CONTRIBUTOR &&
                        formData.skills && (
                          <p className="text-zinc-400">
                            <span className="text-zinc-500">Skills:</span>{" "}
                            {formData.skills}
                          </p>
                        )}
                      {selectedRole === UserRole.SPONSOR &&
                        formData.organization && (
                          <p className="text-zinc-400">
                            <span className="text-zinc-500">Organization:</span>{" "}
                            {formData.organization}
                          </p>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-12 flex justify-between items-center">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${
              currentStep === 1
                ? "opacity-0 pointer-events-none"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {currentStep < totalSteps ? (
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`flex items-center gap-2 px-6 py-3 rounded-full font-medium transition-all ${
                canProceed()
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
              }`}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 px-6 py-3 rounded-full font-medium bg-blue-500 text-white hover:bg-blue-600 transition-all"
            >
              Complete Onboarding
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
