"use client"

import * as React from "react"
import {
  UploadBox,
  SourceLanguageSelect,
  TargetLanguageSelect,
  ColumnPicker,
  ProgressBar,
  PreviewTable,
  CompactPreviewTable,
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui"
import type { TranslationJob, ColumnMapping } from "@/types"

export default function ComponentShowcase() {
  // State for components
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [sourceLanguage, setSourceLanguage] = React.useState<string>("")
  const [targetLanguage, setTargetLanguage] = React.useState<string>("")
  const [targetLanguages, setTargetLanguages] = React.useState<string[]>([])
  const [columnMappings, setColumnMappings] = React.useState<ColumnMapping[]>([])
  const [now, setNow] = React.useState<Date | null>(null)

  // Initialize date on client side to prevent hydration mismatch
  React.useEffect(() => {
    setNow(new Date(Date.now() - 5 * 60 * 1000))
  }, [])

  // Sample data
  const sampleColumns = ["Name", "Email", "Description", "Category", "Status"]
  const sampleData = [
    ["John Doe", "john@example.com", "Software engineer with 5 years experience", "Technology", "Active"],
    ["Jane Smith", "jane@example.com", "Marketing manager specializing in digital campaigns", "Marketing", "Active"],
    ["Bob Johnson", "bob@example.com", "Sales representative for enterprise clients", "Sales", "Inactive"],
    ["Alice Brown", "alice@example.com", "Product designer focused on user experience", "Design", "Active"],
    ["Charlie Wilson", "charlie@example.com", "Data analyst with expertise in machine learning", "Analytics", "Active"]
  ]

  // Sample translation job
  const sampleJob: TranslationJob = {
    id: "job-1",
    fileName: "customers.csv",
    sourceLanguage: "English",
    targetLanguage: "Spanish",
    status: "processing",
    progress: 65,
    totalRows: 1000,
    processedRows: 650,
    createdAt: now || new Date("—"), // Use placeholder until client-side date is available
  }

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
  }

  const handleFileRemove = () => {
    setSelectedFile(null)
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">CSV Translator UI Components</h1>
        <p className="text-muted-foreground">
          A showcase of all the UI components built with shadcn/ui
        </p>
      </div>

      {/* Upload Box */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Box</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadBox
            onFileSelect={handleFileSelect}
            onFileRemove={handleFileRemove}
            selectedFile={selectedFile}
          />
        </CardContent>
      </Card>

      {/* Language Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Source Language Select</CardTitle>
          </CardHeader>
          <CardContent>
            <SourceLanguageSelect
              value={sourceLanguage}
              onValueChange={setSourceLanguage}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Target Language Select</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TargetLanguageSelect
              value={targetLanguage}
              onValueChange={setTargetLanguage}
            />
            <div className="border-t pt-4">
              <TargetLanguageSelect
                isMulti={true}
                values={targetLanguages}
                onValuesChange={setTargetLanguages}
                maxSelections={5}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Column Picker */}
      <Card>
        <CardHeader>
          <CardTitle>Column Picker</CardTitle>
        </CardHeader>
        <CardContent>
          <ColumnPicker
            columns={sampleColumns}
            columnMappings={columnMappings}
            onColumnMappingsChange={setColumnMappings}
            sampleData={sampleData}
          />
        </CardContent>
      </Card>

      {/* Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle>Progress Bar</CardTitle>
        </CardHeader>
        <CardContent>
          <ProgressBar
            job={sampleJob}
            onRetry={() => console.log("Retry clicked")}
            onPause={() => console.log("Pause clicked")}
          />
        </CardContent>
      </Card>

      {/* Preview Tables */}
      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Full Preview Table</CardTitle>
          </CardHeader>
          <CardContent>
            <PreviewTable
              data={sampleData}
              columns={sampleColumns}
              columnMappings={columnMappings}
              onExport={(data) => console.log("Export data:", data)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compact Preview Table</CardTitle>
          </CardHeader>
          <CardContent>
            <CompactPreviewTable
              data={sampleData}
              columns={sampleColumns}
              maxRows={3}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
