import * as Papa from 'papaparse';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

export interface CSVParseOptions {
  header?: boolean;
  skipEmptyLines?: boolean;
  delimiter?: string;
  encoding?: string;
}

export interface CSVData {
  headers: string[];
  rows: string[][];
}

/**
 * Parse CSV file using PapaParse (client-side)
 */
export function parseCSVFile(file: File, options: CSVParseOptions = {}): Promise<CSVData> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: options.skipEmptyLines ?? true,
      delimiter: options.delimiter ?? '',
      encoding: options.encoding ?? 'UTF-8',
      complete: (results) => {
        if (results.errors.length > 0) {
          reject(new Error(`CSV parsing error: ${results.errors[0].message}`));
          return;
        }

        const data = results.data as string[][];
        if (data.length === 0) {
          resolve({ headers: [], rows: [] });
          return;
        }

        const headers = options.header !== false ? data[0] : [];
        const rows = options.header !== false ? data.slice(1) : data;

        resolve({ headers, rows });
      },
      error: (error) => {
        reject(error);
      }
    });
  });
}

/**
 * Parse CSV string using csv-parse (server-side compatible)
 */
export function parseCSVString(csvString: string, options: CSVParseOptions = {}): CSVData {
  try {
    const records = parse(csvString, {
      skip_empty_lines: options.skipEmptyLines ?? true,
      delimiter: options.delimiter,
      encoding: options.encoding as BufferEncoding,
    }) as string[][];

    if (records.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = options.header !== false ? records[0] : [];
    const rows = options.header !== false ? records.slice(1) : records;

    return { headers, rows };
  } catch (error) {
    throw new Error(`CSV parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Convert CSV data to string using csv-stringify
 */
export function stringifyCSV(data: CSVData, options: { includeHeaders?: boolean } = {}): string {
  const { headers, rows } = data;
  const { includeHeaders = true } = options;

  const allRows = includeHeaders && headers.length > 0 ? [headers, ...rows] : rows;

  try {
    return stringify(allRows, {
      header: false,
    });
  } catch (error) {
    throw new Error(`CSV stringify error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate CSV data structure
 */
export function validateCSVData(data: CSVData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.headers || !Array.isArray(data.headers)) {
    errors.push('Headers must be an array');
  }

  if (!data.rows || !Array.isArray(data.rows)) {
    errors.push('Rows must be an array');
  }

  if (data.headers.length > 0 && data.rows.length > 0) {
    const headerCount = data.headers.length;
    for (let i = 0; i < data.rows.length; i++) {
      if (!Array.isArray(data.rows[i])) {
        errors.push(`Row ${i + 1} is not an array`);
        continue;
      }
      
      if (data.rows[i].length !== headerCount) {
        errors.push(`Row ${i + 1} has ${data.rows[i].length} columns, expected ${headerCount}`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get CSV file statistics
 */
export function getCSVStats(data: CSVData): {
  totalRows: number;
  totalColumns: number;
  emptyFields: number;
  filledFields: number;
} {
  const totalColumns = data.headers.length;
  const totalRows = data.rows.length;
  let emptyFields = 0;
  let filledFields = 0;

  for (const row of data.rows) {
    for (const field of row) {
      if (field === null || field === undefined || field.toString().trim() === '') {
        emptyFields++;
      } else {
        filledFields++;
      }
    }
  }

  return {
    totalRows,
    totalColumns,
    emptyFields,
    filledFields
  };
}
