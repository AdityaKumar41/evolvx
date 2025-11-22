"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { UserRole } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requireAuth?: boolean;
}

export function ProtectedRoute({
  children,
  allowedRoles,
  requireAuth = true,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { user, loading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (loading) return;

    // Check if authentication is required
    if (requireAuth && !isAuthenticated) {
      router.push("/onboarding");
      return;
    }

    // Check if user needs to complete onboarding
    if (user && !user.onboardingCompleted) {
      router.push("/onboarding");
      return;
    }

    // Check if user has required role
    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
      // Redirect to appropriate dashboard
      if (user.role === UserRole.SPONSOR || user.role === UserRole.ADMIN) {
        router.push("/dashboard/sponsor");
      } else if (user.role === UserRole.CONTRIBUTOR) {
        router.push("/dashboard/contributor");
      }
    }
  }, [loading, isAuthenticated, user, router, requireAuth, allowedRoles]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return null;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
