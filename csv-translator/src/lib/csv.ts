import { Readable, Transform } from 'stream';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify';
import { pipeline } from 'stream/promises';

export interface CSVParseOptions {
  delimiter?: string;
  quote?: string;
  escape?: string;
  columns?: boolean | string[];
  skipEmptyLines?: boolean;
  skipLinesWithError?: boolean;
  trim?: boolean;
  ltrim?: boolean;
  rtrim?: boolean;
  encoding?: BufferEncoding;
  bom?: boolean;
  comment?: string;
  maxRecordSize?: number;
  relaxColumnCount?: boolean;
  relaxQuotes?: boolean;
  skipRecordsWithEmptyValues?: boolean;
}

export interface CSVStringifyOptions {
  delimiter?: string;
  quote?: string;
  escape?: string;
  header?: boolean;
  columns?: string[] | { [key: string]: string };
  quotedString?: boolean;
  quotedEmpty?: boolean;
  quotedMatch?: RegExp | string;
  recordDelimiter?: string;
  bom?: boolean;
  cast?: {
    boolean?: (value: boolean, context: any) => string;
    date?: (value: Date, context: any) => string;
    number?: (value: number, context: any) => string;
    object?: (value: any, context: any) => string;
    string?: (value: string, context: any) => string;
  };
}

export interface CSVFormatInfo {
  delimiter: string;
  quote: string;
  escape: string;
  hasBOM: boolean;
  lineEnding: string;
  encoding: string;
  headers?: string[];
}

export interface StreamingCSVOptions extends CSVParseOptions {
  highWaterMark?: number;
  objectMode?: boolean;
}

/**
 * Detects CSV format characteristics from a sample
 */
export function detectCSVFormat(sample: Buffer | string): CSVFormatInfo {
  const text = typeof sample === 'string' ? sample : sample.toString('utf8');
  const firstLines = text.split('\n').slice(0, 10).join('\n');
  
  // Detect BOM
  const hasBOM = typeof sample !== 'string' && 
    sample.length >= 3 && 
    sample[0] === 0xEF && sample[1] === 0xBB && sample[2] === 0xBF;
  
  // Detect line endings
  let lineEnding = '\n';
  if (text.includes('\r\n')) {
    lineEnding = '\r\n';
  } else if (text.includes('\r')) {
    lineEnding = '\r';
  }
  
  // Detect delimiter by counting occurrences
  const delimiters = [',', ';', '\t', '|'];
  const delimiterCounts = delimiters.map(delim => ({
    char: delim,
    count: (firstLines.match(new RegExp(`\\${delim}`, 'g')) || []).length
  }));
  
  const mostLikelyDelimiter = delimiterCounts
    .sort((a, b) => b.count - a.count)[0]?.char || ',';
  
  // Detect quote character
  const quoteChars = ['"', "'"];
  const quoteCounts = quoteChars.map(quote => ({
    char: quote,
    count: (firstLines.match(new RegExp(`\\${quote}`, 'g')) || []).length
  }));
  
  const mostLikelyQuote = quoteCounts
    .sort((a, b) => b.count - a.count)[0]?.char || '"';
  
  // Detect encoding (simplified heuristic)
  let encoding: string = 'utf8';
  if (typeof sample !== 'string') {
    // Check for common encoding patterns
    const bytes = Array.from(sample.slice(0, 1000));
    const hasHighBytes = bytes.some(b => b > 127);
    
    if (hasHighBytes) {
      // Very simplified detection - in production, use a proper encoding detection library
      encoding = 'utf8'; // Default assumption
    }
  }
  
  return {
    delimiter: mostLikelyDelimiter,
    quote: mostLikelyQuote,
    escape: mostLikelyQuote, // Typically the same as quote
    hasBOM,
    lineEnding,
    encoding,
  };
}

/**
 * Streaming CSV reader class
 */
export class CSVReader {
  private options: StreamingCSVOptions;
  
  constructor(options: StreamingCSVOptions = {}) {
    this.options = {
      delimiter: ',',
      quote: '"',
      escape: '"',
      columns: true,
      skipEmptyLines: true,
      encoding: 'utf8',
      bom: true,
      highWaterMark: 64 * 1024, // 64KB
      objectMode: true,
      ...options,
    };
  }
  
  /**
   * Create a readable stream from a Buffer or string
   */
  createReadableStream(input: Buffer | string): Readable {
    if (typeof input === 'string') {
      return Readable.from([Buffer.from(input, this.options.encoding)]);
    }
    return Readable.from([input]);
  }
  
  /**
   * Parse CSV from a readable stream
   */
  parse(input: Readable | Buffer | string): Transform {
    const inputStream = input instanceof Readable 
      ? input 
      : this.createReadableStream(input);
    
    return inputStream.pipe(parse(this.options));
  }
  
