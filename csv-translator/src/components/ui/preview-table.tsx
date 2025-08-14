"use client"

import * as React from "react"
import { 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  Search,
  Download,
  MoreHorizontal,
  Filter
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ColumnMapping } from "@/types"

interface PreviewTableProps {
  data: string[][]
  columns: string[]
  columnMappings?: ColumnMapping[]
  maxRows?: number
  showPagination?: boolean
  showSearch?: boolean
  showColumnToggle?: boolean
  showRowNumbers?: boolean
  onColumnVisibilityChange?: (columnIndex: number, visible: boolean) => void
  onExport?: (data: string[][]) => void
  className?: string
}

interface ColumnVisibility {
  [key: number]: boolean
}

export function PreviewTable({
  data,
  columns,
  columnMappings = [],
  maxRows = 100,
  showPagination = true,
  showSearch = true,
  showColumnToggle = true,
  showRowNumbers = false,
  onColumnVisibilityChange,
  onExport,
  className
}: PreviewTableProps) {
  const [currentPage, setCurrentPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibility>(() => {
    const initialVisibility: ColumnVisibility = {}
    columns.forEach((_, index) => {
      initialVisibility[index] = true
    })
    return initialVisibility
  })

  // Filter data based on search term
  const filteredData = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return data.slice(0, maxRows)
    }
    
    const searchLower = searchTerm.toLowerCase()
    return data.filter(row => 
      row.some(cell => 
        cell?.toString().toLowerCase().includes(searchLower)
      )
    ).slice(0, maxRows)
  }, [data, searchTerm, maxRows])

  // Pagination
  const totalPages = Math.ceil(filteredData.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = startIndex + pageSize
  const paginatedData = showPagination 
    ? filteredData.slice(startIndex, endIndex)
    : filteredData

  // Reset pagination when search changes
  React.useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const handleColumnVisibilityToggle = (columnIndex: number) => {
    const newVisibility = {
      ...columnVisibility,
      [columnIndex]: !columnVisibility[columnIndex]
    }
    setColumnVisibility(newVisibility)
    onColumnVisibilityChange?.(columnIndex, newVisibility[columnIndex])
  }

  const getColumnBadge = (columnIndex: number) => {
    const mapping = columnMappings.find(m => m.columnIndex === columnIndex)
    if (!mapping) return null

    return mapping.shouldTranslate ? (
      <Badge variant="default" className="text-xs">
        Translatable
      </Badge>
    ) : (
      <Badge variant="secondary" className="text-xs">
        Static
      </Badge>
    )
  }

  const visibleColumns = columns
    .map((column, index) => ({ column, index }))
    .filter(({ index }) => columnVisibility[index])

  const handleExport = () => {
    const exportData = [
      columns.filter((_, index) => columnVisibility[index]),
      ...filteredData.map(row => 
        row.filter((_, index) => columnVisibility[index])
      )
    ]
    onExport?.(exportData)
  }

  const truncateText = (text: string, maxLength: number = 50) => {
    if (!text) return ""
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text
  }

  if (!data || data.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center">
          <div className="text-muted-foreground">
            <Table className="h-12 w-12 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Data Available</h3>
            <p className="text-sm">Upload a CSV file to preview the data.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <span>Data Preview</span>
            <Badge variant="secondary">
              {filteredData.length} row{filteredData.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
          <div className="flex items-center space-x-2">
            {onExport && (
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            )}
            {showColumnToggle && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {columns.map((column, index) => (
                    <DropdownMenuItem
                      key={index}
                      onClick={() => handleColumnVisibilityToggle(index)}
                      className="flex items-center justify-between"
                    >
                      <span className="flex items-center space-x-2">
                        {columnVisibility[index] ? (
                          <Eye className="h-3 w-3" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                        <span className="truncate max-w-[120px]">{column}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Search */}
        {showSearch && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        )}

        {/* Table */}
        <div className="relative overflow-auto max-h-[500px] border rounded-lg">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {showRowNumbers && (
                  <TableHead className="w-12 text-center">#</TableHead>
                )}
                {visibleColumns.map(({ column, index }) => (
                  <TableHead key={index} className="min-w-[150px]">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium truncate">{column}</span>
                      {getColumnBadge(index)}
                    </div>
                  </TableHead>
                ))}
                {visibleColumns.length === 0 && (
                  <TableHead>
                    <span className="text-muted-foreground">No columns visible</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell 
                    colSpan={(showRowNumbers ? 1 : 0) + Math.max(visibleColumns.length, 1)} 
                    className="text-center py-8 text-muted-foreground"
                  >
                    {searchTerm ? "No results found" : "No data available"}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-muted/50">
                    {showRowNumbers && (
                      <TableCell className="text-center text-muted-foreground">
                        {startIndex + rowIndex + 1}
                      </TableCell>
                    )}
                    {visibleColumns.map(({ index: colIndex }) => (
                      <TableCell key={colIndex} className="max-w-[200px]">
                        <div 
                          className="truncate"
                          title={row[colIndex] || ""}
                        >
                          {truncateText(row[colIndex] || "")}
                        </div>
                      </TableCell>
                    ))}
                    {visibleColumns.length === 0 && (
                      <TableCell>
                        <span className="text-muted-foreground italic">
                          All columns hidden
                        </span>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {showPagination && filteredData.length > pageSize && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(parseInt(value))
                  setCurrentPage(1)
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {startIndex + 1}-{Math.min(endIndex, filteredData.length)} of{" "}
                {filteredData.length}
              </span>
              <div className="flex items-center space-x-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[60px] text-center">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-4 border-t">
          <span>
            Showing {paginatedData.length} of {filteredData.length} rows
            {searchTerm && ` matching "${searchTerm}"`}
          </span>
          <span>
            {visibleColumns.length} of {columns.length} columns visible
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// Compact version for smaller spaces
export function CompactPreviewTable({
  data,
  columns,
  maxRows = 5,
  className
}: Pick<PreviewTableProps, 'data' | 'columns' | 'maxRows' | 'className'>) {
  const previewData = data.slice(0, maxRows)
  
  if (!data || data.length === 0) {
    return (
      <div className={cn("text-center py-4 text-muted-foreground", className)}>
        <p className="text-sm">No preview available</p>
      </div>
    )
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.slice(0, 4).map((column, index) => (
              <TableHead key={index} className="text-xs font-medium">
                {column.length > 15 ? `${column.substring(0, 15)}...` : column}
              </TableHead>
            ))}
            {columns.length > 4 && (
              <TableHead className="text-xs text-muted-foreground">
                +{columns.length - 4} more
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {previewData.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.slice(0, 4).map((cell, cellIndex) => (
                <TableCell key={cellIndex} className="text-xs max-w-[100px]">
                  <div className="truncate">
                    {cell && cell.length > 20 ? `${cell.substring(0, 20)}...` : cell}
                  </div>
                </TableCell>
              ))}
              {row.length > 4 && (
                <TableCell className="text-xs text-muted-foreground">
                  <MoreHorizontal className="h-3 w-3" />
                </TableCell>
              )}
            </TableRow>
          ))}
          {data.length > maxRows && (
            <TableRow>
              <TableCell 
                colSpan={Math.min(columns.length, 4) + (columns.length > 4 ? 1 : 0)}
                className="text-center text-xs text-muted-foreground py-2"
              >
                +{data.length - maxRows} more rows
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
