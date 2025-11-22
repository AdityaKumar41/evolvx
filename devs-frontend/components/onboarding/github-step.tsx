"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Github, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useEffect, useState } from "react";

interface GitHubStepProps {
  onConnected: () => void;
}

export function GitHubStep({ onConnected }: GitHubStepProps) {
  const { user, loading, refreshUser } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);

  // Initialize error state from localStorage
  const [githubError, setGithubError] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const storedError = localStorage.getItem("github_error");
      if (storedError) {
        localStorage.removeItem("github_error");
        return storedError;
      }
    }
    return null;
  });

  useEffect(() => {
    // Check if user is already authenticated with GitHub
    if (user?.githubId) {
      onConnected();
      return;
    }

    // Refresh user data when component mounts (in case OAuth just completed)
    if (!loading && !user?.githubId) {
      refreshUser().catch(console.error);
    }
  }, [user, onConnected, loading, refreshUser]);

  const handleGitHubLogin = () => {
    setGithubError(null);
    setIsConnecting(true);
    // Store current step in localStorage to return after OAuth
    localStorage.setItem("onboarding_step", "2");
    // Redirect to GitHub OAuth
    window.location.href = `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/github`;
  };

  if (loading || isConnecting) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Connecting to GitHub...</p>
      </div>
    );
  }

  if (user?.githubId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center">
          <CheckCircle2 className="w-16 h-16 text-green-500" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="text-xl font-semibold">GitHub Connected</h3>
          <p className="text-sm text-muted-foreground">
            @{user.githubUsername || user.name || user.id}
          </p>
        </div>
        <Button onClick={onConnected} className="w-full" size="lg">
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="flex justify-center mb-4">
          <Github className="w-16 h-16 text-primary" />
        </div>
        <h3 className="text-xl font-semibold">Connect GitHub</h3>
        <p className="text-sm text-muted-foreground">
          Link your GitHub account to manage repositories and contributions
        </p>
      </div>

      {githubError && (
        <Card className="p-4 bg-destructive/10 border-destructive/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                Connection Failed
              </p>
              <p className="text-xs text-muted-foreground">{githubError}</p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6 bg-accent/50">
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <span>Track your contributions and commits</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <span>Link pull requests to milestones</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
            <span>Receive automated verification and payments</span>
          </div>
        </div>
      </Card>

      <Button
        onClick={handleGitHubLogin}
        className="w-full"
        size="lg"
        disabled={isConnecting}
      >
        {isConnecting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Github className="w-5 h-5 mr-2" />
            Connect with GitHub
          </>
        )}
      </Button>
    </div>
  );
}
