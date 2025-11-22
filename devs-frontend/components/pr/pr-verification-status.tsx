import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CheckCircle, Clock, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VerificationStep {
  id: string
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  message?: string
}

interface PRVerificationStatusProps {
  prId: string
}

export function PRVerificationStatus({ prId }: PRVerificationStatusProps) {
  const { data: status, isLoading } = useQuery({
    queryKey: ['pr-verification', prId],
    queryFn: async () => {
      // Mock API call with polling
      // const response = await axios.get(`/api/pr/${prId}/verification-status`)
      // return response.data
      
      return {
        steps: [
          { id: '1', name: 'AI Analyzing Code', status: 'completed', message: 'Score: 85/100' },
          { id: '2', name: 'CodeRabbit Review', status: 'in_progress', message: 'Running analysis...' },
          { id: '3', name: 'Screenshot Verification', status: 'pending' },
          { id: '4', name: 'Sponsor Approval', status: 'pending' },
        ] as VerificationStep[]
      }
    },
    refetchInterval: 5000, // Poll every 5 seconds
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading verification status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const steps = status?.steps || []
  const completedSteps = steps.filter(s => s.status === 'completed').length
  const progress = (completedSteps / steps.length) * 100

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Verification Status</CardTitle>
          <Badge variant={progress === 100 ? 'default' : 'secondary'}>
            {completedSteps}/{steps.length} Complete
          </Badge>
        </div>
        <Progress value={progress} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg transition-colors",
              step.status === 'completed' && "bg-green-50 dark:bg-green-950/20",
              step.status === 'in_progress' && "bg-blue-50 dark:bg-blue-950/20",
              step.status === 'failed' && "bg-red-50 dark:bg-red-950/20",
              step.status === 'pending' && "bg-muted/50"
            )}
          >
            <div className="mt-0.5">
              {step.status === 'completed' && (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
              {step.status === 'in_progress' && (
                <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />
              )}
              {step.status === 'failed' && (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              {step.status === 'pending' && (
                <Clock className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <div className="font-medium">{step.name}</div>
              {step.message && (
                <div className="text-sm text-muted-foreground mt-1">
                  {step.message}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
