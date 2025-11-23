import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";
import axios from "axios";
import { useSessionKeys } from "@/hooks/use-session-keys";
import { useAAWallet } from "@/hooks/use-aa-wallet";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface UseAIChatOptions {
  projectId?: string;
  onSuccess?: (response: string) => void;
  userId?: string;
}

export function useAIChat({
  projectId,
  onSuccess,
  userId,
}: UseAIChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  // AA + Session Key integration
  const { smartAccount } = useAAWallet({ userId, autoCreate: true });
  const { hasActiveKey, activeSessionKey, fetchActiveSessionKey } =
    useSessionKeys(userId, smartAccount?.smartAccountAddress);

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiClient.post("/api/chat", {
        projectId,
        message: content,
        conversationHistory: messages,
      });
      return response.data;
    },
    onMutate: (content) => {
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.content || data.chatResponse || data.response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);

      // Invalidate micropayment history to reflect new payment
      queryClient.invalidateQueries({ queryKey: ["micropaymentHistory"] });

      onSuccess?.(data.content || data.chatResponse || data.response);
    },
    onError: (error) => {
      setIsLoading(false);

      toast.error("Failed to send message. Please try again.");
      console.error(error);

      // Remove the user message on error
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      // Check for smart account
      if (!smartAccount?.smartAccountAddress) {
        toast.error("Smart account required", {
          description: "Please complete onboarding to use AI features.",
        });
        return;
      }

      // Check for active session key
      await fetchActiveSessionKey();
      if (!hasActiveKey) {
        toast.error("Session key required", {
          description:
            "Please register a session key in Account Abstraction settings.",
          action: {
            label: "Register Now",
            onClick: () =>
              (window.location.href = "/billing/account-abstraction"),
          },
        });
        return;
      }

      // Check session key expiry
      if (
        activeSessionKey &&
        new Date(activeSessionKey.expiresAt) < new Date()
      ) {
        toast.error("Session key expired", {
          description: "Please renew your session key to continue.",
          action: {
            label: "Renew Now",
            onClick: () =>
              (window.location.href = "/billing/account-abstraction"),
          },
        });
        return;
      }

      sendMessageMutation.mutate(content);
    },
    [
      sendMessageMutation,
      smartAccount,
      hasActiveKey,
      activeSessionKey,
      fetchActiveSessionKey,
    ]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    clearHistory,
    hasActiveSessionKey: hasActiveKey,
    sessionKeyStatus: activeSessionKey,
    smartAccountAddress: smartAccount?.smartAccountAddress,
  };
}
