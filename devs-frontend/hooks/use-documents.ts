import { useState, useEffect } from "react";
import apiClient from "@/lib/api-client";
import type { Document } from "@/lib/types";

interface UseDocumentsOptions {
  projectId: string;
  milestoneId?: string;
  autoFetch?: boolean;
}

export function useDocuments({
  projectId,
  milestoneId,
  autoFetch = true,
}: UseDocumentsOptions) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {};
      if (milestoneId) {
        params.milestoneId = milestoneId;
      }

      const response = await apiClient.get(
        `/api/documents/project/${projectId}`,
        {
          params,
        }
      );

      setDocuments(response.data);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch documents";
      setError(errorMessage);
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async (
    file: File,
    projectId: string,
    milestoneId?: string
  ) => {
    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);
      if (milestoneId) {
        formData.append("milestoneId", milestoneId);
      }

      const token = localStorage.getItem("jwt_token");
      const response = await fetch(
        `${
          process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"
        }/api/documents/upload`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const document = await response.json();
      setDocuments((prev) => [document, ...prev]);
      return document;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to upload document";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (documentId: string) => {
    try {
      setLoading(true);
      setError(null);

      await apiClient.delete(`/api/documents/${documentId}`);
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete document";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch && projectId) {
      fetchDocuments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, milestoneId, autoFetch]);

  return {
    documents,
    loading,
    error,
    fetchDocuments,
    uploadDocument,
    deleteDocument,
  };
}
