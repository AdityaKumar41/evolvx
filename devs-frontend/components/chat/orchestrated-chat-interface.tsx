"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  useOrchestratedChat,
  IntentType,
  OrchestrationArtifact,
} from "@/hooks/use-orchestrated-chat";
import {
  Send,
  Loader2,
  Sparkles,
  Code2,
  FileText,
  Map,
  Wrench,
  MessageSquare,
  StopCircle,
  Paperclip,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface OrchestratedChatInterfaceProps {
  projectId: string;
  projectName: string;
}

const intentIcons: Record<IntentType, React.ReactNode> = {
  information_query: <MessageSquare className="h-4 w-4" />,
  code_analysis: <Code2 className="h-4 w-4" />,
  milestone_generation: <Map className="h-4 w-4" />,
  code_modification: <Wrench className="h-4 w-4" />,
  architecture_review: <FileText className="h-4 w-4" />,
  general_chat: <MessageSquare className="h-4 w-4" />,
};

const intentLabels: Record<IntentType, string> = {
  information_query: "Information Query",
  code_analysis: "Code Analysis",
  milestone_generation: "Milestone Generation",
  code_modification: "Code Modification",
  architecture_review: "Architecture Review",
  general_chat: "General Chat",
};

export function OrchestratedChatInterface({
  projectId,
  projectName,
}: OrchestratedChatInterfaceProps) {
  const [message, setMessage] = useState("");
  const [currentArtifact, setCurrentArtifact] =
    useState<OrchestrationArtifact | null>(null);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processingFiles, setProcessingFiles] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    conversationHistory,
    currentIntent,
    isSending,
    isStreaming,
    streamingContent,
    isProcessingDocuments,
    processingStatus,
    streamMessage,
    cancelStreaming,
    clearHistory,
  } = useOrchestratedChat({
    projectId,
    onArtifactGenerated: (artifact) => {
      setCurrentArtifact(artifact);
      setShowArtifacts(true);
    },
    onIntentDetected: (intent, confidence) => {
      console.log(
        `Intent detected: ${intent} (${(confidence * 100).toFixed(
          1
        )}% confidence)`
      );
    },
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationHistory, streamingContent]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSendMessage = async () => {
    if (!message.trim() || isSending || isStreaming) return;

    const messageToSend = message.trim();
    const filesToSend =
      selectedFiles.length > 0 ? [...selectedFiles] : undefined;

    // Show toast when uploading files
    if (filesToSend && filesToSend.length > 0) {
      toast.info(
        `Uploading ${filesToSend.length} document${
          filesToSend.length > 1 ? "s" : ""
        }...`,
        {
          duration: 2000,
        }
      );
      setProcessingFiles(filesToSend);
    }

    setMessage("");
    setSelectedFiles([]);

    // Use streaming for better UX
    await streamMessage(messageToSend, filesToSend);

    // Clear processing files when done
    setProcessingFiles([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const isValid =
        file.type === "application/pdf" ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.type === "text/markdown" ||
        file.type === "text/plain" ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".txt");

      if (!isValid) {
        toast.error(`Invalid file type: ${file.name}`, {
          description: "Only PDF, DOCX, MD, and TXT files are supported",
        });
      } else if (file.size > 10 * 1024 * 1024) {
        toast.error(`File too large: ${file.name}`, {
          description: "Maximum file size is 10MB",
        });
        return false;
      }
      return isValid;
    });

    if (validFiles.length > 0) {
      setSelectedFiles((prev) => {
        const newFiles = [...prev, ...validFiles].slice(0, 5);
        if (newFiles.length < prev.length + validFiles.length) {
          toast.warning("Maximum 5 files allowed");
        }
        return newFiles;
      });

      // Show success toast
      toast.success(
        `${validFiles.length} file${validFiles.length > 1 ? "s" : ""} selected`,
        {
          description: validFiles.map((f) => f.name).join(", "),
          duration: 2000,
        }
      );
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""; // Reset input
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Chat Panel - Left Side */}
      <Card className={cn("flex flex-col", showArtifacts ? "w-1/2" : "w-full")}>
        <CardHeader className="shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>AI Assistant</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {currentIntent && (
                <Badge
                  variant="secondary"
                  className="flex items-center gap-1.5"
                >
                  {intentIcons[currentIntent]}
                  {intentLabels[currentIntent]}
                </Badge>
              )}
              {conversationHistory.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory}>
                  Clear
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Ask about {projectName}, request milestones, or analyze code
          </p>
        </CardHeader>

        <Separator />

        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {conversationHistory.length === 0 && !isStreaming && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  Start a conversation
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Try asking:
                  <br />• &ldquo;What&rsquo;s in this codebase?&rdquo;
                  <br />• &ldquo;Create milestones for [your PRD]&rdquo;
                  <br />• &ldquo;Review the authentication system&rdquo;
                </p>
              </div>
            )}

            {conversationHistory.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "rounded-lg px-4 py-2.5 max-w-[85%]",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))}

            {/* Document Processing Indicator - Perplexity Style */}
            {isProcessingDocuments && (
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-3 bg-linear-to-br from-muted to-muted/50 border border-primary/20 max-w-[85%] shadow-sm">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <FileText className="h-5 w-5 text-primary" />
                        <div className="absolute inset-0 animate-ping">
                          <FileText className="h-5 w-5 text-primary opacity-75" />
                        </div>
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="text-sm font-medium text-foreground">
                          Processing documents...
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{processingStatus}</span>
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </div>
                      </div>
                    </div>

                    {/* Show file list */}
                    {processingFiles.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-border/50">
                        {processingFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 text-xs text-muted-foreground"
                          >
                            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                            <span className="truncate">{file.name}</span>
                            <span className="text-[10px] opacity-60">
                              ({(file.size / 1024).toFixed(1)}KB)
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Streaming message */}
            {isStreaming && streamingContent && (
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-2.5 max-w-[85%] bg-muted">
                  <div className="text-sm whitespace-pre-wrap prose prose-sm dark:prose-invert max-w-none">
                    {streamingContent}
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {(isSending || (isStreaming && !streamingContent)) && (
              <div className="flex justify-start">
                <div className="rounded-lg px-4 py-2.5 bg-muted flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">
                    AI is thinking...
                  </span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Input Area */}
        <CardContent className="shrink-0 p-4">
          {/* Selected Files Display */}
          {selectedFiles.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm"
                >
                  <FileText className="h-4 w-4" />
                  <span className="max-w-[200px] truncate">{file.name}</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="hover:text-destructive"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Textarea
                ref={textareaRef}
                placeholder="Ask anything about your project..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[60px] max-h-[200px] resize-none"
                disabled={isSending || isStreaming}
              />
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.md,.txt,text/markdown,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending || isStreaming || selectedFiles.length >= 5}
                title="Upload documents (PDF, DOCX, MD, TXT)"
                className="h-[60px] w-[60px]"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              {isStreaming ? (
                <Button
                  size="icon"
                  variant="destructive"
                  onClick={cancelStreaming}
                  className="h-[60px] w-[60px]"
                >
                  <StopCircle className="h-5 w-5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={!message.trim() || isSending}
                  className="h-[60px] w-[60px]"
                >
                  {isSending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Press Enter to send, Shift+Enter for new line • Attach PDFs, DOCX,
            MD, or TXT files
          </p>
        </CardContent>
      </Card>

      {/* Artifacts Panel - Right Side */}
      {showArtifacts && currentArtifact && (
        <Card className="w-1/2 flex flex-col">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {currentArtifact.type === "milestone_roadmap" && (
                  <Map className="h-5 w-5" />
                )}
                {currentArtifact.type === "code_analysis" && (
                  <Code2 className="h-5 w-5" />
                )}
                {currentArtifact.type === "architecture_diagram" && (
                  <FileText className="h-5 w-5" />
                )}
                {currentArtifact.type === "code_changes" && (
                  <Wrench className="h-5 w-5" />
                )}
                Artifacts
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowArtifacts(false)}
              >
                Hide
              </Button>
            </div>
          </CardHeader>

          <Separator />

          <ScrollArea className="flex-1 p-6">
            {currentArtifact.type === "milestone_roadmap" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="default">
                    {currentArtifact.milestoneWorkflowTriggered
                      ? "Generating..."
                      : "Ready"}
                  </Badge>
                </div>
                {currentArtifact.milestoneWorkflowTriggered ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">
                        Milestone generation workflow is running...
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      The system is analyzing your requirements and generating a
                      detailed roadmap. You&rsquo;ll see progress updates in
                      real-time.
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Milestone data will appear here once generated.
                  </div>
                )}
              </div>
            )}

            {currentArtifact.type === "code_analysis" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Code analysis results will be displayed here.
                </p>
              </div>
            )}

            {!currentArtifact.data &&
              !currentArtifact.milestoneWorkflowTriggered && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-sm text-muted-foreground">
                    Generated artifacts will appear here
                  </p>
                </div>
              )}
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
