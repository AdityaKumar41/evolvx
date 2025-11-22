import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, Clock, AlertCircle } from 'lucide-react'

interface ActiveTasksLimitProps {
  currentTasks: number
  maxTasks: number
  expiryWarnings?: Array<{ taskId: string; expiresIn: string }>
}

export function ActiveTasksLimit({ currentTasks, maxTasks, expiryWarnings = [] }: ActiveTasksLimitProps) {
  const canClaimMore = currentTasks < maxTasks

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active Tasks</CardTitle>
        <CardDescription>Your current task limit</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold">{currentTasks}/{maxTasks}</span>
          <Badge variant={canClaimMore ? 'default' : 'destructive'}>
            {canClaimMore ? 'Can Claim' : 'Limit Reached'}
          </Badge>
        </div>

        {expiryWarnings.length > 0 && (
          <div className="pt-3 border-t space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-600">
              <Clock className="h-4 w-4" />
              Expiry Warnings
            </div>
            {expiryWarnings.map((warning, i) => (
              <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-3 w-3" />
                Task expires in {warning.expiresIn}
              </div>
            ))}
          </div>
        )}

        {!canClaimMore && (
          <div className="pt-3 border-t">
            <div className="text-sm text-muted-foreground">
              Complete or abandon a task to claim new ones
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
