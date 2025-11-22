"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-auth";
import { UserRole } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

/**
 * RoleGuard Component
 * Protects routes by checking if the user has one of the allowed roles
 * Redirects to specified page if user doesn't have permission
 */
export function RoleGuard({
  children,
  allowedRoles,
  redirectTo,
}: RoleGuardProps) {
  const router = useRouter();
  const { data: user, isLoading, error } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;

    // If user is not authenticated, redirect to home
    if (error || !user) {
      router.push("/");
      return;
    }

    // If user hasn't completed onboarding, redirect to onboarding
    if (!user.onboardingCompleted) {
      router.push("/onboarding");
      return;
    }

    // If user doesn't have the required role, redirect
    if (!allowedRoles.includes(user.role as UserRole)) {
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        // Default: redirect to appropriate dashboard
        const defaultPath =
          user.role === UserRole.SPONSOR
            ? "/dashboard/sponsor"
            : "/dashboard/contributor";
        router.push(defaultPath);
      }
    }
  }, [user, isLoading, error, allowedRoles, router, redirectTo]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Checking permissions...</p>
        </div>
      </div>
    );
  }

  // Don't render children if user doesn't have permission
  if (
    !user ||
    !user.onboardingCompleted ||
    !allowedRoles.includes(user.role as UserRole)
  ) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Hook to check if current user has a specific role
 */
export function useHasRole(role: UserRole): boolean {
  const { data: user } = useCurrentUser();
  return user?.role === role;
}

/**
 * Hook to check if current user has any of the specified roles
 */
export function useHasAnyRole(roles: UserRole[]): boolean {
  const { data: user } = useCurrentUser();
  return roles.some((role) => user?.role === role);
}
