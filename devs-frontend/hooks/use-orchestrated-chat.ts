import { useState, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { useSessionKeys } from "@/hooks/use-session-keys";
import { useAAWallet } from "@/hooks/use-aa-wallet";

export type IntentType =
  | "information_query"
  | "code_analysis"
  | "milestone_generation"
  | "code_modification"
  | "architecture_review"
  | "general_chat";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
}

export interface OrchestrationArtifact {
  type:
    | "milestone_roadmap"
    | "code_analysis"
    | "architecture_diagram"
    | "code_changes";
  data?: Record<string, unknown>;
  milestoneWorkflowTriggered?: boolean;
  repositoryUrl?: string;
  documentContents?: string[];
}

export interface CodebaseContext {
  relevantFiles: Array<{
    path: string;
    content: string;
    similarity: number;
  }>;
  summary: string;
}

export interface OrchestrationResponse {
  intent: IntentType;
  chatResponse: string;
  artifacts?: OrchestrationArtifact;
  codebaseContext?: CodebaseContext;
  confidence?: number;
  nextActions?: Array<{
    action: string;
    description: string;
  }>;
}

interface UseOrchestratedChatOptions {
  projectId: string;
  userId?: string;
  onArtifactGenerated?: (artifact: OrchestrationArtifact) => void;
  onIntentDetected?: (intent: IntentType, confidence: number) => void;
}

