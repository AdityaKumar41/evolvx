"use client";

import { AADashboard } from "@/components/billing/aa-dashboard";
import { ProtectedRoute } from "@/components/protected-route";

export default function AccountAbstractionPage() {
  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <AADashboard />
      </div>
    </ProtectedRoute>
  );
}
