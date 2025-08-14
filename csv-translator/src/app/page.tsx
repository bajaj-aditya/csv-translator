"use client"

// CSV Translator Page implementing full client-side workflow
import React, { useCallback, useEffect, useRef, useState } from "react"
import Papa from "papaparse"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import {
  CSV_CONFIG,
  API_ENDPOINTS,
} from "@/constants"
import {
  SourceLanguageSelect,
  TargetLanguageSelect,
} from "@/components/ui/language-select"
import { UploadBox } from "@/components/ui/upload-box"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import type { ColumnMapping, CSVTranslationConfig } from "@/types"
import { cn } from "@/lib/utils"

// -------------------------- Zod Schema -----------------------------
const translationFormSchema = z.object({
  sourceLanguage: z.string().min(1, "Select source language"),
  targetLanguage: z.string().min(1, "Select target language"),
  batchSize: z
    .preprocess((v) => Number(v), z.number().min(1).max(CSV_CONFIG.MAX_BATCH_SIZE))
    .default(String(CSV_CONFIG.DEFAULT_BATCH_SIZE)),
})

type TranslationFormValues = z.infer<typeof translationFormSchema>

// Type for Server-Sent-Events emitted by /api/translate
interface SSEMessage {
  type: "progress" | "error" | "complete" | "data"
  message?: string
  totalRows?: number
  processedRows?: number
  currentBatch?: number
  totalBatches?: number
  data?: string
  error?: string
}

