import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ScreenshotComparisonProps {
  contributorScreenshot?: string
  sponsorScreenshot?: string
  score?: number
}

export function ScreenshotComparison({
  contributorScreenshot,
  sponsorScreenshot,
  score
}: ScreenshotComparisonProps) {
  const [viewMode, setViewMode] = useState<'side-by-side' | 'overlay'>('side-by-side')

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>UI Screenshot Comparison</CardTitle>
            <CardDescription>Visual diff between screenshots</CardDescription>
          </div>
          {score !== undefined && (
            <Badge variant={score >= 85 ? 'default' : 'destructive'} className="text-lg px-3 py-1">
              {score}% Match
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('side-by-side')}
          >
            Side by Side
          </Button>
          <Button
            variant={viewMode === 'overlay' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('overlay')}
          >
            Overlay
          </Button>
        </div>

        {viewMode === 'side-by-side' ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Contributor</div>
              {contributorScreenshot ? (
                <div className="border rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
                  <img src={contributorScreenshot} alt="Contributor screenshot" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center text-muted-foreground">
                  No screenshot uploaded
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Sponsor Reference</div>
              {sponsorScreenshot ? (
                <div className="border rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
                  <img src={sponsorScreenshot} alt="Sponsor screenshot" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center text-muted-foreground">
                  No reference screenshot
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm font-medium">Overlay Comparison</div>
            <div className="border rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center text-muted-foreground">
              Overlay view coming soon
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
