"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function GitHubCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const token = searchParams.get("token");
        const errorParam = searchParams.get("error");
        const errorDescription = searchParams.get("error_description");

        // Handle OAuth errors
        if (errorParam) {
          const errorMessage =
            errorDescription ||
            errorParam ||
            "Failed to connect GitHub account";
          console.error("GitHub OAuth error:", errorParam, errorDescription);

          // Store error for the GitHub step to display
          localStorage.setItem("github_error", errorMessage);

          setError(errorMessage);

          // Redirect back to onboarding after a short delay
          setTimeout(() => {
            router.push("/onboarding");
          }, 3000);
          return;
        }

        // Handle missing token
        if (!token) {
          const errorMessage = "No authentication token received from GitHub";
          console.error(errorMessage);

          // Store error for the GitHub step to display
          localStorage.setItem("github_error", errorMessage);

          setError(errorMessage);

          // Redirect back to onboarding after a short delay
          setTimeout(() => {
            router.push("/onboarding");
          }, 3000);
          return;
        }

        // Success!
        // Store token and login
        login(token);

        // Clear any previous errors
        localStorage.removeItem("github_error");

        // Redirect back to onboarding
        router.push("/onboarding");
      } catch (err) {
        console.error("Error processing GitHub callback:", err);
        const errorMessage = "An unexpected error occurred";

        // Store error for the GitHub step to display
        localStorage.setItem("github_error", errorMessage);

        setError(errorMessage);

        // Redirect back to onboarding after a short delay
        setTimeout(() => {
          router.push("/onboarding");
        }, 3000);
      }
    };

    handleCallback();
  }, [searchParams, login, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-destructive/50">
          <CardContent className="pt-6 text-center space-y-4">
            <div className="flex justify-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-destructive">
              Connection Failed
            </h1>
            <p className="text-muted-foreground">{error}</p>
            <p className="text-sm text-muted-foreground">
              Redirecting you back to onboarding...
            </p>
            <Button
              variant="outline"
              onClick={() => router.push("/onboarding")}
              className="mt-4"
            >
              Return to Onboarding
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        <h1 className="text-2xl font-bold">Connecting GitHub...</h1>
        <p className="text-muted-foreground">
          Please wait while we verify your account.
        </p>
      </div>
    </div>
  );
}

export default function GitHubCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </div>
      }
    >
      <GitHubCallbackContent />
    </Suspense>
  );
}
