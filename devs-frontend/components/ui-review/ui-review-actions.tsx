import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { CheckCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface UIReviewActionsProps {
  prId: string
  onApprove?: (feedback?: string) => void
  onReject?: (reason: string) => void
}

export function UIReviewActions({ prId, onApprove, onReject }: UIReviewActionsProps) {
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [reason, setReason] = useState('')

  const handleApprove = () => {
    onApprove?.(feedback)
    setApproveOpen(false)
    setFeedback('')
    toast.success('UI PR approved')
  }

  const handleReject = () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }
    onReject?.(reason)
    setRejectOpen(false)
    setReason('')
    toast.success('UI PR rejected')
  }

  return (
    <div className="flex gap-2">
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogTrigger asChild>
          <Button className="flex-1">
            <CheckCircle className="h-4 w-4 mr-2" />
            Approve UI
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve UI Changes</DialogTitle>
            <DialogDescription>
              Confirm that the UI implementation meets your requirements
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="feedback">Feedback (Optional)</Label>
              <Textarea
                id="feedback"
                placeholder="Leave positive feedback for the contributor..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="flex-1">
            <XCircle className="h-4 w-4 mr-2" />
            Reject UI
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject UI Changes</DialogTitle>
            <DialogDescription>
              Provide detailed feedback on what needs to be improved
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Rejection *</Label>
              <Textarea
                id="reason"
                placeholder="Explain what needs to be changed..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={6}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              <XCircle className="h-4 w-4 mr-2" />
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