  /**
   * Parse CSV with automatic format detection
   */
  parseWithDetection(input: Buffer | string): Transform {
    const format = detectCSVFormat(input);
    const detectedOptions = {
      ...this.options,
      delimiter: format.delimiter,
      quote: format.quote,
      escape: format.escape,
      bom: format.hasBOM,
    };
    
    const inputStream = this.createReadableStream(input);
    return inputStream.pipe(parse(detectedOptions));
  }
  
  /**
   * Parse entire CSV into memory (use with caution for large files)
   */
  async parseToArray(input: Readable | Buffer | string): Promise<any[]> {
    const results: any[] = [];
    const parser = this.parse(input);
    
    return new Promise((resolve, reject) => {
      parser.on('data', (record) => results.push(record));
      parser.on('error', reject);
      parser.on('end', () => resolve(results));
    });
  }
  
  /**
   * Parse CSV with callback for each record
   */
  async parseWithCallback(
    input: Readable | Buffer | string,
    callback: (record: any, index: number) => void | Promise<void>
  ): Promise<void> {
    const parser = this.parse(input);
    let index = 0;
    
    return new Promise((resolve, reject) => {
      parser.on('data', async (record) => {
        try {
          await callback(record, index++);
        } catch (error) {
          reject(error);
        }
      });
      parser.on('error', reject);
      parser.on('end', resolve);
    });
  }
}

/**
 * CSV writer class that preserves formatting
 */
export class CSVWriter {
  private options: CSVStringifyOptions;
  private formatInfo?: CSVFormatInfo;
  
  constructor(options: CSVStringifyOptions = {}, formatInfo?: CSVFormatInfo) {
    this.formatInfo = formatInfo;
    this.options = {
      delimiter: formatInfo?.delimiter || ',',
      quote: formatInfo?.quote || '"',
      escape: formatInfo?.escape || '"',
      header: true,
      quotedString: true,
      quotedEmpty: false,
      bom: formatInfo?.hasBOM || false,
      recordDelimiter: formatInfo?.lineEnding || '\n',
      ...options,
    };
  }
  
  /**
   * Create a stringify transform stream
   */
  createStringifyStream(): Transform {
    return stringify(this.options);
  }
  
  /**
   * Convert array of objects/arrays to CSV string
   */
  async stringify(records: any[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      const stringifier = this.createStringifyStream();
      
      stringifier.on('data', (chunk) => chunks.push(chunk.toString()));
      stringifier.on('error', reject);
      stringifier.on('end', () => {
        let result = chunks.join('');
        
        // Add BOM if required
        if (this.options.bom && this.formatInfo?.hasBOM) {
          result = '\uFEFF' + result;
        }
        
        resolve(result);
      });
      
      // Write records
      for (const record of records) {
        stringifier.write(record);
      }
      stringifier.end();
    });
  }
  
  /**
   * Stream records to a writable stream
   */
  async streamTo(records: any[], writable: NodeJS.WritableStream): Promise<void> {
    const stringifier = this.createStringifyStream();
    
    await pipeline(
      Readable.from(records),
      stringifier,
      writable
    );
  }
  
  /**
   * Create a CSV Buffer with proper encoding and BOM
   */
  async createBuffer(records: any[], encoding: BufferEncoding = 'utf8'): Promise<Buffer> {
    const csvString = await this.stringify(records);
    return Buffer.from(csvString, encoding);
  }
}

/**
 * High-level CSV processing functions
 */

/**
 * Parse CSV from various input types with automatic format detection
 */
export async function parseCSV(
  input: Buffer | string | Readable,
  options: StreamingCSVOptions = {}
): Promise<any[]> {
  const reader = new CSVReader(options);
  
  if (input instanceof Readable) {
    return reader.parseToArray(input);
  } else {
    return reader.parseToArray(input);
  }
}

/**
 * Convert data to CSV string with format preservation
 */
export async function toCSV(
  records: any[],
  options: CSVStringifyOptions = {},
  preserveFormat?: CSVFormatInfo
): Promise<string> {
  const writer = new CSVWriter(options, preserveFormat);
  return writer.stringify(records);
}

/**
 * Transform CSV while preserving original formatting
 */
