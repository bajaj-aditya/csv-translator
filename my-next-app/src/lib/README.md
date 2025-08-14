# CSV Processing and Text Batching Utilities

This library provides comprehensive CSV processing utilities and safe text batching functionality for server-side operations.

## Features

### CSV Processing (`csv.ts`)

#### Core Features
- **Streaming CSV Reader**: Memory-efficient processing of large CSV files
- **Format-Preserving Writer**: Maintains original CSV formatting (BOM, quotes, delimiters)
- **Automatic Format Detection**: Detects CSV format characteristics from samples
- **Encoding Support**: Proper handling of different text encodings
- **Validation**: Comprehensive CSV structure and content validation
- **Transformation**: Transform CSV data while preserving format
- **Chunking**: Split large CSV files into manageable chunks

#### Key Classes

##### `CSVReader`
Streaming CSV reader with proper encoding handling.

```typescript
import { CSVReader } from './csv';

const reader = new CSVReader({
  delimiter: ',',
  encoding: 'utf8',
  bom: true,
  columns: true, // Parse headers
  skipEmptyLines: true
});

// Parse entire file (use with caution for large files)
const records = await reader.parseToArray(csvData);

// Stream processing with callback
await reader.parseWithCallback(csvData, async (record, index) => {
  console.log(`Processing record ${index}:`, record);
});

// Parse with automatic format detection
const parser = reader.parseWithDetection(csvData);
```

##### `CSVWriter`
Format-preserving CSV writer.

```typescript
import { CSVWriter, detectCSVFormat } from './csv';

// Preserve original format
const format = detectCSVFormat(originalCsv);
const writer = new CSVWriter({}, format);

// Convert records to CSV string
const csvString = await writer.stringify(records);

// Create buffer with proper encoding
const buffer = await writer.createBuffer(records, 'utf8');

// Stream to writable stream
await writer.streamTo(records, process.stdout);
```

#### Utility Functions

##### Format Detection
```typescript
import { detectCSVFormat } from './csv';

const format = detectCSVFormat(csvSample);
console.log(format);
// {
//   delimiter: ',',
//   quote: '"',
//   escape: '"',
//   hasBOM: false,
//   lineEnding: '\n',
//   encoding: 'utf8'
// }
```

##### Validation
```typescript
import { validateCSV } from './csv';

const validation = await validateCSV(csvData, {
  requiredColumns: ['Name', 'Email'],
  allowEmptyFields: false,
  maxRecords: 1000
});

if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
}
```

##### Transformation
```typescript
import { transformCSV } from './csv';

// Transform records while preserving format
const transformed = await transformCSV(
  csvData,
  (record, index) => ({
    ...record,
    ID: index + 1,
    ProcessedAt: new Date().toISOString()
  })
);
```

##### Chunking
```typescript
import { chunkCSV } from './csv';

// Split large CSV into smaller chunks
const chunks = await chunkCSV(largeCsvData, 100); // 100 records per chunk
```

### Text Batching (`batcher.ts`)

#### Core Features
- **Safe Character Limits**: Prevent memory overflow with configurable limits
- **Multiple Limit Types**: Character count, byte size, item count, token count
- **Smart Batching**: Maintains readability by splitting at natural boundaries
- **Overlap Support**: Include overlapping content between batches
- **Streaming Batching**: Memory-efficient processing of large datasets
- **Token Estimation**: Built-in token counting for AI model limits

#### Key Classes

##### `TextBatcher<T>`
Generic text batcher with configurable limits.

```typescript
import { TextBatcher } from './batcher';

const batcher = new TextBatcher<string>({
  maxCharacters: 100000,    // 100KB character limit
  maxBytes: 1024 * 1024,    // 1MB byte limit
  maxItems: 1000,           // Maximum items per batch
  maxTokens: 4000,          // Token limit for AI models
  encoding: 'utf8',
  preserveRecordBoundaries: true,
  overlap: 2                // Include 2 items overlap
});

// Batch array of items
const batches = batcher.batchItems(items);

// Smart text batching
const textBatches = batcher.smartBatch(longText);

// Specialized batching methods
const lineBatches = batcher.batchLines(text);
const sentenceBatches = batcher.batchSentences(text);
const paragraphBatches = batcher.batchParagraphs(text);
const wordBatches = batcher.batchWords(text);
```

##### `StreamingBatcher<T>`
Memory-efficient streaming batcher.

