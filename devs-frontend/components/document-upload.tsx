"use client";

import { useState } from "react";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  X,
  Loader2,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Document } from "@/lib/types";
import { toast } from "sonner";

interface DocumentUploadProps {
  projectId: string;
  milestoneId?: string;
  onUploadComplete?: (document: Document) => void;
}

export function DocumentUpload({
  projectId,
  milestoneId,
  onUploadComplete,
}: DocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const validateAndSetFile = (file: File) => {
    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "text/markdown",
      "text/plain",
    ];

    if (!allowedTypes.includes(file.type)) {
      toast.error(
        "Invalid file type. Please upload PDF, PNG, JPG, GIF, Markdown, or text files."
      );
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setSelectedFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append("file", selectedFile);
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
      toast.success("Document uploaded successfully");
      setSelectedFile(null);
      onUploadComplete?.(document);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) {
      return <ImageIcon className="h-8 w-8 text-blue-500" />;
    }
    if (type === "application/pdf") {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    return <File className="h-8 w-8 text-gray-500" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">Upload Document</h3>
          <p className="text-sm text-muted-foreground">
            Upload project documentation, requirements, or milestone details
          </p>
        </div>

        {!selectedFile ? (
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors
              ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-gray-300 hover:border-primary/50"
              }
            `}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              onChange={handleFileSelect}
              accept=".pdf,.png,.jpg,.jpeg,.gif,.md,.txt"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Drop your file here, or{" "}
                  <span className="text-primary">browse</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, PNG, JPG, GIF, Markdown, or text files (max 10MB)
                </p>
              </div>
            </label>
          </div>
        ) : (
          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getFileIcon(selectedFile.type)}
                <div>
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedFile(null)}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelectedFile(null)}
                disabled={uploading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
