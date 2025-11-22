"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowUp, Sparkles, User, Paperclip, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: string[];
}

interface AIChatSidebarProps {
  initialMessages?: Message[];
  onSendMessage: (message: string, attachments?: File[]) => void;
  isGenerating?: boolean;
}

export function AIChatSidebar({
  initialMessages = [],
  onSendMessage,
  isGenerating,
}: AIChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() || attachments.length > 0) {
      const newMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: input,
        attachments: attachments.map((f) => f.name),
      };
      setMessages((prev) => [...prev, newMessage]);
      onSendMessage(input, attachments);
      setInput("");
      setAttachments([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files || [])]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] w-[320px] border-r bg-muted/10">
      <div className="p-4 border-b bg-background/50 backdrop-blur-sm">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <Sparkles className="w-4 h-4 text-primary" />
          Evolvx Assistant
        </h3>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4" ref={scrollRef}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3 text-sm",
                msg.role === "assistant"
                  ? "bg-muted/50 p-3 rounded-lg"
                  : "flex-row-reverse"
              )}
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                  msg.role === "assistant" ? "bg-primary/10" : "bg-primary"
                )}
              >
                {msg.role === "assistant" ? (
                  <Sparkles className="w-3 h-3 text-primary" />
                ) : (
                  <User className="w-3 h-3 text-primary-foreground" />
                )}
              </div>
              <div
                className={cn(
                  "flex-1 space-y-1",
                  msg.role === "user" && "text-right"
                )}
              >
                {msg.attachments && msg.attachments.length > 0 && (
                  <div
                    className={cn(
                      "flex flex-wrap gap-2 mb-2",
                      msg.role === "user" && "justify-end"
                    )}
                  >
                    {msg.attachments.map((name, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1 bg-background/50 text-xs px-2 py-1 rounded border"
                      >
                        <FileText className="w-3 h-3" />
                        <span className="max-w-[100px] truncate">{name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}
          {isGenerating && (
            <div className="flex gap-3 text-sm bg-muted/50 p-3 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3 h-3 text-primary animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="flex gap-1 h-5 items-center">
                  <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-primary/40 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background/50 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative bg-background border rounded-lg focus-within:ring-1 focus-within:ring-ring">
            <AnimatePresence>
              {attachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-wrap gap-2 px-2 pt-2 border-b border-border/50"
                >
                  {attachments.map((file, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 bg-muted/50 text-xs p-1.5 rounded-md mb-2"
                    >
                      <FileText className="w-3 h-3 text-muted-foreground" />
                      <span className="max-w-[80px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(i)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="min-h-[80px] w-full resize-none bg-transparent border-none focus-visible:ring-0 pr-10"
            />
            <div className="absolute bottom-2 left-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                accept=".pdf,.md,.txt,.json"
                onChange={handleFileSelect}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="w-4 h-4" />
              </Button>
            </div>
            <Button
              type="submit"
              size="icon"
              disabled={
                (!input.trim() && attachments.length === 0) || isGenerating
              }
              className="absolute bottom-2 right-2 h-7 w-7"
            >
              <ArrowUp className="w-3 h-3" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