```typescript
import { StreamingBatcher } from './batcher';

const streamingBatcher = new StreamingBatcher<string>(
  async (batch) => {
    console.log(`Processing batch ${batch.info.index}: ${batch.info.itemCount} items`);
    // Process batch here
  },
  { maxItems: 100 }
);

// Add items progressively
await streamingBatcher.add(moreItems);
await streamingBatcher.add(evenMoreItems);

// Flush remaining items
await streamingBatcher.complete();
```

#### Convenience Functions

##### CSV Row Batching
```typescript
import { batchCSVRows } from './batcher';

const csvBatches = batchCSVRows(rows, {
  maxCharacters: 50000,
  maxItems: 500
});
```

##### AI Model Batching
```typescript
import { batchForAI } from './batcher';

const tokenEstimator = (text: string) => Math.ceil(text.length / 4);

const aiBatches = batchForAI(
  longText,
  tokenEstimator,
  4000, // Max tokens per batch
  { preserveRecordBoundaries: true }
);
```

##### JSON Object Batching
```typescript
import { batchJSONObjects } from './batcher';

const objectBatches = batchJSONObjects(objects, {
  maxCharacters: 100000,
  maxItems: 100
});
```

## Usage Examples

### Processing Large CSV Files
```typescript
import { CSVReader, TextBatcher } from './lib';

async function processLargeCSV(csvData: Buffer) {
  const reader = new CSVReader({
    highWaterMark: 64 * 1024, // 64KB chunks
    encoding: 'utf8'
  });
  
  const batcher = new TextBatcher<any>({
    maxItems: 100,
    maxCharacters: 50000
  });
  
  const records: any[] = [];
  
  await reader.parseWithCallback(csvData, async (record, index) => {
    records.push(record);
    
    // Process in batches
    if (records.length >= 100) {
      const batches = batcher.batchItems(records);
      for (const batch of batches) {
        await processBatch(batch.batch);
      }
      records.length = 0; // Clear array
    }
  });
  
  // Process remaining records
  if (records.length > 0) {
    const batches = batcher.batchItems(records);
    for (const batch of batches) {
      await processBatch(batch.batch);
    }
  }
}
```

### CSV Translation with Format Preservation
```typescript
import { detectCSVFormat, CSVReader, CSVWriter } from './lib';

async function translateCSV(csvData: string, translateFunction: (text: string) => Promise<string>) {
  // Detect and preserve original format
  const format = detectCSVFormat(csvData);
  
  const reader = new CSVReader();
  const records = await reader.parseToArray(csvData);
  
  // Translate records
  const translatedRecords = await Promise.all(
    records.map(async (record) => {
      const translated: any = {};
      for (const [key, value] of Object.entries(record)) {
        translated[key] = await translateFunction(value as string);
      }
      return translated;
    })
  );
  
  // Write back with preserved format
  const writer = new CSVWriter({}, format);
  return await writer.stringify(translatedRecords);
}
```

### Streaming Text Processing
```typescript
import { StreamingBatcher, batchForAI } from './lib';

async function processTextStream(textStream: AsyncIterable<string>) {
  const streamingBatcher = new StreamingBatcher<string>(
    async (batch) => {
      // Process each batch with AI
      const combinedText = batch.batch.join('\n');
      const result = await aiProcessingFunction(combinedText);
      console.log(`Processed batch ${batch.info.index}:`, result.length, 'characters');
    },
    {
      maxCharacters: 4000,
      maxTokens: 1000,
      estimateTokens: (text) => Math.ceil(text.length / 4)
    }
  );
  
  for await (const chunk of textStream) {
    await streamingBatcher.add([chunk]);
  }
  
  await streamingBatcher.complete();
}
```

## Performance Considerations

### Memory Management
- Use streaming readers for large files
- Configure appropriate `highWaterMark` values
- Use `StreamingBatcher` for continuous processing
- Clear arrays after processing batches

### Encoding Handling
- Specify correct encoding for input data
- Handle BOM detection properly
- Use appropriate byte limits for multibyte encodings

### Batch Size Optimization
- Balance batch size with processing efficiency
- Consider memory constraints of downstream processors
- Use token estimation for AI model limits
- Enable record boundary preservation for data integrity

## Error Handling

Both utilities include comprehensive error handling:

```typescript
try {
  const validation = await validateCSV(csvData, options);
  if (!validation.isValid) {
    console.error('CSV validation failed:', validation.errors);
    // Handle validation errors
  }
  
  const batches = batcher.batchItems(data);
  // Process batches
} catch (error) {
  console.error('Processing error:', error.message);
  // Handle processing errors
}
```

## Dependencies

- `csv-parse`: Server-side CSV parsing
- `csv-stringify`: CSV string generation
- Node.js streams and built-in modules

## License

This utility library is part of the CSV Translation application and follows the same license terms.
