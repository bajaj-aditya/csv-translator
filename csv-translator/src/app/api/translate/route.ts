import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify/sync';
import pLimit from 'p-limit';
import { ColumnMapping, CSVTranslationConfig } from '../../../types';
import { AzureTranslator } from '../../../lib/azure';

// ------------------ Simple in-memory rate limit ----------------------
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 8;
const rateLimitMap = new Map<string, { count: number; firstRequestTs: number }>();
//---------------------------------------------------------------------
import { CSV_CONFIG, TRANSLATION_LIMITS } from '../../../constants';

// Initialize Azure Translator
const azureTranslator = new AzureTranslator();

// Real translation service using Azure Translator API
async function translateText(
  text: string,
  fromLang: string,
  toLang: string
): Promise<string> {
  if (!text || text.trim() === '') return text;
  
  try {
    // Add delay to prevent rate limiting (increased for large files)
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const result = await azureTranslator.translateText(text, toLang, fromLang);
    return result.translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    // Fallback to original text if translation fails
    return text;
  }
}

interface TranslationProgress {
  type: 'progress' | 'error' | 'complete' | 'data';
  totalRows?: number;
  processedRows?: number;
  currentBatch?: number;
  totalBatches?: number;
  message?: string;
  data?: string; // CSV chunk data
  error?: string;
}

export async function POST(request: NextRequest) {
  // -------- Rate limiting per IP --------
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { count: 1, firstRequestTs: now });
  } else {
    if (now - entry.firstRequestTs < RATE_LIMIT_WINDOW_MS) {
      entry.count += 1;
      if (entry.count > MAX_REQUESTS_PER_WINDOW) {
        return new Response("Rate limit exceeded. Please try again later.", {
          status: 429,
        });
      }
    } else {
      // Reset window
      rateLimitMap.set(ip, { count: 1, firstRequestTs: now });
    }
  }
  //----------------------------------------
  const encoder = new TextEncoder();
  
  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Send SSE headers
      const sendEvent = (data: TranslationProgress) => {
        const sseData = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
      };

      // Parse the request
      processTranslationRequest(request, sendEvent)
        .then(() => {
          controller.close();
        })
        .catch((error) => {
          sendEvent({
            type: 'error',
            error: error.message || 'Unknown error occurred'
          });
          controller.close();
        });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function processTranslationRequest(
  request: NextRequest,
  sendEvent: (data: TranslationProgress) => void
) {
  try {
    // Parse multipart form data
    const formData = await request.formData();
    const csvFile = formData.get('file') as File;
    const configData = formData.get('config') as string;

    if (!csvFile) {
      throw new Error('No CSV file provided');
    }

    if (!configData) {
      throw new Error('No configuration provided');
    }

    const config: CSVTranslationConfig = JSON.parse(configData);

    // Validate file size
    if (csvFile.size > CSV_CONFIG.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum allowed size of ${CSV_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Read and parse CSV file
    const csvContent = await csvFile.text();
    const csvRows: string[][] = [];
    let headers: string[] = [];
    let totalRows = 0;

    // Large file warnings and estimates
    if (csvFile.size > 50 * 1024 * 1024) {
      sendEvent({
        type: 'progress',
        message: 'Very large file detected! This may take 30+ minutes to process...',
      });
    } else if (csvFile.size > 10 * 1024 * 1024) {
      sendEvent({
        type: 'progress',
        message: 'Large file detected, processing might take 10-20 minutes…',
      });
    }

    // Parse CSV using csv-parse for streaming
    const parser = parse({
      skip_empty_lines: true,
      trim: true,
    });

    let isFirstRow = true;
    parser.on('readable', function() {
      let record;
      while ((record = parser.read()) !== null) {
        if (isFirstRow) {
          headers = record;
          isFirstRow = false;
        } else {
          csvRows.push(record);
          totalRows++;
        }
      }
    });

    parser.on('error', function(err) {
      throw new Error(`CSV parsing error: ${err.message}`);
    });

    // Parse the CSV content
    await new Promise((resolve, reject) => {
      parser.on('end', resolve);
      parser.on('error', reject);
      parser.write(csvContent);
      parser.end();
    });

    sendEvent({
      type: 'progress',
      message: `Parsed CSV file: ${totalRows} rows, ${headers.length} columns`,
      totalRows,
      processedRows: 0,
    });

    // Set up batch processing
    const batchSize = Math.min(
      Math.max(config.batchSize || CSV_CONFIG.DEFAULT_BATCH_SIZE, CSV_CONFIG.MIN_BATCH_SIZE),
      CSV_CONFIG.MAX_BATCH_SIZE
    );
    
    const totalBatches = Math.ceil(totalRows / batchSize);
    const concurrencyLimit = Math.min(
      TRANSLATION_LIMITS.MAX_CONCURRENT_REQUESTS,
      CSV_CONFIG.DEFAULT_CONCURRENCY
    );

    // Create concurrency limiter
    const limit = pLimit(concurrencyLimit);
    let processedRows = 0;
    let currentBatch = 0;

    // Process rows in batches
    const translatedRows: string[][] = [];
    
    for (let i = 0; i < totalRows; i += batchSize) {
      const batch = csvRows.slice(i, i + batchSize);
      currentBatch++;
      
      sendEvent({
        type: 'progress',
        message: `Processing batch ${currentBatch} of ${totalBatches}`,
        totalRows,
        processedRows,
        currentBatch,
        totalBatches,
      });

      // Process batch with concurrency control
      const batchPromises = batch.map((row, rowIndex) => 
        limit(async () => {
          const translatedRow: string[] = [];
          
          // Process each column according to mapping
          for (let colIndex = 0; colIndex < row.length; colIndex++) {
            const columnMapping = config.columnMappings.find(
              (mapping) => mapping.columnIndex === colIndex
            );
            
            if (columnMapping && columnMapping.shouldTranslate && columnMapping.targetLanguage) {
              try {
                // Translate the cell content
                const originalText = row[colIndex];
                const translatedText = await translateText(
                  originalText,
                  config.sourceLanguage,
                  columnMapping.targetLanguage
                );
                translatedRow.push(translatedText);
              } catch (error) {
                // If translation fails, keep original text
                console.error(`Translation error for row ${i + rowIndex}, col ${colIndex}:`, error);
                translatedRow.push(row[colIndex]);
              }
            } else {
              // Keep original value if not marked for translation
              translatedRow.push(row[colIndex]);
            }
          }
          
          return translatedRow;
        })
      );

      // Wait for batch to complete
      const translatedBatch = await Promise.all(batchPromises);
      translatedRows.push(...translatedBatch);
      processedRows += batch.length;

      // Send progress update
      sendEvent({
        type: 'progress',
        message: `Completed batch ${currentBatch} of ${totalBatches}`,
        totalRows,
        processedRows,
        currentBatch,
        totalBatches,
      });
    }

    // Generate final CSV output
    sendEvent({
      type: 'progress',
      message: 'Generating final CSV output...',
      totalRows,
      processedRows,
    });

    // Create final CSV with headers
    const finalCsvData = [headers, ...translatedRows];
    const finalCsv = stringify(finalCsvData, {
      header: false,
    });

    // Send completion event with final CSV
    sendEvent({
      type: 'complete',
      message: 'Translation completed successfully',
      totalRows,
      processedRows,
      data: finalCsv,
    });

  } catch (error) {
    console.error('Translation process error:', error);
    sendEvent({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
