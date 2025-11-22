"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface MilestoneBodyProps {
  isOpen: boolean;
  children: React.ReactNode;
  className?: string;
}

export function MilestoneBody({
  isOpen,
  children,
  className,
}: MilestoneBodyProps) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="overflow-hidden"
        >
          <div className={cn("border-t border-white/5 bg-black/20", className)}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