export async function transformCSV(
  input: Buffer | string,
  transformer: (record: any, index: number) => any | Promise<any>,
  options: {
    parseOptions?: StreamingCSVOptions;
    stringifyOptions?: CSVStringifyOptions;
  } = {}
): Promise<string> {
  // Detect original format
  const formatInfo = detectCSVFormat(input);
  
  // Parse with detected format
  const reader = new CSVReader({
    ...options.parseOptions,
    delimiter: formatInfo.delimiter,
    quote: formatInfo.quote,
    escape: formatInfo.escape,
    bom: formatInfo.hasBOM,
  });
  
  const records = await reader.parseToArray(input);
  
  // Transform records
  const transformedRecords = [];
  for (let i = 0; i < records.length; i++) {
    const transformed = await transformer(records[i], i);
    if (transformed !== null && transformed !== undefined) {
      transformedRecords.push(transformed);
    }
  }
  
  // Write with preserved format
  const writer = new CSVWriter(options.stringifyOptions, formatInfo);
  return writer.stringify(transformedRecords);
}

/**
 * Validate CSV structure and content
 */
export interface CSVValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalRecords: number;
    totalColumns: number;
    emptyFields: number;
    malformedRecords: number;
    duplicateHeaders: string[];
    columnStats: { [column: string]: { empty: number; unique: number } };
  };
}

export async function validateCSV(
  input: Buffer | string | Readable,
  options: {
    parseOptions?: StreamingCSVOptions;
    requiredColumns?: string[];
    maxRecords?: number;
    allowEmptyFields?: boolean;
  } = {}
): Promise<CSVValidationResult> {
  const reader = new CSVReader(options.parseOptions);
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalRecords = 0;
  let totalColumns = 0;
  let emptyFields = 0;
  let malformedRecords = 0;
  const columnStats: { [column: string]: { empty: number; unique: Set<any> } } = {};
  let headers: string[] = [];
  
  try {
    const parser = reader.parse(input);
    let isFirstRecord = true;
    
    await new Promise<void>((resolve, reject) => {
      parser.on('data', (record) => {
        totalRecords++;
        
        if (options.maxRecords && totalRecords > options.maxRecords) {
          warnings.push(`Validation stopped at ${options.maxRecords} records`);
          return resolve();
        }
        
        if (isFirstRecord) {
          headers = Object.keys(record);
          totalColumns = headers.length;
          
          // Check for duplicate headers
          const duplicateHeaders = headers.filter((header, index, arr) => 
            arr.indexOf(header) !== index
          );
          if (duplicateHeaders.length > 0) {
            errors.push(`Duplicate headers found: ${duplicateHeaders.join(', ')}`);
          }
          
          // Check required columns
          if (options.requiredColumns) {
            const missingColumns = options.requiredColumns.filter(
              col => !headers.includes(col)
            );
            if (missingColumns.length > 0) {
              errors.push(`Missing required columns: ${missingColumns.join(', ')}`);
            }
          }
          
          // Initialize column stats
          headers.forEach(header => {
            columnStats[header] = { empty: 0, unique: new Set() };
          });
          
          isFirstRecord = false;
        }
        
        // Validate record structure
        const recordKeys = Object.keys(record);
        if (recordKeys.length !== totalColumns) {
          malformedRecords++;
          errors.push(`Record ${totalRecords} has ${recordKeys.length} columns, expected ${totalColumns}`);
        }
        
        // Check for empty fields and collect stats
        for (const [key, value] of Object.entries(record)) {
          if (value === null || value === undefined || value === '') {
            emptyFields++;
            if (columnStats[key]) {
              columnStats[key].empty++;
            }
            if (!options.allowEmptyFields) {
              warnings.push(`Empty field in column '${key}' at record ${totalRecords}`);
            }
          } else {
            if (columnStats[key]) {
              columnStats[key].unique.add(value);
            }
          }
        }
      });
      
      parser.on('error', (error) => {
        errors.push(`Parse error: ${error.message}`);
        reject(error);
      });
      
      parser.on('end', resolve);
    });
  } catch (error) {
    errors.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Convert unique sets to counts
  const finalColumnStats: { [column: string]: { empty: number; unique: number } } = {};
  for (const [column, stats] of Object.entries(columnStats)) {
    finalColumnStats[column] = {
      empty: stats.empty,
      unique: stats.unique.size,
    };
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalRecords,
      totalColumns,
      emptyFields,
      malformedRecords,
      duplicateHeaders: headers.filter((header, index, arr) => 
        arr.indexOf(header) !== index
      ),
      columnStats: finalColumnStats,
    },
  };
}

/**
 * Split large CSV into smaller chunks while preserving headers
 */
export async function chunkCSV(
  input: Buffer | string,
  chunkSize: number,
  options: StreamingCSVOptions = {}
): Promise<string[]> {
  const reader = new CSVReader(options);
  const records = await reader.parseToArray(input);
  
  if (records.length === 0) {
    return [];
  }
  
  const chunks: string[] = [];
  const formatInfo = detectCSVFormat(input);
  const writer = new CSVWriter({}, formatInfo);
  
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const csvChunk = await writer.stringify(chunk);
    chunks.push(csvChunk);
  }
  
  return chunks;
}
