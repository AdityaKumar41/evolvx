"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowUp,
  Sparkles,
  User,
  Bot,
  Loader2,
  RefreshCw,
  Trash2,
  Paperclip,
  X,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  attachments?: string[];
}

interface ProjectAIAssistantProps {
  projectId: string;
  projectName?: string;
  className?: string;
}

export function ProjectAIAssistant({
  projectId,
  projectName,
  className,
}: ProjectAIAssistantProps) {
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load conversation history on mount
  useEffect(() => {
    const loadConversationHistory = async () => {
      try {
        const token = localStorage.getItem("jwt_token");
        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

        const response = await fetch(
          `${apiUrl}/api/chat/projects/${projectId}/conversation`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setConversationId(data.conversationId);
          setConversationHistory(
            data.messages.map(
              (msg: {
                id: string;
                role: string;
                content: string;
                timestamp: string;
              }) => ({
                id: msg.id,
                role: msg.role as "user" | "assistant",
                content: msg.content,
                timestamp: new Date(msg.timestamp),
              })
            )
          );
        }
      } catch (error) {
        console.error("Failed to load conversation history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadConversationHistory();
  }, [projectId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversationHistory]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userMessage = input.trim();
    const userAttachments = [...attachments];
    setInput("");
    setAttachments([]);

    // Add user message to history
    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: userMessage || "[Attached files]",
      timestamp: new Date(),
      attachments: userAttachments.map((f) => f.name),
    };
    setConversationHistory((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    // Create a temporary assistant message that will be updated as we stream
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    try {
      const token = localStorage.getItem("jwt_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      const response = await fetch(
        `${apiUrl}/api/chat/projects/${projectId}/orchestrate/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: userMessage,
            conversationHistory: conversationHistory.map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error?.message ||
          errorData.error ||
          errorData.message ||
          `Server error: ${response.status}`;
        throw new Error(errorMessage);
      }

      // Add empty assistant message that will be updated
      setConversationHistory((prev) => [...prev, assistantMessage]);
      setIsLoading(false);

      // Read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body reader available");
      }

      let accumulatedContent = "";
      let detectedIntent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "intent") {
                detectedIntent = data.intent;
              } else if (data.type === "context_status") {
                // Show repository analysis status
                if (data.status === "analyzing") {
                  toast.info(data.message, { duration: 5000 });
                }
              } else if (data.type === "chunk") {
                accumulatedContent += data.content;
                // Update the assistant message in real-time
                setConversationHistory((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );
              } else if (data.type === "complete") {
                // For non-streaming responses (like milestone generation)
                accumulatedContent = data.response;
                setConversationHistory((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedContent }
                      : msg
                  )
                );

                if (data.artifacts) {
                  console.log("Artifacts:", data.artifacts);
                }
              } else if (data.type === "milestone_generation_started") {
                // Milestone generation workflow has been triggered - dispatch event silently
                // (Progress will be shown in the milestone tab UI)
                window.dispatchEvent(
                  new CustomEvent("milestone-generation-started", {
                    detail: { projectId: data.projectId },
                  })
                );
              } else if (data.type === "done") {
                // Handle special cases based on intent
                if (detectedIntent === "milestone_generation") {
                  toast.info(
                    "Milestones are being generated. This may take 30-60 seconds...",
                    {
                      duration: 5000,
                    }
                  );
                }
              } else if (data.type === "error") {
                throw new Error(data.error || "Stream error");
              }
            } catch {
              console.warn("Failed to parse SSE data:", line);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get AI response";
      toast.error(errorMessage, {
        description: "Please try again or check your connection.",
      });

      // Remove the failed messages
      setConversationHistory((prev) =>
        prev.filter(
          (msg) => msg.id !== assistantMessageId && msg.id !== newUserMessage.id
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      const validFiles = newFiles.filter((file) => {
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (ext !== "pdf" && ext !== "md") {
          toast.error(
            `${file.name} is not supported. Only PDF and MD files are allowed.`
          );
          return false;
        }
        if (file.size > 10 * 1024 * 1024) {
          // 10MB limit
          toast.error(`${file.name} is too large. Maximum file size is 10MB.`);
          return false;
        }
        return true;
      });
      setAttachments((prev) => [...prev, ...validFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const clearConversation = async () => {
    if (!conversationId) {
      setConversationHistory([]);
      toast.success("Conversation cleared");
      return;
    }

    try {
      const token = localStorage.getItem("jwt_token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      const response = await fetch(
        `${apiUrl}/api/chat/conversations/${conversationId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        setConversationHistory([]);
        setConversationId(null);
        toast.success("Conversation cleared");
      }
    } catch (error) {
      console.error("Failed to clear conversation:", error);
      // Still clear locally even if deletion fails
      setConversationHistory([]);
      toast.success("Conversation cleared locally");
    }
  };

  const retryLastMessage = () => {
    if (conversationHistory.length >= 2) {
      const lastUserMessage = [...conversationHistory]
        .reverse()
        .find((msg) => msg.role === "user");
      if (lastUserMessage) {
        // Remove last assistant response
        setConversationHistory((prev) => prev.slice(0, prev.length - 1));
        setInput(lastUserMessage.content);
      }
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-background border rounded-lg",
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b bg-muted/20 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Evolvx Assistant</h3>
            <p className="text-xs text-muted-foreground">
              {projectName || "Project Chat"}
            </p>
          </div>
        </div>
        {conversationHistory.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={clearConversation}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4" ref={scrollRef}>
          {isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center h-full py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm text-muted-foreground">
                Loading conversation...
              </p>
            </div>
          ) : conversationHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">
                  Ask me anything about your project
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  I can analyze your repository, answer questions, and help with
                  planning
                </p>
              </div>
              <div className="flex flex-col gap-2 text-xs text-muted-foreground pt-4">
                <p className="font-medium text-foreground">Try asking:</p>
                <button
                  onClick={() =>
                    setInput("What's the current structure of my repository?")
                  }
                  className="text-left hover:text-primary transition-colors"
                >
                  → What&apos;s in my repository?
                </button>
                <button
                  onClick={() =>
                    setInput("Show me the main components of the codebase")
                  }
                  className="text-left hover:text-primary transition-colors"
                >
                  → Show me the main components
                </button>
                <button
                  onClick={() => setInput("What progress have we made so far?")}
                  className="text-left hover:text-primary transition-colors"
                >
                  → What&apos;s our progress?
                </button>
              </div>
            </div>
          ) : null}

          <AnimatePresence mode="popLayout">
            {conversationHistory.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "flex gap-3",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-lg px-4 py-2.5 max-w-[85%] text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50"
                  )}
                >
                  <div className="whitespace-pre-wrap space-y-2">
                    {msg.content.split("\n").map((line, i) => {
                      // Check if line is a bullet point
                      if (
                        line.trim().startsWith("-") ||
                        line.trim().startsWith("•")
                      ) {
                        return (
                          <div key={i} className="flex gap-2 ml-2">
                            <span>•</span>
                            <span>{line.replace(/^[-•]\s*/, "")}</span>
                          </div>
                        );
                      }
                      // Check if line is bold (surrounded by **)
                      if (line.includes("**")) {
                        const parts = line.split(/\*\*(.*?)\*\*/g);
                        return (
                          <p
                            key={i}
                            className={cn("leading-relaxed", line ? "" : "h-2")}
                          >
                            {parts.map((part, j) =>
                              j % 2 === 1 ? (
                                <strong key={j}>{part}</strong>
                              ) : (
                                part
                              )
                            )}
                          </p>
                        );
                      }
                      return (
                        <p
                          key={i}
                          className={cn("leading-relaxed", line ? "" : "h-2")}
                        >
                          {line || "\u00A0"}
                        </p>
                      );
                    })}
                  </div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-current/10 flex flex-wrap gap-1">
                      {msg.attachments.map((filename, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1 text-xs opacity-70"
                        >
                          <FileText className="w-3 h-3" />
                          <span>{filename}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-3 items-start"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-muted/50 rounded-lg px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Analyzing your request...
                </span>
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSendMessage} className="space-y-2">
          {/* File Attachments */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-muted/50 text-xs px-2 py-1.5 rounded-md border"
                >
                  <FileText className="w-3 h-3 text-muted-foreground" />
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Field */}
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your project, codebase, or generate milestones..."
              className="min-h-[60px] max-h-[200px] resize-none pr-20 text-sm"
              disabled={isLoading}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept=".pdf,.md"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={
                  (!input.trim() && attachments.length === 0) || isLoading
                }
                className="h-8 w-8"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowUp className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </form>
        {conversationHistory.length > 0 && !isLoading && (
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              {conversationHistory.length} messages
            </p>
            {conversationHistory.length >= 2 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={retryLastMessage}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
