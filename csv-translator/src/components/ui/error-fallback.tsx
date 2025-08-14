"use client"

import React from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface ErrorFallbackProps {
  error: Error
  resetErrorBoundary: () => void
}

/**
 * Generic fallback UI shown whenever a wrapped component throws at runtime.
 */
export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <Card className="max-w-lg mx-auto mt-10 border-destructive">
      <CardContent className="p-6 space-y-4 text-center">
        <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-sm text-muted-foreground break-all">
          {error.message || "An unexpected error occurred."}
        </p>
        <Button onClick={resetErrorBoundary} variant="destructive">
          Try again
        </Button>
      </CardContent>
    </Card>
  )
}

