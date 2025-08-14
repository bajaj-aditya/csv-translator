# CSV Translator UI Components

This directory contains custom UI components built with shadcn/ui for the CSV Translator application. All components are fully typed with TypeScript and follow modern React patterns.

## Components Overview

### 1. UploadBox (`upload-box.tsx`)

A drag-and-drop file upload component specifically designed for CSV files.

**Features:**
- Drag-and-drop functionality
- File type validation (CSV, TXT)
- File size validation (max 50MB)
- Visual feedback for drag states
- File preview with size information
- Error handling and display

**Props:**
```typescript
interface UploadBoxProps {
  onFileSelect: (file: File) => void
  onFileRemove: () => void
  selectedFile?: File | null
  error?: string
  disabled?: boolean
  className?: string
}
```

**Usage:**
```tsx
<UploadBox
  onFileSelect={handleFileSelect}
  onFileRemove={handleFileRemove}
  selectedFile={selectedFile}
  error={uploadError}
/>
```

### 2. Language Selection Components (`language-select.tsx`)

A collection of components for language selection with support for single and multi-selection.

**Components:**
- `LanguageSelect` - Basic single language selector
- `MultiLanguageSelect` - Multiple language selector with badges
- `SourceLanguageSelect` - Labeled source language selector
- `TargetLanguageSelect` - Labeled target language selector (supports multi-mode)

**Features:**
- Native language names with English translations
- Visual language badges
- Multi-selection with limits
- Clear all functionality
- Disabled state support

**Usage:**
```tsx
// Single selection
<SourceLanguageSelect
  value={sourceLanguage}
  onValueChange={setSourceLanguage}
/>

// Multi-selection
<TargetLanguageSelect
  isMulti={true}
  values={targetLanguages}
  onValuesChange={setTargetLanguages}
  maxSelections={5}
/>
```

### 3. ColumnPicker (`column-picker.tsx`)

An interactive component for selecting which CSV columns should be translated.

**Features:**
- Grid and list view modes
- Sample data preview for each column
- Select all/clear all functionality
- Column-specific selection states
- Visual indicators for translatable columns
- Responsive design

**Props:**
```typescript
interface ColumnPickerProps {
  columns: string[]
  columnMappings: ColumnMapping[]
  onColumnMappingsChange: (mappings: ColumnMapping[]) => void
  sampleData?: string[][]
  disabled?: boolean
  className?: string
}
```

**Usage:**
```tsx
<ColumnPicker
  columns={csvColumns}
  columnMappings={columnMappings}
  onColumnMappingsChange={setColumnMappings}
  sampleData={sampleData}
/>
```

### 4. Progress Components (`progress-bar.tsx`)

Real-time progress tracking components for translation jobs.

**Components:**
- `ProgressBar` - Single job progress with detailed stats
- `MultiProgressBar` - Multiple job progress overview

**Features:**
- Real-time progress updates
- Status indicators (pending, processing, completed, failed)
- Estimated time remaining calculations
- Processing rate display
- Action buttons (pause, resume, retry)
- Error message display

**Usage:**
```tsx
<ProgressBar
  job={translationJob}
  onRetry={() => handleRetry(job.id)}
  onPause={() => handlePause(job.id)}
  onResume={() => handleResume(job.id)}
/>

<MultiProgressBar
  jobs={translationJobs}
  onJobRetry={handleJobRetry}
  onJobPause={handleJobPause}
  onJobResume={handleJobResume}
/>
```

### 5. Preview Table Components (`preview-table.tsx`)

Data preview components for displaying CSV content with advanced features.

**Components:**
- `PreviewTable` - Full-featured data table with pagination, search, and filtering
- `CompactPreviewTable` - Minimal preview for smaller spaces

**Features:**
- Pagination with configurable page sizes
- Real-time search across all data
- Column visibility toggle
- Export functionality
- Row numbering
- Data truncation for large content
- Column mapping indicators
- Responsive design

**Props:**
```typescript
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
```

**Usage:**
```tsx
<PreviewTable
  data={csvData}
  columns={csvColumns}
  columnMappings={columnMappings}
  onExport={handleExport}
  showSearch={true}
  showPagination={true}
/>

<CompactPreviewTable
  data={csvData}
  columns={csvColumns}
  maxRows={3}
/>
```

## Dependencies

All components depend on the following shadcn/ui components:
- Button
- Card
- Input
- Progress
- Select
- Table
- Badge
- Checkbox
- Dropdown Menu

## Styling

Components use Tailwind CSS classes and follow the shadcn/ui design system. They support both light and dark themes through CSS variables.

## Type Safety

All components are fully typed with TypeScript and use the following shared types:
- `Language` - Language definition with code, name, and native name
- `ColumnMapping` - Column selection and translation mapping
- `TranslationJob` - Translation job status and progress
- `CSVTranslationConfig` - Complete translation configuration

## Accessibility

All components follow accessibility best practices:
- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- Focus management
- Color contrast compliance

## Browser Support

Components support all modern browsers with ES2018+ support and are optimized for:
- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Development

To extend or modify components:

1. All components are in the `src/components/ui/` directory
2. Follow the existing naming conventions
3. Add proper TypeScript types
4. Include JSDoc comments for props
5. Test with the demo page at `/demo`

## Demo

Visit `/demo` to see all components in action with sample data and interactive examples.
