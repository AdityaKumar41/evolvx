import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api-client";

export interface ContextItem {
  id: string;
  type: "file" | "milestone" | "pr";
  title: string;
  content: string;
}

export function useAIContext(projectId: string) {
  const [selectedContext, setSelectedContext] = useState<ContextItem[]>([]);

  const { data: suggestedContext, isLoading } = useQuery({
    queryKey: ["ai-context", projectId],
    queryFn: async () => {
      const response = await apiClient.get(`/api/ai/context/${projectId}`);
      return response.data as ContextItem[];
    },
    enabled: !!projectId,
  });

  const addContext = (item: ContextItem) => {
    if (!selectedContext.find((c) => c.id === item.id)) {
      setSelectedContext([...selectedContext, item]);
    }
  };

  const removeContext = (id: string) => {
    setSelectedContext(selectedContext.filter((c) => c.id !== id));
  };

  const clearContext = () => {
    setSelectedContext([]);
  };

  return {
    selectedContext,
    suggestedContext,
    isLoading,
    addContext,
    removeContext,
    clearContext,
  };
}
