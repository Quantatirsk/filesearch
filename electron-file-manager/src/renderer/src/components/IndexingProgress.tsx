import { useEffect, useState } from 'react'
import { Progress } from './ui/progress'
import { Card, CardContent, CardHeader } from './ui/card'
import { Clock, FileText, Zap, ChevronDown } from 'lucide-react'

interface IndexingProgressProps {
  isVisible: boolean
  onComplete?: () => void
  onClose?: () => void
}

interface IndexingStats {
  processed: number
  total: number
  current_file: string
  speed: number
  elapsed_time: number
  eta: number
  status: 'idle' | 'starting' | 'indexing' | 'completed' | 'error'
}

export function IndexingProgress({ isVisible, onComplete, onClose }: IndexingProgressProps) {
  const [stats, setStats] = useState<IndexingStats | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)

  useEffect(() => {
    if (!isVisible) {
      setStats(null)
      setStartTime(null)
      return
    }

    setStartTime(Date.now())
    
    const pollProgress = async () => {
      try {
        const response = await fetch('http://localhost:8001/api/indexing/progress')
        if (response.ok) {
          const data = await response.json()
          setStats(data)
          
          if (data.status === 'completed') {
            setTimeout(() => {
              onComplete?.()
            }, 2000) // Show completion for 2 seconds before hiding
          }
        }
      } catch (error) {
        console.error('Failed to fetch indexing progress:', error)
      }
    }

    // Poll every 500ms for smooth progress updates
    const interval = setInterval(pollProgress, 500)
    pollProgress() // Initial call

    return () => clearInterval(interval)
  }, [isVisible, onComplete])

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = Math.round(seconds % 60)
      return `${minutes}m ${remainingSeconds}s`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }

  const formatSpeed = (speed: number): string => {
    if (speed < 1) {
      return `${(speed * 1000).toFixed(0)} files/s`
    } else if (speed < 60) {
      return `${speed.toFixed(1)} files/s`
    } else {
      return `${(speed / 60).toFixed(1)} files/min`
    }
  }

  if (!isVisible) {
    return null
  }

  // If no stats yet, show loading state
  if (!stats) {
    return (
      <Card className="w-full shadow-2xl border-2 bg-background/95 backdrop-blur-sm rounded-none border-b-0">
        <CardHeader className="pb-1 pt-2">
          <div className="flex items-center gap-2 text-base font-medium">
            <FileText className="h-4 w-4" />
            <span>Connecting to indexing service...</span>
          </div>
        </CardHeader>
        <CardContent className="pt-1">
          <div className="text-sm text-muted-foreground">
            Preparing to index documents...
          </div>
        </CardContent>
      </Card>
    )
  }

  // Don't show if status is idle (no indexing happening)
  if (stats.status === 'idle') {
    return null
  }

  const progressPercentage = stats.total > 0 ? (stats.processed / stats.total) * 100 : 0
  const elapsedTime = startTime ? (Date.now() - startTime) / 1000 : stats.elapsed_time

  return (
    <Card className="w-full shadow-2xl border-2 bg-background/95 backdrop-blur-sm rounded-none border-b-0">
      <CardHeader className="pb-1 pt-2">
        <div className="flex items-center justify-between text-base font-medium">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>Indexing Documents</span>
            {stats.status === 'completed' && (
              <span className="text-green-600 text-sm font-normal">✓ Completed</span>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="收起到状态栏"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-1">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{stats.processed} of {stats.total} files</span>
            <span>{progressPercentage.toFixed(1)}%</span>
          </div>
          <Progress 
            value={progressPercentage} 
            className="h-2"
          />
        </div>

        {/* Current File */}
        {stats.current_file && stats.status === 'indexing' && (
          <div className="text-sm text-muted-foreground truncate">
            Processing: {stats.current_file}
          </div>
        )}

        {/* Time and Speed Statistics */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <div>
              <div className="font-medium">Elapsed</div>
              <div className="text-muted-foreground">{formatTime(elapsedTime)}</div>
            </div>
          </div>
          
          {stats.eta > 0 && stats.status === 'indexing' && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <div>
                <div className="font-medium">ETA</div>
                <div className="text-muted-foreground">{formatTime(stats.eta)}</div>
              </div>
            </div>
          )}
          
          {stats.speed > 0 && (
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <div>
                <div className="font-medium">Speed</div>
                <div className="text-muted-foreground">{formatSpeed(stats.speed)}</div>
              </div>
            </div>
          )}
        </div>

        {/* Completion Message */}
        {stats.status === 'completed' && (
          <div className="text-center py-2">
            <div className="text-green-600 font-medium">
              ✓ Indexing completed successfully!
            </div>
            <div className="text-sm text-muted-foreground">
              {stats.total} files processed in {formatTime(elapsedTime)}
            </div>
          </div>
        )}

        {/* Error Message */}
        {stats.status === 'error' && (
          <div className="text-center py-2">
            <div className="text-red-600 font-medium">
              ✗ Indexing encountered an error
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}