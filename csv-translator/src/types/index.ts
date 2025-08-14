// Global types for the application
export interface User {
  id: string;
  name: string;
  email: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export type Theme = 'light' | 'dark' | 'system';

// CSV Translator Types
export interface TranslationJob {
  id: string;
  fileName: string;
  sourceLanguage: string;
  targetLanguage: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalRows: number;
  processedRows: number;
  createdAt: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface TranslationRequest {
  text: string;
  fromLanguage: string;
  toLanguage: string;
}

export interface TranslationResponse {
  translatedText: string;
  detectedLanguage?: string;
  confidence?: number;
}

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface ColumnMapping {
  columnIndex: number;
  columnName: string;
  shouldTranslate: boolean;
  targetLanguage?: string;
}

export interface CSVTranslationConfig {
  sourceFile: File;
  columnMappings: ColumnMapping[];
  sourceLanguage: string;
  targetLanguages: string[];
  preserveFormatting: boolean;
  batchSize: number;
}
