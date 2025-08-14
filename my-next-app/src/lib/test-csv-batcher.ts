// Test file to demonstrate CSV processing and batching functionality
// This is for testing purposes and should not be included in production

import { 
  CSVReader, 
  CSVWriter, 
  parseCSV, 
  toCSV, 
  detectCSVFormat, 
  validateCSV, 
  transformCSV,
  chunkCSV
} from './csv';

import { 
  TextBatcher, 
  StreamingBatcher, 
  batchCSVRows, 
  batchForAI 
} from './batcher';

// Test CSV data
const testCSVData = `Name,Age,City,Country
John Doe,30,New York,USA
Jane Smith,25,London,UK
Bob Johnson,35,Toronto,Canada
Alice Brown,28,Sydney,Australia`;

const testCSVWithBOM = '\uFEFF' + testCSVData;

const testCSVSemicolon = `Name;Age;City;Country
John Doe;30;New York;USA
Jane Smith;25;London;UK`;

async function testCSVProcessing() {
  console.log('=== CSV Processing Tests ===\n');
  
  // Test 1: Basic CSV parsing
  console.log('1. Basic CSV Parsing:');
  const parsed = await parseCSV(testCSVData);
  console.log('Parsed records:', parsed.length);
  console.log('First record:', parsed[0]);
  console.log('');
  
  // Test 2: Format detection
  console.log('2. Format Detection:');
  const format = detectCSVFormat(testCSVData);
  console.log('Detected format:', format);
  console.log('');
  
  const formatWithBOM = detectCSVFormat(Buffer.from(testCSVWithBOM, 'utf8'));
  console.log('Format with BOM:', formatWithBOM);
  console.log('');
  
  const formatSemicolon = detectCSVFormat(testCSVSemicolon);
  console.log('Semicolon format:', formatSemicolon);
  console.log('');
  
  // Test 3: CSV validation
  console.log('3. CSV Validation:');
  const validation = await validateCSV(testCSVData, {
    requiredColumns: ['Name', 'Age'],
    allowEmptyFields: false
  });
  console.log('Validation result:', {
    isValid: validation.isValid,
    errors: validation.errors,
    stats: validation.stats
  });
  console.log('');
  
  // Test 4: CSV transformation
  console.log('4. CSV Transformation (add ID column):');
  const transformed = await transformCSV(
    testCSVData,
    (record, index) => ({
      ID: index + 1,
      ...record,
      Age: parseInt(record.Age) + 1 // Increment age by 1
    })
  );
  console.log('Transformed CSV preview:', transformed.substring(0, 200) + '...');
  console.log('');
  
  // Test 5: CSV chunking
  console.log('5. CSV Chunking (2 records per chunk):');
  const chunks = await chunkCSV(testCSVData, 2);
  console.log('Number of chunks:', chunks.length);
  console.log('First chunk:', chunks[0]);
  console.log('');
  
  // Test 6: Streaming CSV reader
  console.log('6. Streaming CSV Reader:');
  const reader = new CSVReader();
  let recordCount = 0;
  await reader.parseWithCallback(testCSVData, async (record, index) => {
    recordCount++;
    if (index < 2) {
      console.log(`Record ${index}:`, record);
    }
  });
  console.log(`Total records processed: ${recordCount}`);
  console.log('');
  
  // Test 7: CSV Writer with format preservation
  console.log('7. CSV Writer with Format Preservation:');
  const writer = new CSVWriter({}, format);
  const outputCSV = await writer.stringify(parsed);
  console.log('Output CSV matches format:', format.delimiter === ',');
  console.log('');
}

async function testBatching() {
  console.log('=== Text Batching Tests ===\n');
  
  // Test 1: Basic text batching
  console.log('1. Basic Text Batching:');
  const batcher = new TextBatcher<string>({
    maxCharacters: 50,
    maxItems: 3
  });
  
  const lines = [
    'This is line one',
    'This is line two',
    'This is line three',
    'This is line four',
    'This is line five'
  ];
  
  const batches = batcher.batchItems(lines);
  console.log('Number of batches:', batches.length);
  batches.forEach((batch, index) => {
    console.log(`Batch ${index}:`, batch.batch);
    console.log(`  - Characters: ${batch.info.characterCount}`);
    console.log(`  - Items: ${batch.info.itemCount}`);
  });
  console.log('Stats:', batcher.getStats());
  console.log('');
  
  // Test 2: CSV rows batching
  console.log('2. CSV Rows Batching:');
  const csvRows = [
    ['Name', 'Age', 'City'],
    ['John', '30', 'New York'],
    ['Jane', '25', 'London'],
    ['Bob', '35', 'Toronto'],
    ['Alice', '28', 'Sydney']
  ];
  
  const csvBatches = batchCSVRows(csvRows, {
    maxItems: 2,
    maxCharacters: 100
  });
  
  console.log('CSV batches:', csvBatches.length);
  csvBatches.forEach((batch, index) => {
    console.log(`CSV Batch ${index}:`, batch.batch);
  });
  console.log('');
  
  // Test 3: Smart text batching
  console.log('3. Smart Text Batching:');
  const longText = `This is a paragraph.
  
  This is another paragraph with multiple sentences. It has more content than the first one.
  
  And this is a third paragraph. It also contains multiple sentences. This should demonstrate how smart batching works.`;
  
  const smartBatcher = new TextBatcher<string>({
    maxCharacters: 100
  });
  
  const smartBatches = smartBatcher.smartBatch(longText);
  console.log('Smart batches:', smartBatches.length);
  smartBatches.forEach((batch, index) => {
    console.log(`Smart Batch ${index}:`, batch.batch.slice(0, 2));
    console.log(`  - Characters: ${batch.info.characterCount}`);
  });
  console.log('');
  
  // Test 4: AI batching with token estimation
  console.log('4. AI Batching with Token Estimation:');
  const tokenEstimator = (text: string) => Math.ceil(text.length / 4);
  
  const aiBatches = batchForAI(
    longText,
    tokenEstimator,
    25, // Max 25 tokens per batch
    { maxCharacters: 200 }
  );
  
  console.log('AI batches:', aiBatches.length);
  aiBatches.forEach((batch, index) => {
    console.log(`AI Batch ${index}:`, batch.info.tokenCount, 'tokens');
  });
  console.log('');
  
  // Test 5: Streaming batcher
  console.log('5. Streaming Batcher:');
  const processedBatches: string[] = [];
  
  const streamingBatcher = new StreamingBatcher<string>(
    async (batch) => {
      processedBatches.push(`Batch ${batch.info.index}: ${batch.info.itemCount} items`);
    },
    { maxItems: 2 }
  );
  
  // Add items in chunks
  await streamingBatcher.add(['item1', 'item2']);
  await streamingBatcher.add(['item3', 'item4', 'item5']);
  await streamingBatcher.complete();
  
  console.log('Processed streaming batches:', processedBatches);
  console.log('Buffer size:', streamingBatcher.getBufferSize());
  console.log('');
}

// Export test functions for potential use
export async function runTests() {
  try {
    await testCSVProcessing();
    await testBatching();
    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}
