import { useState } from 'react'
import { Bot, MessageSquare, FileText, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatUI } from './chat-ui'
import { Badge } from '@/components/ui/badge'

interface AISidebarProps {
  projectId?: string
}

export function AISidebar({ projectId }: AISidebarProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-8 right-8 h-14 w-14 rounded-full shadow-lg border-primary/20 bg-background hover:bg-accent z-50"
        >
          <Bot className="h-6 w-6 text-primary" />
          <span className="sr-only">Open AI Assistant</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0 gap-0">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>AI Assistant</SheetTitle>
              <Badge variant="secondary" className="text-xs">Beta</Badge>
            </div>
            {/* Close button is handled by SheetContent default */}
          </div>
        </SheetHeader>
        
        <Tabs defaultValue="chat" className="flex-1 flex flex-col h-full">
          <div className="px-4 pt-2">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="chat" className="flex-1">
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="context" className="flex-1">
                <FileText className="w-4 h-4 mr-2" />
                Context
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex-1">
                <Sparkles className="w-4 h-4 mr-2" />
                Actions
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 flex flex-col mt-0 h-full overflow-hidden">
            <ChatUI projectId={projectId} />
          </TabsContent>

          <TabsContent value="context" className="flex-1 p-4">
            <div className="text-center text-muted-foreground py-8">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Context management coming soon</p>
            </div>
          </TabsContent>

          <TabsContent value="actions" className="flex-1 p-4">
            <div className="text-center text-muted-foreground py-8">
              <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Quick actions coming soon</p>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
