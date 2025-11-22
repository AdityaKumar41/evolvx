import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";
import { toast } from "sonner";

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface UseAIChatOptions {
  projectId?: string;
  onSuccess?: (response: string) => void;
}

export function useAIChat({ projectId, onSuccess }: UseAIChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
        content: data.content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
      onSuccess?.(data.content);
    },
    onError: (error) => {
      toast.error("Failed to send message");
      setIsLoading(false);
      console.error(error);
    },
  });

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      sendMessageMutation.mutate(content);
    },
    [sendMessageMutation]
  );

  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    isLoading,
    clearHistory,
  };
}
