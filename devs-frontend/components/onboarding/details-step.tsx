"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OnboardingData, UserRole } from "@/lib/types";
import { useCompleteOnboarding } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface DetailsStepProps {
  role: UserRole;
  walletAddress: string;
  onComplete: () => void;
}

export function DetailsStep({ role, onComplete }: DetailsStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const completeOnboarding = useCompleteOnboarding();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (data: Record<string, unknown>) => {
    try {
      setIsSubmitting(true);

      const onboardingData: OnboardingData = {
        role,
        ...data,
      };

      await completeOnboarding.mutateAsync(onboardingData);

      toast.success("Onboarding completed successfully!");
      onComplete();
    } catch (error) {
      console.error("Onboarding error:", error);
      toast.error("Failed to complete onboarding. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (role === UserRole.SPONSOR) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold">Tell us about yourself</h3>
          <p className="text-sm text-muted-foreground">
            Help us personalize your sponsor experience
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              placeholder="John Doe"
              {...register("name", { required: "Name is required" })}
            />
            {errors.name && (
              <p className="text-sm text-destructive">
                {errors.name.message as string}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="organizationName">
              Organization Name (Optional)
            </Label>
            <Input
              id="organizationName"
              placeholder="Acme Corp"
              {...register("organizationName")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="organizationDescription">
              Organization Description (Optional)
            </Label>
            <Textarea
              id="organizationDescription"
              placeholder="Tell us about your organization..."
              rows={3}
              {...register("organizationDescription")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bio">Bio (Optional)</Label>
            <Textarea
              id="bio"
              placeholder="A brief description about yourself and your interests..."
              rows={4}
              {...register("bio")}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Completing Setup...
              </>
            ) : (
              "Complete Setup"
            )}
          </Button>
        </form>
      </div>
    );
  }

  // Contributor form
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-xl font-semibold">Complete your profile</h3>
        <p className="text-sm text-muted-foreground">
          Help projects understand your expertise
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            placeholder="Jane Smith"
            {...register("name", { required: "Name is required" })}
          />
          {errors.name && (
            <p className="text-sm text-destructive">
              {errors.name.message as string}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio *</Label>
          <Textarea
            id="bio"
            placeholder="Tell us about your development experience, skills, and what you're passionate about..."
            rows={4}
            {...register("bio", { required: "Bio is required" })}
          />
          {errors.bio && (
            <p className="text-sm text-destructive">
              {errors.bio.message as string}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="skills">Skills (Optional)</Label>
          <Input
            id="skills"
            placeholder="React, TypeScript, Solidity, Web3..."
            {...register("skills")}
          />
          <p className="text-xs text-muted-foreground">
            Comma-separated list of your skills
          </p>
        </div>

        <Button
          type="submit"
          className="w-full"
          size="lg"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Completing Setup...
            </>
          ) : (
            "Complete Setup"
          )}
        </Button>
      </form>
    </div>
  );
}
