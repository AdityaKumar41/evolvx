import { useRef, useEffect, useState } from 'react'
import { Send, Bot, User, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { useAIChat } from '@/hooks/use-ai-chat'
import { cn } from '@/lib/utils'

interface ChatUIProps {
  projectId?: string
}

export function ChatUI({ projectId }: ChatUIProps) {
  const { messages, sendMessage, isLoading } = useAIChat({ projectId })
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Ask me anything about this project!</p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3 max-w-[80%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <Avatar className="w-8 h-8">
                {msg.role === 'assistant' ? (
                  <>
                    <AvatarImage src="/bot-avatar.png" />
                    <AvatarFallback><Bot className="w-4 h-4" /></AvatarFallback>
                  </>
                ) : (
                  <>
                    <AvatarImage src="/user-avatar.png" />
                    <AvatarFallback><User className="w-4 h-4" /></AvatarFallback>
                  </>
                )}
              </Avatar>
              <Card className={cn(
                "p-3 text-sm",
                msg.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                {msg.content}
              </Card>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 mr-auto max-w-[80%]">
              <Avatar className="w-8 h-8">
                <AvatarFallback><Bot className="w-4 h-4" /></AvatarFallback>
              </Avatar>
              <Card className="p-3 bg-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
              </Card>
            </div>
          )}
        </div>
      </ScrollArea>
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
