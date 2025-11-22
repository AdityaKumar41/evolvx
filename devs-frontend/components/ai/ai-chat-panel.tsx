"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, ArrowUp, Paperclip, X, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface AIChatPanelProps {
  onSendMessage: (message: string, attachments?: File[]) => void;
  isGenerating?: boolean;
}

export function AIChatPanel({ onSendMessage, isGenerating }: AIChatPanelProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() || attachments.length > 0) {
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full max-w-2xl mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full space-y-8 text-center"
      >
        <div className="space-y-2">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            What are you building?
          </h2>
          <p className="text-muted-foreground text-lg max-w-md mx-auto">
            Describe your project or tasks and I&apos;ll generate a milestone
            structure for you.
          </p>
        </div>

        <div className="relative w-full group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
          <div className="relative bg-background/80 backdrop-blur-xl border rounded-xl p-2 shadow-2xl">
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex flex-col gap-2">
                <AnimatePresence>
                  {attachments.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-wrap gap-2 px-2 pt-2"
                    >
                      {attachments.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 bg-muted/50 text-xs p-2 rounded-md border border-border/50"
                        >
                          <FileText className="w-3 h-3 text-muted-foreground" />
                          <span className="max-w-[100px] truncate">
                            {file.name}
                          </span>
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
                  placeholder="E.g. I'm building a DeFi dashboard with wallet connection and token swapping..."
                  className="min-h-[120px] w-full resize-none bg-transparent border-none focus-visible:ring-0 text-lg p-4 placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-2">
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
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
                  className="h-8 w-8 rounded-lg transition-all duration-200"
                >
                  <ArrowUp className="w-4 h-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 text-sm text-muted-foreground">
          <span className="px-3 py-1 bg-muted/50 rounded-full border border-border/50">
            Smart Contracts
          </span>
          <span className="px-3 py-1 bg-muted/50 rounded-full border border-border/50">
            Frontend UI
          </span>
          <span className="px-3 py-1 bg-muted/50 rounded-full border border-border/50">
            Integration Tests
          </span>
        </div>
      </motion.div>
    </div>
  );
}