export function useOrchestratedChat({
  projectId,
  userId,
  onArtifactGenerated,
  onIntentDetected,
}: UseOrchestratedChatOptions) {
  const queryClient = useQueryClient();
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const [currentIntent, setCurrentIntent] = useState<IntentType | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isProcessingDocuments, setIsProcessingDocuments] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // AA + Session Key integration
  const { smartAccount } = useAAWallet({ userId, autoCreate: true });
  const { hasActiveKey, activeSessionKey, fetchActiveSessionKey } =
    useSessionKeys(userId, smartAccount?.smartAccountAddress);

  // Verify session key before sending
  const checkSessionKey = useCallback(async () => {
    // Check for smart account
    if (!smartAccount?.smartAccountAddress) {
      toast.error("Smart account required", {
        description: "Please complete onboarding to use AI features.",
      });
      return false;
    }

    // Refresh and check for active session key
    await fetchActiveSessionKey();
    if (!hasActiveKey) {
      toast.error("Session key required", {
        description:
          "Please register a session key to use AI features (no wallet popups!)",
        action: {
          label: "Register Now",
          onClick: () =>
            (window.location.href = "/billing/account-abstraction"),
        },
      });
      return false;
    }

    // Check session key expiry
    if (activeSessionKey && new Date(activeSessionKey.expiresAt) < new Date()) {
      toast.error("Session key expired", {
        description: "Your session key has expired. Please renew it.",
        action: {
          label: "Renew Now",
          onClick: () =>
            (window.location.href = "/billing/account-abstraction"),
        },
      });
      return false;
    }

    return true;
  }, [smartAccount, hasActiveKey, activeSessionKey, fetchActiveSessionKey]);

  // Non-streaming chat mutation with session key wrapper
  const sendMessageMutation = useMutation({
    mutationFn: async ({
      message,
      repositoryUrl,
      documentContents,
      documentFiles,
    }: {
      message: string;
      repositoryUrl?: string;
      documentContents?: string[];
      documentFiles?: File[];
    }) => {
      // Use FormData if files are provided
      if (documentFiles && documentFiles.length > 0) {
        const formData = new FormData();
        formData.append("message", message);
        if (repositoryUrl) formData.append("repositoryUrl", repositoryUrl);
        if (conversationHistory.length > 0) {
          formData.append(
            "conversationHistory",
            JSON.stringify(conversationHistory)
          );
        }
        documentFiles.forEach((file) => {
          formData.append("documents", file);
        });

        const response = await fetch(
          `${apiClient.defaults.baseURL}/chat/projects/${projectId}/orchestrate`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: formData,
          }
        );

        if (!response.ok) {
          throw new Error("Failed to send message with files");
        }

        return (await response.json()) as OrchestrationResponse;
      }

      // Regular JSON request if no files
      const response = await apiClient.post<OrchestrationResponse>(
        `/chat/projects/${projectId}/orchestrate`,
        {
          message,
          conversationHistory,
          repositoryUrl,
          documentContents,
        }
      );
      return response.data;
    },
    onSuccess: (data) => {
      // Update conversation history
      const userMessage: ConversationMessage = {
        role: "user",
        content:
          conversationHistory[conversationHistory.length - 1]?.content || "",
        timestamp: new Date(),
      };
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: data.chatResponse,
        timestamp: new Date(),
      };

      setConversationHistory((prev) => [
        ...prev,
        userMessage,
        assistantMessage,
      ]);
      setCurrentIntent(data.intent);

      // Notify about intent detection
      if (onIntentDetected && data.confidence) {
        onIntentDetected(data.intent, data.confidence);
      }

      // Notify about artifacts
      if (data.artifacts && onArtifactGenerated) {
        onArtifactGenerated(data.artifacts);
      }

      // Show milestone generation notification
      if (data.artifacts?.milestoneWorkflowTriggered) {
        toast.success("Milestone generation started", {
          description: "Watch the progress in the artifacts panel",
        });
      }
    },
    onError: (error: Error & { response?: { data?: { error?: string } } }) => {
      toast.error("Failed to send message", {
        description: error.response?.data?.error || "Please try again",
      });
    },
  });

  // Wrapper to verify session key before sending
  const sendMessage = useCallback(
    async (params: {
      message: string;
      repositoryUrl?: string;
      documentContents?: string[];
      documentFiles?: File[];
    }) => {
      // Verify session key first
      const hasValidKey = await checkSessionKey();
      if (!hasValidKey) return;

      // Proceed with sending message
      sendMessageMutation.mutate(params);
    },
    [sendMessageMutation, checkSessionKey]
  );

  // Streaming chat
  const streamMessage = useCallback(
    async (message: string, documentFiles?: File[]) => {
      // Verify session key first
      const hasValidKey = await checkSessionKey();
      if (!hasValidKey) return;

      try {
        setIsStreaming(true);
        setStreamingContent("");

        // Show document processing if files are present
        if (documentFiles && documentFiles.length > 0) {
          setIsProcessingDocuments(true);
          setProcessingStatus(
            `Reading ${documentFiles.length} document${
              documentFiles.length > 1 ? "s" : ""
            }...`
          );
        }

        // Add user message to history immediately
        const userMessage: ConversationMessage = {
          role: "user",
          content: message,
          timestamp: new Date(),
        };
        setConversationHistory((prev) => [...prev, userMessage]);

        // Create abort controller for cancellation
        abortControllerRef.current = new AbortController();

        // Prepare request body
        let body: FormData | string;
        const headers: Record<string, string> = {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        };

        if (documentFiles && documentFiles.length > 0) {
          // Use FormData for file uploads
          const formData = new FormData();
          formData.append("message", message);
          formData.append(
            "conversationHistory",
            JSON.stringify(conversationHistory)
          );

          // Add files with progress feedback
          documentFiles.forEach((file) => {
            formData.append("documents", file);
            setProcessingStatus(`Uploading ${file.name}...`);
          });

          body = formData;
          setProcessingStatus(`Analyzing documents...`);
          // Don't set Content-Type for FormData - browser sets it with boundary
        } else {
          // Use JSON for regular messages
          headers["Content-Type"] = "application/json";
          body = JSON.stringify({
            message,
            conversationHistory,
          });
        }

        const response = await fetch(
          `${apiClient.defaults.baseURL}/chat/projects/${projectId}/orchestrate/stream`,
          {
            method: "POST",
            headers,
            body,
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error("Failed to stream message");
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("Response body is not readable");
        }

        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));

              if (data.type === "chunk") {
                // Clear processing state when content starts streaming
                if (fullContent.length === 0 && isProcessingDocuments) {
                  setIsProcessingDocuments(false);
                  setProcessingStatus("");
                }
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === "done") {
                // Invalidate micropayment history to show the new payment
                if (data.micropaymentId) {
                  queryClient.invalidateQueries({
                    queryKey: ["micropaymentHistory"],
                  });
                }

                // Add complete assistant message to history
                const assistantMessage: ConversationMessage = {
                  role: "assistant",
                  content: fullContent,
                  timestamp: new Date(),
                };
                setConversationHistory((prev) => [...prev, assistantMessage]);
              } else if (data.type === "error") {
                throw new Error(data.error);
              }
            }
          }
        }
      } catch (error) {
        const err = error as Error & { name?: string };
        if (err.name === "AbortError") {
          toast.info("Message cancelled");
        } else {
          toast.error("Failed to stream message", {
            description: err.message || "Please try again",
          });
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setIsProcessingDocuments(false);
        setProcessingStatus("");
        abortControllerRef.current = null;
      }
    },
    [projectId, conversationHistory, checkSessionKey, isProcessingDocuments]
  );

  const cancelStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const clearHistory = useCallback(() => {
    setConversationHistory([]);
    setCurrentIntent(null);
    setStreamingContent("");
  }, []);

  return {
    // State
    conversationHistory,
    currentIntent,
    isSending: sendMessageMutation.isPending,
    isStreaming,
    streamingContent,
    isProcessingDocuments,
    processingStatus,
    hasActiveSessionKey: hasActiveKey,
    sessionKeyStatus: activeSessionKey,
    smartAccountAddress: smartAccount?.smartAccountAddress,

    // Actions
    sendMessage,
    streamMessage,
    cancelStreaming,
    clearHistory,
  };
}
