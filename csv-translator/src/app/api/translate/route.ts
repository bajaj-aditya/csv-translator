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

// Enhanced batch processing with error recovery
async function processBatchWithRecovery(
  batch: string[][],
  batchStartIndex: number,
  config: CSVTranslationConfig,
  limit: any,
  sendEvent: (data: TranslationProgress) => void
): Promise<string[][]> {
  const batchPromises = batch.map((row, rowIndex) => 
    limit(async () => {
      const rowStartTime = Date.now();
      const actualRowIndex = batchStartIndex + rowIndex;
      
      try {
        const translatedRow: string[] = [];
        
        // Process each column according to mapping
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
          const columnMapping = config.columnMappings.find(
            (mapping) => mapping.columnIndex === colIndex
          );
          
          if (columnMapping && columnMapping.shouldTranslate && columnMapping.targetLanguage) {
            try {
              // Add extra logging for translation attempts
              console.log(`Translating row ${actualRowIndex}, col ${colIndex}: "${row[colIndex].substring(0, 50)}${row[colIndex].length > 50 ? '...' : '"'}`);
              
              // Translate the cell content with retry logic
              const originalText = row[colIndex];
              if (!originalText || originalText.trim() === '') {
                translatedRow.push(originalText);
                continue;
              }
              
              const translatedText = await translateTextWithRetry(
                originalText,
                config.sourceLanguage,
                columnMapping.targetLanguage,
                3 // max retries per cell
              );
              translatedRow.push(translatedText);
              
            } catch (error) {
              // If translation fails, keep original text
              console.error(`Translation error for row ${actualRowIndex}, col ${colIndex}:`, error);
              translatedRow.push(row[colIndex]);
            }
          } else {
            // Keep original value if not marked for translation
            translatedRow.push(row[colIndex]);
          }
        }
        
        const rowTime = Date.now() - rowStartTime;
        if (rowTime > 5000) { // Log slow rows
          console.log(`Row ${actualRowIndex} took ${rowTime}ms to process`);
        }
        
        return translatedRow;
        
      } catch (error) {
        console.error(`Error processing row ${actualRowIndex}:`, error);
        // Return original row on error
        return row;
      }
    })
  );

  // Wait for batch to complete with detailed error reporting
  const translatedBatch = await Promise.allSettled(batchPromises);
  
  // Process results and handle failures
  const results: string[][] = [];
  let failedRows = 0;
  
  for (let i = 0; i < translatedBatch.length; i++) {
    const result = translatedBatch[i];
    if (result.status === 'fulfilled') {
      results.push(result.value);
    } else {
      console.error(`Row ${batchStartIndex + i} failed:`, result.reason);
      results.push(batch[i]); // Use original row
      failedRows++;
    }
  }
  
  if (failedRows > 0) {
    sendEvent({
      type: 'progress',
      message: `⚠️ ${failedRows} rows failed in this batch, using original text`,
    });
  }
  
  return results;
}

// Translation with retry logic
async function translateTextWithRetry(
  text: string,
  fromLang: string,
  toLang: string,
  maxRetries: number = 3
): Promise<string> {
  if (!text || text.trim() === '') return text;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Progressive delay based on attempt number
      const delay = 200 + (attempt - 1) * 300;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const result = await azureTranslator.translateText(text, toLang, fromLang);
      return result.translatedText;
      
    } catch (error) {
      console.error(`Translation attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt === maxRetries) {
        // Final attempt failed, return original text
        console.error(`All translation attempts failed for text: "${text.substring(0, 100)}${text.length > 100 ? '...' : '"'}`);
        return text;
      }
      
      // Wait longer between retries if it's a rate limit error
      const isRateLimit = error instanceof Error && 
        (error.message.includes('Rate limit') || error.message.includes('429'));
      
      if (isRateLimit) {
        const rateLimitDelay = attempt * 2000; // 2s, 4s, 6s...
        console.log(`Rate limit detected, waiting ${rateLimitDelay}ms before retry ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
      }
    }
  }
  
  return text; // Fallback
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

    // Process rows in batches with enhanced error handling
    const translatedRows: string[][] = [];
    const failedBatches: number[] = [];
    
    for (let i = 0; i < totalRows; i += batchSize) {
      const batch = csvRows.slice(i, i + batchSize);
      currentBatch++;
      
      // Progressive delay - increases with batch number to reduce rate limit issues
      const progressiveDelay = Math.min(1000 + (currentBatch * 200), 5000);
      if (currentBatch > 1) {
        console.log(`Applying progressive delay: ${progressiveDelay}ms before batch ${currentBatch}`);
        await new Promise(resolve => setTimeout(resolve, progressiveDelay));
      }
      
      sendEvent({
        type: 'progress',
        message: `Processing batch ${currentBatch} of ${totalBatches} (delay: ${progressiveDelay}ms)`,
        totalRows,
        processedRows,
        currentBatch,
        totalBatches,
      });

      try {
        // Send heartbeat before processing batch
        sendEvent({
          type: 'progress',
          message: `🔄 Starting batch ${currentBatch}/${totalBatches} (${batch.length} rows)...`,
          totalRows,
          processedRows,
          currentBatch,
          totalBatches,
        });
        
        // Process batch with timeout and error recovery
        const batchTimeout = 180000; // 3 minutes per batch
        const translatedBatch = await Promise.race([
          processBatchWithRecovery(batch, i, config, limit, sendEvent),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Batch ${currentBatch} timeout after ${batchTimeout}ms`)), batchTimeout)
          )
        ]) as string[][];
        
        translatedRows.push(...translatedBatch);
        processedRows += batch.length;

        // Send progress update
        sendEvent({
          type: 'progress',
          message: `✅ Completed batch ${currentBatch} of ${totalBatches} (${batch.length} rows)`,
          totalRows,
          processedRows,
          currentBatch,
          totalBatches,
        });
        
      } catch (error) {
        console.error(`Batch ${currentBatch} failed:`, error);
        failedBatches.push(currentBatch);
        
        // Add original rows as fallback for failed batch
        translatedRows.push(...batch);
        processedRows += batch.length;
        
        sendEvent({
          type: 'progress',
          message: `⚠️ Batch ${currentBatch} failed, using original text (${error instanceof Error ? error.message : 'Unknown error'})`,
          totalRows,
          processedRows,
          currentBatch,
          totalBatches,
        });
        
        // Continue processing other batches
        continue;
      }
    }
    
    // Report failed batches
    if (failedBatches.length > 0) {
      sendEvent({
        type: 'progress',
        message: `⚠️ ${failedBatches.length} batches failed: ${failedBatches.join(', ')}. Original text used for failed batches.`,
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
