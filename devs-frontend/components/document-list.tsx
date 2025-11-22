"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  File,
  Trash2,
  Download,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import apiClient from "@/lib/api-client";
import type { Document } from "@/lib/types";
import { toast } from "sonner";

interface DocumentListProps {
  projectId: string;
  milestoneId?: string;
  refreshTrigger?: number;
}

export function DocumentList({
  projectId,
  milestoneId,
  refreshTrigger,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, milestoneId, refreshTrigger]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ projectId });
      if (milestoneId) {
        params.append("milestoneId", milestoneId);
      }

      const response = await apiClient.get(
        `/api/documents/project/${projectId}`,
        {
          params: milestoneId ? { milestoneId } : {},
        }
      );
      setDocuments(response.data);
    } catch (error) {
      console.error("Failed to load documents:", error);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      setDeletingId(documentId);
      await apiClient.delete(`/api/documents/${documentId}`);
      toast.success("Document deleted");
      setDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
    } catch (error) {
      console.error("Failed to delete document:", error);
      toast.error("Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("IMAGE") || type === "image") {
      return <ImageIcon className="h-5 w-5 text-blue-500" />;
    }
    if (type === "PDF") {
      return <FileText className="h-5 w-5 text-red-500" />;
    }
    return <File className="h-5 w-5 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <File className="mx-auto h-12 w-12 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            No documents uploaded yet
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Documents</h3>
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getFileIcon(doc.fileType)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.fileName}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatFileSize(doc.fileSizeBytes)}</span>
                    <span>•</span>
                    <span>{formatDate(doc.createdAt)}</span>
                    {doc.uploader && (
                      <>
                        <span>•</span>
                        <span>by {doc.uploader.githubUsername}</span>
                      </>
                    )}
                    {doc.milestone && (
                      <>
                        <span>•</span>
                        <span className="truncate">{doc.milestone.title}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open(doc.fileUrl, "_blank")}
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={deletingId === doc.id}
                      title="Delete"
                    >
                      {deletingId === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Document</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete &ldquo;{doc.fileName}
                        &rdquo;? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(doc.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
