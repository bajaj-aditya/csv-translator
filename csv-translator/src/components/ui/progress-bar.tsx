"use client"

import * as React from "react"
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Play, 
  Pause,
  RotateCcw
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { TranslationJob } from "@/types"

interface ProgressBarProps {
  job: TranslationJob
  showDetails?: boolean
  onRetry?: () => void
  onPause?: () => void
  onResume?: () => void
  className?: string
}

interface TranslationStatsProps {
  job: TranslationJob
  className?: string
}

function TranslationStats({ job, className }: TranslationStatsProps) {
  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date()
    const duration = endTime.getTime() - start.getTime()
    const seconds = Math.floor(duration / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const getEstimatedTimeRemaining = () => {
    if (job.status !== 'processing' || job.processedRows === 0) return null
    
    const elapsed = new Date().getTime() - job.createdAt.getTime()
    const rate = job.processedRows / elapsed // rows per ms
    const remainingRows = job.totalRows - job.processedRows
    const estimatedMs = remainingRows / rate
    
    const estimatedSeconds = Math.floor(estimatedMs / 1000)
    const estimatedMinutes = Math.floor(estimatedSeconds / 60)
    
    if (estimatedMinutes > 0) {
      return `${estimatedMinutes}m ${estimatedSeconds % 60}s remaining`
    } else {
      return `${estimatedSeconds}s remaining`
    }
  }

  const rowsPerSecond = React.useMemo(() => {
    if (job.status !== 'processing' || job.processedRows === 0) return 0
    const elapsed = (new Date().getTime() - job.createdAt.getTime()) / 1000
    return Math.round(job.processedRows / elapsed * 10) / 10
  }, [job.status, job.processedRows, job.createdAt])

  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-4 text-sm", className)}>
      <div className="text-center">
        <p className="text-muted-foreground">Processed</p>
        <p className="font-medium">
          {job.processedRows.toLocaleString()} / {job.totalRows.toLocaleString()}
        </p>
      </div>
      
      <div className="text-center">
        <p className="text-muted-foreground">Duration</p>
        <p className="font-medium">
          {formatDuration(job.createdAt, job.completedAt)}
        </p>
      </div>

      {job.status === 'processing' && (
        <>
          <div className="text-center">
            <p className="text-muted-foreground">Rate</p>
            <p className="font-medium">{rowsPerSecond} rows/sec</p>
          </div>
          
          <div className="text-center">
            <p className="text-muted-foreground">ETA</p>
            <p className="font-medium">{getEstimatedTimeRemaining() || 'Calculating...'}</p>
          </div>
        </>
      )}

      {job.status === 'completed' && (
        <div className="text-center md:col-span-2">
          <p className="text-muted-foreground">Completed At</p>
          <p className="font-medium">
            {job.completedAt?.toLocaleString() || 'Unknown'}
          </p>
        </div>
      )}
    </div>
  )
}

export function ProgressBar({
  job,
  showDetails = true,
  onRetry,
  onPause,
  onResume,
  className
}: ProgressBarProps) {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'processing':
        return <Clock className="h-5 w-5 text-blue-500 animate-pulse" />
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />
    }
  }

  const getStatusBadge = () => {
    const variants = {
      pending: 'secondary',
      processing: 'default',
      completed: 'default',
      failed: 'destructive'
    } as const

    const colors = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    }

    return (
      <Badge 
        variant={variants[job.status]}
        className={cn("capitalize", colors[job.status])}
      >
        {job.status}
      </Badge>
    )
  }

  const getProgressVariant = () => {
    switch (job.status) {
      case 'completed':
        return 'default'
      case 'failed':
        return 'destructive'
      case 'processing':
        return 'default'
      default:
        return 'secondary'
    }
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-3">
            {getStatusIcon()}
            <div>
              <span className="text-base font-medium">{job.fileName}</span>
              {showDetails && (
                <p className="text-sm text-muted-foreground font-normal">
                  {job.sourceLanguage} → {job.targetLanguage}
                </p>
              )}
            </div>
          </CardTitle>
          <div className="flex items-center space-x-2">
            {getStatusBadge()}
            {job.status === 'processing' && onPause && (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-3 w-3" />
              </Button>
            )}
            {job.status === 'pending' && onResume && (
              <Button variant="outline" size="sm" onClick={onResume}>
                <Play className="h-3 w-3" />
              </Button>
            )}
            {job.status === 'failed' && onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{job.progress}%</span>
          </div>
          <Progress 
            value={job.progress} 
            className="h-2"
            // Note: Progress component variant would need to be extended to support this
          />
        </div>

        {/* Error Message */}
        {job.status === 'failed' && job.errorMessage && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start space-x-2">
              <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Translation Failed
                </p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                  {job.errorMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Stats */}
        {showDetails && (job.status === 'processing' || job.status === 'completed') && (
          <div className="pt-4 border-t">
            <TranslationStats job={job} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Multi-job progress component
interface MultiProgressBarProps {
  jobs: TranslationJob[]
  onJobRetry?: (jobId: string) => void
  onJobPause?: (jobId: string) => void
  onJobResume?: (jobId: string) => void
  className?: string
}

export function MultiProgressBar({
  jobs,
  onJobRetry,
  onJobPause,
  onJobResume,
  className
}: MultiProgressBarProps) {
  const totalJobs = jobs.length
  const completedJobs = jobs.filter(job => job.status === 'completed').length
  const failedJobs = jobs.filter(job => job.status === 'failed').length
  const processingJobs = jobs.filter(job => job.status === 'processing').length
  const overallProgress = totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0

  if (totalJobs === 0) {
    return null
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Overall Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Translation Progress</h3>
              <Badge variant="secondary">
                {completedJobs} / {totalJobs} completed
              </Badge>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-medium">{overallProgress}%</span>
              </div>
              <Progress value={overallProgress} className="h-2" />
            </div>

            <div className="grid grid-cols-4 gap-4 text-center text-sm">
              <div>
                <p className="text-muted-foreground">Total</p>
                <p className="font-medium">{totalJobs}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Processing</p>
                <p className="font-medium text-blue-600">{processingJobs}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Completed</p>
                <p className="font-medium text-green-600">{completedJobs}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Failed</p>
                <p className="font-medium text-red-600">{failedJobs}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Job Progress */}
      <div className="space-y-3">
        {jobs.map(job => (
          <ProgressBar
            key={job.id}
            job={job}
            showDetails={false}
            onRetry={onJobRetry ? () => onJobRetry(job.id) : undefined}
            onPause={onJobPause ? () => onJobPause(job.id) : undefined}
            onResume={onJobResume ? () => onJobResume(job.id) : undefined}
          />
        ))}
      </div>
    </div>
  )
}
