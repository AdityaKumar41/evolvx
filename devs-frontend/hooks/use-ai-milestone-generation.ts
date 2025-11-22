"use client";

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";

export interface MilestoneGenerationProgress {
  stage:
    | "started"
    | "analyzing-documents"
    | "fetching-github"
    | "generating-claude"
    | "generating-gpt"
    | "saving"
    | "completed"
    | "error";
  message: string;
  progress?: number;
  data?: Record<string, unknown>;
}

export interface StreamedMilestone {
  title: string;
  description: string;
  reward?: number;
  estimatedDays?: number;
  subMilestones?: Array<{ title: string; description: string }>;
}

export function useAIMilestoneGeneration(projectId: string) {
  const [progress, setProgress] = useState<MilestoneGenerationProgress | null>(
    null
  );
  const [streamedMilestones, setStreamedMilestones] = useState<
    StreamedMilestone[]
  >([]);
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();

  // Initialize WebSocket connection
  useEffect(() => {
    if (!projectId) return;

    // Dynamic import to avoid SSR issues
    type SocketType = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on: (event: string, callback: (...args: any[]) => void) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emit: (event: string, ...args: any[]) => void;
      close: () => void;
    };
    let socket: SocketType | null = null;

    const connectWebSocket = async () => {
      try {
        const { io } = await import("socket.io-client");

        const token =
          typeof window !== "undefined"
            ? localStorage.getItem("jwt_token")
            : null;
        if (!token) return;

        const socketUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

        socket = io(socketUrl, {
          auth: {
            token,
          },
          transports: ["websocket"],
        }) as SocketType;

        socket.on("connect", () => {
          console.log("[WS] Connected to WebSocket server");
          setIsConnected(true);
          // Subscribe to project-specific events
          socket?.emit("subscribe:project", projectId);
        });

        socket.on("disconnect", () => {
          console.log("[WS] Disconnected from WebSocket server");
          setIsConnected(false);
        });

        socket.on("connect_error", (error: Error) => {
          console.error("[WS] Connection error:", error);
          setIsConnected(false);
        });

        // Listen for milestone generation progress
        socket.on(
          "milestone:generation:progress",
          (update: MilestoneGenerationProgress) => {
            console.log("[WS] Milestone progress:", update);
            setProgress(update);

            // Clear streamedMilestones when starting new generation
            if (update.stage === "started") {
              setStreamedMilestones([]);
            }

            // Invalidate milestones query when completed
            if (update.stage === "completed") {
              queryClient.invalidateQueries({
                queryKey: ["milestones", projectId],
              });
              queryClient.invalidateQueries({
                queryKey: ["project", projectId],
              });
            }
          }
        );

        // Listen for streamed milestones
        socket.on("milestone:stream", (milestone: StreamedMilestone) => {
          console.log("[WS] Milestone stream:", milestone);
          setStreamedMilestones((prev) => [...prev, milestone]);
        });
      } catch (error) {
        console.error("[WS] Failed to initialize WebSocket:", error);
      }
    };

    connectWebSocket();

    return () => {
      if (socket) {
        console.log("[WS] Cleaning up WebSocket connection");
        socket.emit("unsubscribe:project", projectId);
        socket.close();
      }
    };
  }, [projectId, queryClient]);

  // Mutation for triggering AI milestone generation
  const generateMilestones = useMutation({
    mutationFn: async ({
      prompt,
      documentUrls,
      repositoryUrl,
    }: {
      prompt: string;
      documentUrls?: string[];
      repositoryUrl?: string;
    }) => {
      // Reset state before starting
      setProgress({
        stage: "started",
        message: "Requesting milestone generation...",
        progress: 0,
      });
      setStreamedMilestones([]);

      const response = await apiClient.post(
        `/api/projects/${projectId}/milestones/generate`,
        {
          prompt,
          documentUrls,
          repositoryUrl,
        }
      );
      return response.data;
    },
    onSuccess: () => {
      // Queries will be invalidated by WebSocket event
      console.log("[AI Milestone Gen] Generation request successful");
    },
    onError: (error) => {
      console.error("[AI Milestone Gen] Generation failed:", error);
      setProgress({
        stage: "error",
        message: "Failed to generate milestones. Please try again.",
        progress: 0,
      });
    },
  });

  const resetProgress = useCallback(() => {
    setProgress(null);
    setStreamedMilestones([]);
  }, []);

  return {
    generateMilestones,
    progress,
    streamedMilestones,
    isConnected,
    isGenerating:
      progress?.stage &&
      progress.stage !== "completed" &&
      progress.stage !== "error",
    resetProgress,
  };
}
