"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2 } from "lucide-react";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent multiple executions
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const token = searchParams.get("token");
    const inviteAccepted = searchParams.get("inviteAccepted") === "true";

    if (token) {
      // Store token and login
      login(token);

      // Fetch user data to check onboarding status
      const backend =
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";

      fetch(`${backend}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          const user = data.user;

          // If invite was accepted, go directly to organizations page
          if (inviteAccepted) {
            router.push("/organizations");
            return;
          }

          // Check if onboarding is completed
          if (user.onboardingCompleted) {
            // Redirect to appropriate dashboard based on role
            const dashboardPath =
              user.role === "SPONSOR"
                ? "/dashboard/sponsor"
                : "/dashboard/contributor";
            router.push(dashboardPath);
          } else {
            // Redirect to onboarding
            router.push("/onboarding");
          }
        })
        .catch((err) => {
          console.error("Error fetching user data:", err);
          // Fallback to onboarding if error
          router.push("/onboarding");
        });
    } else {
      // No token, redirect to login
      router.push("/auth/login");
    }
  }, [searchParams, login, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        <h1 className="text-2xl font-bold">Authenticating...</h1>
        <p className="text-muted-foreground">
          Please wait while we log you in.
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </div>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
