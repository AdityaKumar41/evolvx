import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DollarSign, TrendingUp } from 'lucide-react'
import { useBilling } from '@/hooks/use-billing'

interface CreditBalanceProps {
  userId?: string
}

export function CreditBalance({ userId }: CreditBalanceProps) {
  const { billingInfo, isLoading } = useBilling(userId)

  if (isLoading) {
    return <Card><CardContent className="p-6">Loading...</CardContent></Card>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Credit Balance</CardTitle>
          <DollarSign className="h-5 w-5 text-muted-foreground" />
        </div>
        <CardDescription>Your available AI credits</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold">
              ${billingInfo?.creditBalance.toFixed(2)}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant={billingInfo?.billingMode === 'CREDIT' ? 'default' : 'secondary'}>
                {billingInfo?.billingMode}
              </Badge>
              <span className="text-sm text-muted-foreground">{billingInfo?.currency}</span>
            </div>
          </div>
          <div className="flex items-center text-sm text-green-600">
            <TrendingUp className="h-4 w-4 mr-1" />
            Active
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
