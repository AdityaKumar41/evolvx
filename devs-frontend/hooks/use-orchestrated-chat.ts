import { useState, useCallback, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";

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
  onArtifactGenerated?: (artifact: OrchestrationArtifact) => void;
  onIntentDetected?: (intent: IntentType, confidence: number) => void;
}

export function useOrchestratedChat({
  projectId,
  onArtifactGenerated,
  onIntentDetected,
}: UseOrchestratedChatOptions) {
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const [currentIntent, setCurrentIntent] = useState<IntentType | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isProcessingDocuments, setIsProcessingDocuments] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Non-streaming chat mutation
  const { mutate: sendMessage, isPending: isSending } = useMutation({
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

  // Streaming chat
  const streamMessage = useCallback(
    async (message: string, documentFiles?: File[]) => {
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
        abortControllerRef.current = null;
      }
    },
    [projectId, conversationHistory]
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
    isSending,
    isStreaming,
    streamingContent,
    isProcessingDocuments,
    processingStatus,

    // Actions
    sendMessage,
    streamMessage,
    cancelStreaming,
    clearHistory,
  };
}
