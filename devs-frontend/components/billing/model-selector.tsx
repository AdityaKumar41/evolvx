import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'

const AI_MODELS = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', costPer1M: 30 },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI', costPer1M: 10 },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic', costPer1M: 15 },
  { id: 'claude-3-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', costPer1M: 3 },
  { id: 'openrouter-free', name: 'OpenRouter (Free)', provider: 'OpenRouter', costPer1M: 0 },
]

interface ModelSelectorProps {
  value?: string
  onChange?: (modelId: string) => void
  disabled?: boolean
}

export function ModelSelector({ value = 'gpt-4', onChange, disabled }: ModelSelectorProps) {
  const [selectedModel, setSelectedModel] = useState(value)
  
  const currentModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0]

  const handleSelect = (modelId: string) => {
    setSelectedModel(modelId)
    onChange?.(modelId)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-between" disabled={disabled}>
          <div className="flex items-center gap-2">
            <span className="font-medium">{currentModel.name}</span>
            <Badge variant="secondary" className="text-xs">
              ${currentModel.costPer1M}/1M tokens
            </Badge>
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[300px]">
        {AI_MODELS.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleSelect(model.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{model.name}</span>
                {model.id === selectedModel && <Check className="h-4 w-4 text-primary" />}
              </div>
              <span className="text-xs text-muted-foreground">{model.provider}</span>
            </div>
            <Badge variant={model.costPer1M === 0 ? 'default' : 'secondary'} className="text-xs">
              {model.costPer1M === 0 ? 'FREE' : `$${model.costPer1M}/1M`}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
