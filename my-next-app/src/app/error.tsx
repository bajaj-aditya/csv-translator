"use client"

import { useEffect } from "react"
import { ErrorFallback } from "@/components/ui/error-fallback"

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  // Log error to monitoring service here
  useEffect(() => {
    console.error("Global error captured:", error)
  }, [error])

  return <ErrorFallback error={error} resetErrorBoundary={reset} />
}