// -------------------------------------------------------------------
export default function TranslatorPage() {
  // File & preview state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [columnSelections, setColumnSelections] = useState<Record<number, boolean>>({})

  // Translation progress state
  const [isTranslating, setIsTranslating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState<string | null>(null)
  const csvResultRef = useRef<string>("")
  const downloadUrlRef = useRef<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
    setValue,
  } = useForm<TranslationFormValues>({
    resolver: zodResolver(translationFormSchema),
    defaultValues: {
      batchSize: CSV_CONFIG.DEFAULT_BATCH_SIZE as unknown as any,
    },
  })

  // ---------------------------------------------------------------
  // Parse CSV client-side for a small preview
  const parseCsvPreview = useCallback((file: File) => {
    Papa.parse<string[]>(file, {
      preview: 20,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][]
        if (rows.length > 0) {
          setHeaders(rows[0])
          setCsvPreview(rows.slice(1))
          const initial: Record<number, boolean> = {}
          rows[0].forEach((_, idx) => (initial[idx] = true))
          setColumnSelections(initial)
        }
      },
      error: (err) => console.error("Papaparse error", err),
    })
  }, [])

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    parseCsvPreview(file)
    csvResultRef.current = ""
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = null
    }
  }

  // ---------------------------------------------------------------
  // Submit translation request
  const onSubmit = async (values: TranslationFormValues) => {
    if (!selectedFile) return

    // Build column mapping from header selections
    const columnMappings: ColumnMapping[] = headers.map((col, idx) => ({
      columnIndex: idx,
      columnName: col,
      shouldTranslate: !!columnSelections[idx],
      targetLanguage: values.targetLanguage,
    }))

    const config: CSVTranslationConfig = {
      sourceFile: selectedFile,
      columnMappings,
      sourceLanguage: values.sourceLanguage,
      targetLanguages: [values.targetLanguage],
      preserveFormatting: true,
      batchSize: Number(values.batchSize),
    }

    const formData = new FormData()
    formData.append("file", selectedFile)
    formData.append("config", JSON.stringify(config))

    // Reset progress
    setIsTranslating(true)
    setProgress(0)
    setProgressMessage("Starting translation …")
    csvResultRef.current = ""

try {
      // Create AbortController for timeout management
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => {
        abortController.abort()
      }, 60 * 60 * 1000) // 1 hour timeout for large files

      const res = await fetch(API_ENDPOINTS.TRANSLATE, { 
        method: "POST", 
        body: formData,
        signal: abortController.signal,
        // Add keep-alive headers
        headers: {
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Request failed with ${res.status}`)
      }
      if (!res.body) throw new Error("No response body")
      
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let lastActivityTime = Date.now()
      
      // Activity timeout checker
      const activityTimeout = 5 * 60 * 1000 // 5 minutes without activity
      
      while (true) {
        try {
          const { value, done } = await reader.read()
          
          if (done) {
            clearTimeout(timeoutId)
            break
          }
          
          // Reset activity timer
          lastActivityTime = Date.now()
          
          buffer += decoder.decode(value, { stream: true })
          const chunks = buffer.split("\n\n")
          buffer = chunks.pop() || ""
          
          for (const raw of chunks) {
            if (!raw.startsWith("data:")) continue
            const json = raw.replace(/^data:\s*/, "").trim()
            if (!json) continue
            
            let msg: SSEMessage
            try {
              msg = JSON.parse(json)
            } catch (e) {
              console.error("JSON parse error", e)
              continue
            }
            handleSseMessage(msg)
          }
          
          // Check for activity timeout
          if (Date.now() - lastActivityTime > activityTimeout) {
            throw new Error("Connection timed out due to inactivity")
          }
          
        } catch (readError) {
          if (readError instanceof Error && readError.name === 'AbortError') {
            throw new Error("Translation timed out. Please try with a smaller file or reduce batch size.")
          }
          throw readError
        }
      }
    } catch (err) {
      console.error(err)
      if (err instanceof Error) {
        if (err.name === 'AbortError' || err.message.includes('aborted')) {
          setProgressMessage("Translation timed out. Please try with a smaller file or contact support.")
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          setProgressMessage("Network error occurred. Please check your connection and try again.")
        } else {
          setProgressMessage(err.message)
        }
      } else {
        setProgressMessage("An unexpected error occurred during translation.")
      }
      setIsTranslating(false)
    }
  }

  const handleSseMessage = (msg: SSEMessage) => {
    switch (msg.type) {
      case "progress":
        if (msg.totalRows) {
          const pct = msg.processedRows && msg.totalRows ? Math.round((msg.processedRows / msg.totalRows) * 100) : 0
          setProgress(pct)
        }
        if (msg.message) setProgressMessage(msg.message)
        break
      case "data":
        if (msg.data) csvResultRef.current += msg.data
        break
      case "complete":
        if (msg.data) csvResultRef.current += msg.data
        setProgress(100)
        setProgressMessage(msg.message || "Completed")
        finalizeDownload()
        setIsTranslating(false)
        break
      case "error":
        setProgressMessage(msg.error || "Error")
        setIsTranslating(false)
        break
    }
  }

  const finalizeDownload = () => {
    if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    const blob = new Blob([csvResultRef.current], { type: "text/csv" })
    downloadUrlRef.current = URL.createObjectURL(blob)
  }

  const handleReset = () => {
    setSelectedFile(null)
    setCsvPreview([])
    setHeaders([])
    setColumnSelections({})
    reset()
    setProgress(0)
    setProgressMessage(null)
    csvResultRef.current = ""
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = null
    }
  }

  const toggleColumn = (idx: number) => setColumnSelections((prev) => ({ ...prev, [idx]: !prev[idx] }))

  // ----------------------------------------------------------------
  return (
    <div className="container mx-auto max-w-4xl py-10 space-y-8">
      <h1 className="text-3xl font-bold">CSV Translator</h1>

      <UploadBox
        selectedFile={selectedFile}
        onFileSelect={handleFileSelect}
        onFileRemove={() => setSelectedFile(null)}
        disabled={isTranslating}
      />

      {selectedFile && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Large file warning */}
          {selectedFile && selectedFile.size > 10 * 1024 * 1024 && (
            <div className="p-4 border border-orange-200 bg-orange-50 rounded-md">
              <h3 className="font-medium text-orange-800 mb-2">⚠️ Large File Detected</h3>
              <p className="text-sm text-orange-700 mb-2">
                Your file is {Math.round(selectedFile.size / 1024 / 1024)}MB. Large files may take 20-60 minutes to process.
              </p>
              <p className="text-sm text-orange-700">
                💡 <strong>Tip:</strong> For files with 10,000+ rows, consider using a smaller batch size (10-25) to prevent network timeouts.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SourceLanguageSelect
              value={watch("sourceLanguage")}
              onValueChange={(v) => setValue("sourceLanguage", v as any)}
              disabled={isTranslating}
              className={cn(errors.sourceLanguage && "border-destructive")}
            />
            <TargetLanguageSelect
              value={watch("targetLanguage")}
              onValueChange={(v) => setValue("targetLanguage", v as any)}
              disabled={isTranslating}
              className={cn(errors.targetLanguage && "border-destructive")}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch size</label>
              <input
                type="number"
                min={1}
                max={CSV_CONFIG.MAX_BATCH_SIZE}
                className="border rounded-md px-3 py-2 w-full"
                disabled={isTranslating}
                {...register("batchSize")}
              />
              <p className="text-xs text-muted-foreground">
                Smaller batches = better progress tracking, less network errors
              </p>
              {errors.batchSize && <p className="text-xs text-destructive">{errors.batchSize.message}</p>}
            </div>
          </div>

          {headers.length > 0 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <p className="font-medium">Select columns to translate</p>
                <div className="max-h-64 overflow-auto border rounded-md">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr>
                        {headers.map((h, idx) => (
                          <th key={idx} className="border px-2 py-1 text-left">
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                checked={columnSelections[idx]}
                                onCheckedChange={() => toggleColumn(idx)}
                                disabled={isTranslating}
                              />
                              <span>{h}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.slice(0, 5).map((row, rIdx) => (
                        <tr key={rIdx} className="odd:bg-muted/40">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="border px-2 py-1 truncate max-w-xs">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-4">
            <Button type="submit" disabled={isTranslating}>
              {isTranslating ? "Translating…" : "Translate"}
            </Button>
            <Button type="button" variant="ghost" onClick={handleReset} disabled={isTranslating}>
              Reset
            </Button>
            {downloadUrlRef.current && (
              <a
                href={downloadUrlRef.current}
                download={`translated-${selectedFile.name}`}
                className="underline text-primary"
              >
                Download CSV
              </a>
            )}
          </div>

          {isTranslating && (
            <div className="space-y-2">
              <Progress value={progress} />
              {progressMessage && <p className="text-sm text-muted-foreground">{progressMessage}</p>}
            </div>
          )}
        </form>
      )}
    </div>
  )
}
