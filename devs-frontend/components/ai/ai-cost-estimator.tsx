import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles } from 'lucide-react'

interface AICostEstimatorProps {
  workflow: 'MILESTONE_GENERATION' | 'PR_REVIEW' | 'UI_ANALYSIS' | 'CHAT'
  model?: string
  estimatedTokens?: number
}

const MODEL_COSTS = {
  'gpt-4': { input: 30, output: 60 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'openrouter-free': { input: 0, output: 0 },
}

export function AICostEstimator({ 
  workflow, 
  model = 'gpt-4', 
  estimatedTokens = 5000 
}: AICostEstimatorProps) {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS] || MODEL_COSTS['gpt-4']
  
  // Rough estimate: 60% input, 40% output
  const inputTokens = Math.floor(estimatedTokens * 0.6)
  const outputTokens = Math.floor(estimatedTokens * 0.4)
  
  const inputCost = (inputTokens / 1000000) * costs.input
  const outputCost = (outputTokens / 1000000) * costs.output
  const totalCost = inputCost + outputCost

  const isFree = totalCost === 0

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Estimated AI Cost</CardTitle>
          </div>
          {isFree && <Badge variant="secondary">FREE</Badge>}
        </div>
        <CardDescription className="text-xs">{workflow.replace('_', ' ')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Model</span>
            <Badge variant="outline" className="text-xs">{model}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Est. Tokens</span>
            <span className="text-xs font-mono">{estimatedTokens.toLocaleString()}</span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="text-sm font-medium">Total Cost</span>
            <span className={`text-lg font-bold ${isFree ? 'text-green-600' : ''}`}>
              {isFree ? 'FREE' : `$${totalCost.toFixed(4)}`}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
