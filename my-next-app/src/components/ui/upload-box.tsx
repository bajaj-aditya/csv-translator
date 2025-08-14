"use client"

import * as React from "react"
import { Upload, File, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CSV_CONFIG } from "@/constants"

interface UploadBoxProps {
  onFileSelect: (file: File) => void
  onFileRemove: () => void
  selectedFile?: File | null
  disabled?: boolean
  className?: string
}

export function UploadBox({
  onFileSelect,
  onFileRemove,
  selectedFile,
  disabled = false,
  className
}: UploadBoxProps) {
const [isDragging, setIsDragging] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (disabled) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFileSelection(files[0])
    }
  }

  const handleFileSelection = (file: File) => {
    if (disabled) return

    // Validate file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
if (!CSV_CONFIG.SUPPORTED_FORMATS.includes(fileExtension)) {
      setError(`Unsupported file type. Allowed: ${CSV_CONFIG.SUPPORTED_FORMATS.join(", ")}`)
      return
    }

    // Validate file size
    if (file.size > CSV_CONFIG.MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${formatFileSize(CSV_CONFIG.MAX_FILE_SIZE)}`)
      return
    }

    setError(null)
    onFileSelect(file)
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelection(file)
    }
  }

  const handleBrowseClick = () => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardContent className="p-6">
        {selectedFile ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div className="flex items-center space-x-3">
                <File className="h-8 w-8 text-primary" />
                <div>
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onFileRemove}
                disabled={disabled}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove file</span>
              </Button>
            </div>
            {error && (
              <div className="flex items-center space-x-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
              disabled && "opacity-50 cursor-not-allowed",
              error && "border-destructive bg-destructive/5"
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="space-y-4">
              <Upload
                className={cn(
                  "h-10 w-10 mx-auto",
                  isDragging ? "text-primary" : "text-muted-foreground",
                  error && "text-destructive"
                )}
              />
              <div className="space-y-2">
                <h3 className="text-lg font-medium">
                  {error ? "Upload Failed" : "Upload CSV File"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Drag and drop your CSV file here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Supported formats: {CSV_CONFIG.SUPPORTED_FORMATS.join(", ")} •{" "}
                  Max size: {formatFileSize(CSV_CONFIG.MAX_FILE_SIZE)}
                </p>
              </div>
              {error && (
                <div className="flex items-center justify-center space-x-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}
              <Button
                onClick={handleBrowseClick}
                disabled={disabled}
                variant={error ? "destructive" : "default"}
                className="mt-4"
              >
                Browse Files
              </Button>
            </div>
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          accept={CSV_CONFIG.SUPPORTED_FORMATS.join(",")}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />
      </CardContent>
    </Card>
  )
}
