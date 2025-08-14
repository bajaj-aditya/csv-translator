"use client"

import * as React from "react"
import { Check, ChevronDown, Columns, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ColumnMapping } from "@/types"

interface ColumnPickerProps {
  columns: string[]
  columnMappings: ColumnMapping[]
  onColumnMappingsChange: (mappings: ColumnMapping[]) => void
  sampleData?: string[][]
  disabled?: boolean
  className?: string
}

interface ColumnPreviewProps {
  columnName: string
  columnIndex: number
  sampleValues: string[]
  isSelected: boolean
  onToggle: () => void
  disabled?: boolean
}

function ColumnPreview({
  columnName,
  columnIndex,
  sampleValues,
  isSelected,
  onToggle,
  disabled = false
}: ColumnPreviewProps) {
  const [showPreview, setShowPreview] = React.useState(false)
  
  // Get first few non-empty sample values
  const previewValues = sampleValues
    .filter(val => val && val.trim().length > 0)
    .slice(0, 3)

  return (
    <Card className={cn(
      "transition-all duration-200 cursor-pointer border-2",
      isSelected 
        ? "border-primary bg-primary/5" 
        : "border-muted hover:border-muted-foreground/50",
      disabled && "opacity-50 cursor-not-allowed"
    )}>
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header with checkbox and column name */}
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <Checkbox
                checked={isSelected}
                onCheckedChange={onToggle}
                disabled={disabled}
                className="mt-1"
              />
              <div className="flex-1">
                <h4 className="text-sm font-medium">{columnName}</h4>
                <p className="text-xs text-muted-foreground">
                  Column {columnIndex + 1}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview(!showPreview)}
              className="h-6 w-6 p-0"
              disabled={disabled}
            >
              {showPreview ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
          </div>

          {/* Sample values preview */}
          {showPreview && previewValues.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">
                Sample values:
              </p>
              <div className="space-y-1">
                {previewValues.map((value, index) => (
                  <div
                    key={index}
                    className="text-xs p-2 bg-muted rounded text-muted-foreground"
                  >
                    {value.length > 50 ? `${value.substring(0, 50)}...` : value}
                  </div>
                ))}
                {sampleValues.length > previewValues.length && (
                  <p className="text-xs text-muted-foreground italic">
                    +{sampleValues.length - previewValues.length} more values...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Selected indicator */}
          {isSelected && (
            <div className="flex items-center space-x-2 pt-2 border-t">
              <Check className="h-3 w-3 text-primary" />
              <span className="text-xs text-primary font-medium">
                Selected for translation
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ColumnPicker({
  columns,
  columnMappings,
  onColumnMappingsChange,
  sampleData = [],
  disabled = false,
  className
}: ColumnPickerProps) {
  const [viewMode, setViewMode] = React.useState<"grid" | "list">("grid")
  const [selectAll, setSelectAll] = React.useState(false)

  // Update selectAll state when columnMappings change
  React.useEffect(() => {
    const selectedCount = columnMappings.filter(mapping => mapping.shouldTranslate).length
    setSelectAll(selectedCount === columns.length && columns.length > 0)
  }, [columnMappings, columns.length])

  const handleColumnToggle = (columnIndex: number) => {
    if (disabled) return

    const existingMapping = columnMappings.find(m => m.columnIndex === columnIndex)
    
    if (existingMapping) {
      // Toggle existing mapping
      const updatedMappings = columnMappings.map(mapping =>
        mapping.columnIndex === columnIndex
          ? { ...mapping, shouldTranslate: !mapping.shouldTranslate }
          : mapping
      )
      onColumnMappingsChange(updatedMappings)
    } else {
      // Create new mapping
      const newMapping: ColumnMapping = {
        columnIndex,
        columnName: columns[columnIndex],
        shouldTranslate: true
      }
      onColumnMappingsChange([...columnMappings, newMapping])
    }
  }

  const handleSelectAll = () => {
    if (disabled) return

    const newMappings = columns.map((columnName, columnIndex): ColumnMapping => {
      const existingMapping = columnMappings.find(m => m.columnIndex === columnIndex)
      return existingMapping 
        ? { ...existingMapping, shouldTranslate: !selectAll }
        : {
            columnIndex,
            columnName,
            shouldTranslate: !selectAll
          }
    })
    
    onColumnMappingsChange(newMappings)
  }

  const handleClearSelection = () => {
    if (disabled) return
    
    const clearedMappings = columnMappings.map(mapping => ({
      ...mapping,
      shouldTranslate: false
    }))
    onColumnMappingsChange(clearedMappings)
  }

  const selectedCount = columnMappings.filter(mapping => mapping.shouldTranslate).length

  const getSampleValuesForColumn = (columnIndex: number): string[] => {
    if (!sampleData || sampleData.length === 0) return []
    return sampleData
      .map(row => row[columnIndex] || "")
      .filter(val => val.trim().length > 0)
  }

  const isColumnSelected = (columnIndex: number): boolean => {
    const mapping = columnMappings.find(m => m.columnIndex === columnIndex)
    return mapping ? mapping.shouldTranslate : false
  }

  if (columns.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <Columns className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Columns Available</h3>
          <p className="text-sm text-muted-foreground">
            Upload a CSV file to select columns for translation.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Columns className="h-5 w-5" />
              <span>Select Columns to Translate</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Choose which columns should be translated
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="secondary">
              {selectedCount} of {columns.length} selected
            </Badge>
            <Select value={viewMode} onValueChange={(value: "grid" | "list") => setViewMode(value)}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">Grid</SelectItem>
                <SelectItem value="list">List</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={selectAll}
              onCheckedChange={handleSelectAll}
              disabled={disabled}
            />
            <label className="text-sm font-medium">
              Select all columns
            </label>
          </div>
          {selectedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearSelection}
              disabled={disabled}
              className="text-xs"
            >
              Clear selection
            </Button>
          )}
        </div>

        {/* Columns */}
        <div className={cn(
          viewMode === "grid" 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            : "space-y-3"
        )}>
          {columns.map((columnName, columnIndex) => (
            <ColumnPreview
              key={columnIndex}
              columnName={columnName}
              columnIndex={columnIndex}
              sampleValues={getSampleValuesForColumn(columnIndex)}
              isSelected={isColumnSelected(columnIndex)}
              onToggle={() => handleColumnToggle(columnIndex)}
              disabled={disabled}
            />
          ))}
        </div>

        {selectedCount > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedCount} column{selectedCount !== 1 ? 's' : ''} will be translated
              </span>
              <Badge variant="default">
                Ready to translate
              </Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
