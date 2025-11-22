"use client";

import { useState } from "react";
import { DocumentUpload } from "./document-upload";
import { DocumentList } from "./document-list";
import type { Document } from "@/lib/types";

interface DocumentManagerProps {
  projectId: string;
  milestoneId?: string;
}

export function DocumentManager({
  projectId,
  milestoneId,
}: DocumentManagerProps) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadComplete = (document: Document) => {
    // Trigger refresh of document list
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      <DocumentUpload
        projectId={projectId}
        milestoneId={milestoneId}
        onUploadComplete={handleUploadComplete}
      />
      <DocumentList
        projectId={projectId}
        milestoneId={milestoneId}
        refreshTrigger={refreshTrigger}
      />
    </div>
  );
}
