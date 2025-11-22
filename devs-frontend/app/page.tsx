"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      // Not authenticated, go to onboarding
      router.push("/onboarding");
    } else if (user.onboardingCompleted) {
      // Authenticated and onboarded, go to dashboard
      const dashboardPath =
        user.role === "SPONSOR"
          ? "/dashboard/sponsor"
          : "/dashboard/contributor";
      router.push(dashboardPath);
    } else {
      // Authenticated but not onboarded, go to onboarding
      router.push("/onboarding");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
    </div>
  );
}
