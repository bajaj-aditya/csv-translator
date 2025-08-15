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
    // No artificial delay here - let Azure handle rate limiting
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
  sendEvent: (data: TranslationProgress) => void
): Promise<string[][]> {
  const results: string[][] = [];
  let failedRows = 0;
  
  // Process rows sequentially to avoid issues
  for (let rowIndex = 0; rowIndex < batch.length; rowIndex++) {
    const row = batch[rowIndex];
    const actualRowIndex = batchStartIndex + rowIndex;
    const rowStartTime = Date.now();
    
    try {
      const translatedRow: string[] = [];
      
      // Process each column according to mapping
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const columnMapping = config.columnMappings.find(
          (mapping) => mapping.columnIndex === colIndex
        );
        
        if (columnMapping && columnMapping.shouldTranslate && columnMapping.targetLanguage) {
          try {
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
              2 // max retries per cell - reduced for speed
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
      
      results.push(translatedRow);
      
    } catch (error) {
      console.error(`Error processing row ${actualRowIndex}:`, error);
      // Return original row on error
      results.push(row);
      failedRows++;
    }
    
    // Send progress update every 10 rows within batch
    if ((rowIndex + 1) % 10 === 0) {
      sendEvent({
        type: 'progress',
        message: `Processing row ${actualRowIndex + 1}...`,
      });
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
  maxRetries: number = 2
): Promise<string> {
  if (!text || text.trim() === '') return text;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Minimal delay to speed up processing
      if (attempt > 1) {
        const delay = 500 * attempt; // 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      const result = await azureTranslator.translateText(text, toLang, fromLang);
      return result.translatedText;
      
    } catch (error) {
      if (attempt === maxRetries) {
        // Final attempt failed, return original text
        console.error(`Translation failed after ${maxRetries} attempts`);
        return text;
      }
      
      // Wait longer between retries if it's a rate limit error
      const isRateLimit = error instanceof Error && 
        (error.message.includes('Rate limit') || error.message.includes('429'));
      
      if (isRateLimit) {
        const rateLimitDelay = 3000; // Fixed 3s delay for rate limits
        console.log(`Rate limit detected, waiting ${rateLimitDelay}ms before retry`);
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

    // Set up batch processing - use the provided batch size directly
    const batchSize = config.batchSize || CSV_CONFIG.DEFAULT_BATCH_SIZE;
    
    const totalBatches = Math.ceil(totalRows / batchSize);
    let processedRows = 0;
    let currentBatch = 0;

    // Process rows in batches with enhanced error handling
    const translatedRows: string[][] = [];
    const failedBatches: number[] = [];
    
    for (let i = 0; i < totalRows; i += batchSize) {
      const batch = csvRows.slice(i, i + batchSize);
      currentBatch++;
      
      // Small delay between batches to avoid rate limiting
      if (currentBatch > 1) {
        const delay = 1000; // Fixed 1 second delay between batches
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      sendEvent({
        type: 'progress',
        message: `Processing batch ${currentBatch} of ${totalBatches}`,
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
        
        // Process batch without timeout to avoid interrupting valid processing
        const translatedBatch = await processBatchWithRecovery(batch, i, config, sendEvent);
        
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
