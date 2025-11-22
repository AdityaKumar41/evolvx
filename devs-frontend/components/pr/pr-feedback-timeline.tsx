import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Clock, MessageSquare } from 'lucide-react'

interface FeedbackItem {
  id: string
  type: 'ai' | 'sponsor'
  content: string
  timestamp: Date
}

interface PRFeedbackTimelineProps {
  prId: string
  feedbacks?: FeedbackItem[]
}

export function PRFeedbackTimeline({ prId, feedbacks = [] }: PRFeedbackTimelineProps) {
  return (
    <div className="space-y-4">
      {feedbacks.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No feedback yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {feedbacks.map((feedback) => (
            <div key={feedback.id} className="border-l-2 border-primary/20 pl-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={feedback.type === 'ai' ? 'secondary' : 'default'}>
                  {feedback.type === 'ai' ? 'AI' : 'Sponsor'}
                </Badge>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {feedback.timestamp.toLocaleString()}
                </span>
              </div>
              <div className="text-sm">{feedback.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
