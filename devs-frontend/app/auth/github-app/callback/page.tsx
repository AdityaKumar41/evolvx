"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

function GitHubAppCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const installationId = searchParams.get("installation_id");
    const setupAction = searchParams.get("setup_action");

    if (setupAction === "install" && installationId) {
      // Installation successful - redirect back to create project page
      setTimeout(() => {
        router.push("/projects/create");
      }, 1500);
    } else if (setupAction === "update") {
      // Update successful
      setTimeout(() => {
        router.push("/projects/create");
      }, 1500);
    } else {
      // Installation failed or cancelled
      setTimeout(() => {
        router.push("/projects/create");
      }, 2000);
    }
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        <h1 className="text-2xl font-bold">
          {searchParams.get("setup_action") === "install"
            ? "GitHub App installed successfully!"
            : "Processing..."}
        </h1>
        <p className="text-muted-foreground">
          Redirecting you back to the project creation page...
        </p>
      </div>
    </div>
  );
}

export default function GitHubAppCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </div>
      }
    >
      <GitHubAppCallbackContent />
    </Suspense>
  );
}
