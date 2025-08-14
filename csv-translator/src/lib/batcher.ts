export interface BatcherOptions {
  maxCharacters?: number;
  maxBytes?: number;
  maxItems?: number;
  encoding?: BufferEncoding;
  preserveRecordBoundaries?: boolean;
  overlap?: number;
  estimateTokens?: (text: string) => number;
  maxTokens?: number;
}

export interface BatchInfo {
  index: number;
  characterCount: number;
  byteCount: number;
  itemCount: number;
  tokenCount?: number;
  hasOverflow: boolean;
  originalIndices: number[];
}

export interface BatchResult<T = string> {
  batch: T[];
  info: BatchInfo;
}

export interface BatchingStats {
  totalBatches: number;
  totalItems: number;
  totalCharacters: number;
  totalBytes: number;
  averageBatchSize: number;
  largestBatch: number;
  smallestBatch: number;
  overflowBatches: number;
}

/**
 * Safe text batcher with configurable limits
 */
export class TextBatcher<T = string> {
  private options: Required<BatcherOptions>;
  private stats: BatchingStats;
  
  constructor(options: BatcherOptions = {}) {
    this.options = {
      maxCharacters: options.maxCharacters ?? 100000, // 100KB chars
      maxBytes: options.maxBytes ?? 1024 * 1024, // 1MB
      maxItems: options.maxItems ?? 1000,
      encoding: options.encoding ?? 'utf8',
      preserveRecordBoundaries: options.preserveRecordBoundaries ?? true,
      overlap: options.overlap ?? 0,
      estimateTokens: options.estimateTokens ?? this.defaultTokenEstimator,
      maxTokens: options.maxTokens ?? Infinity,
    };
    
    this.stats = this.initializeStats();
  }
  
  private initializeStats(): BatchingStats {
    return {
      totalBatches: 0,
      totalItems: 0,
      totalCharacters: 0,
      totalBytes: 0,
      averageBatchSize: 0,
      largestBatch: 0,
      smallestBatch: Infinity,
      overflowBatches: 0,
    };
  }
  
  /**
   * Default token estimator (roughly 4 chars per token)
   */
  private defaultTokenEstimator(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  /**
   * Calculate byte size of text with specified encoding
   */
  private getByteSize(text: string): number {
    return Buffer.from(text, this.options.encoding).length;
  }
  
  /**
   * Convert items to string format for processing
   */
  private itemToString(item: T): string {
    if (typeof item === 'string') {
      return item;
    }
    if (typeof item === 'object' && item !== null) {
      return JSON.stringify(item);
    }
    return String(item);
  }
  
  /**
   * Check if adding an item would exceed any limits
   */
  private wouldExceedLimits(
    currentChars: number,
    currentBytes: number,
    currentItems: number,
    currentTokens: number,
    itemText: string,
    itemBytes: number,
    itemTokens: number
  ): boolean {
    return (
      currentChars + itemText.length > this.options.maxCharacters ||
      currentBytes + itemBytes > this.options.maxBytes ||
      currentItems + 1 > this.options.maxItems ||
      currentTokens + itemTokens > this.options.maxTokens
    );
  }
  
  /**
   * Create batches from an array of items
   */
  batchItems(items: T[]): BatchResult<T>[] {
    if (items.length === 0) {
      return [];
    }
    
    const results: BatchResult<T>[] = [];
    let currentBatch: T[] = [];
    let currentChars = 0;
    let currentBytes = 0;
    let currentTokens = 0;
    let batchIndex = 0;
    let overlapItems: T[] = [];
    let overlapChars = 0;
    let overlapBytes = 0;
    let overlapTokens = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemText = this.itemToString(item);
      const itemBytes = this.getByteSize(itemText);
      const itemTokens = this.options.estimateTokens(itemText);
      
      // Check if single item exceeds limits
      if (
        itemText.length > this.options.maxCharacters ||
        itemBytes > this.options.maxBytes ||
        itemTokens > this.options.maxTokens
      ) {
        // Handle oversized items
        if (this.options.preserveRecordBoundaries) {
          // Create a separate batch for this oversized item
          if (currentBatch.length > 0) {
            results.push(this.createBatchResult(currentBatch, batchIndex++, true));
            this.updateStats(currentBatch, currentChars, currentBytes);
          }
          
          results.push(this.createBatchResult([item], batchIndex++, true));
          this.updateStats([item], itemText.length, itemBytes);
          
          // Reset current batch
          currentBatch = [...overlapItems];
          currentChars = overlapChars;
          currentBytes = overlapBytes;
          currentTokens = overlapTokens;
          continue;
        } else {
          // Split the oversized item if possible
          const splitItems = this.splitOversizedItem(item, itemText);
          for (const splitItem of splitItems) {
            const splitText = this.itemToString(splitItem);
            const splitBytes = this.getByteSize(splitText);
            const splitTokens = this.options.estimateTokens(splitText);
            
            if (this.wouldExceedLimits(
              currentChars, currentBytes, currentBatch.length, currentTokens,
              splitText, splitBytes, splitTokens
            )) {
              if (currentBatch.length > 0) {
                results.push(this.createBatchResult(currentBatch, batchIndex++));
                this.updateStats(currentBatch, currentChars, currentBytes);
              }
              
              currentBatch = [...overlapItems, splitItem];
              currentChars = overlapChars + splitText.length;
              currentBytes = overlapBytes + splitBytes;
              currentTokens = overlapTokens + splitTokens;
            } else {
              currentBatch.push(splitItem);
              currentChars += splitText.length;
              currentBytes += splitBytes;
              currentTokens += splitTokens;
            }
          }
          continue;
        }
      }
      
      // Check if adding this item would exceed limits
      if (this.wouldExceedLimits(
        currentChars, currentBytes, currentBatch.length, currentTokens,
        itemText, itemBytes, itemTokens
      )) {
        // Finalize current batch
        if (currentBatch.length > 0) {
          results.push(this.createBatchResult(currentBatch, batchIndex++));
          this.updateStats(currentBatch, currentChars, currentBytes);
        }
        
        // Start new batch with overlap
        overlapItems = this.calculateOverlap(currentBatch);
        overlapChars = overlapItems.reduce((sum, item) => 
          sum + this.itemToString(item).length, 0);
        overlapBytes = overlapItems.reduce((sum, item) => 
          sum + this.getByteSize(this.itemToString(item)), 0);
        overlapTokens = overlapItems.reduce((sum, item) => 
          sum + this.options.estimateTokens(this.itemToString(item)), 0);
        
        currentBatch = [...overlapItems, item];
        currentChars = overlapChars + itemText.length;
        currentBytes = overlapBytes + itemBytes;
        currentTokens = overlapTokens + itemTokens;
      } else {
        // Add item to current batch
        currentBatch.push(item);
        currentChars += itemText.length;
        currentBytes += itemBytes;
        currentTokens += itemTokens;
      }
    }
    
    // Add final batch if not empty
    if (currentBatch.length > 0) {
      results.push(this.createBatchResult(currentBatch, batchIndex));
      this.updateStats(currentBatch, currentChars, currentBytes);
    }
    
    // Finalize stats
    this.finalizeStats(results);
    
    return results;
  }
  
  /**
   * Split an oversized item into smaller parts
   */
  private splitOversizedItem(item: T, itemText: string): T[] {
    if (typeof item !== 'string') {
      // For non-string items, we can't meaningfully split them
      return [item];
    }
    
    const maxChars = Math.min(
      this.options.maxCharacters,
      Math.floor(this.options.maxBytes / 4) // Assume worst-case 4 bytes per char
    );
    
    const parts: T[] = [];
    let remaining = itemText;
    
    while (remaining.length > 0) {
      let chunkSize = Math.min(maxChars, remaining.length);
      
      // Try to split at word boundaries
      if (chunkSize < remaining.length) {
        const lastSpace = remaining.lastIndexOf(' ', chunkSize);
        const lastNewline = remaining.lastIndexOf('\n', chunkSize);
        const bestBreak = Math.max(lastSpace, lastNewline);
        
        if (bestBreak > chunkSize * 0.8) { // Only use break if it's not too far back
          chunkSize = bestBreak + 1;
        }
      }
      
      parts.push(remaining.substring(0, chunkSize) as T);
      remaining = remaining.substring(chunkSize);
    }
    
    return parts;
  }
  
  /**
   * Calculate overlap items for the next batch
   */
  private calculateOverlap(currentBatch: T[]): T[] {
    if (this.options.overlap <= 0 || currentBatch.length === 0) {
      return [];
    }
    
    const overlapCount = Math.min(this.options.overlap, currentBatch.length);
    return currentBatch.slice(-overlapCount);
  }
  
  /**
   * Create a batch result object
   */
  private createBatchResult(
    batch: T[],
    index: number,
    hasOverflow: boolean = false
  ): BatchResult<T> {
    const batchText = batch.map(item => this.itemToString(item)).join('');
    const characterCount = batchText.length;
    const byteCount = this.getByteSize(batchText);
    const tokenCount = this.options.estimateTokens(batchText);
    
    return {
      batch,
      info: {
        index,
        characterCount,
        byteCount,
        itemCount: batch.length,
        tokenCount,
        hasOverflow,
        originalIndices: [], // Would need to track this during batching if needed
      },
    };
  }
  
  /**
   * Update running statistics
   */
  private updateStats(batch: T[], chars: number, bytes: number): void {
    this.stats.totalBatches++;
    this.stats.totalItems += batch.length;
    this.stats.totalCharacters += chars;
    this.stats.totalBytes += bytes;
    
    if (batch.length > this.stats.largestBatch) {
      this.stats.largestBatch = batch.length;
    }
    if (batch.length < this.stats.smallestBatch) {
      this.stats.smallestBatch = batch.length;
    }
  }
  
  /**
   * Finalize statistics calculation
   */
  private finalizeStats(results: BatchResult<T>[]): void {
    this.stats.averageBatchSize = this.stats.totalBatches > 0 
      ? this.stats.totalItems / this.stats.totalBatches 
      : 0;
    this.stats.overflowBatches = results.filter(r => r.info.hasOverflow).length;
    
    if (this.stats.smallestBatch === Infinity) {
      this.stats.smallestBatch = 0;
    }
  }
  
  /**
   * Get current batching statistics
   */
  getStats(): BatchingStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = this.initializeStats();
  }
  
  /**
   * Batch text by lines with size limits
   */
  batchLines(text: string, delimiter: string = '\n'): BatchResult<string>[] {
    const lines = text.split(delimiter);
    return this.batchItems(lines as T[]) as BatchResult<string>[];
  }
  
  /**
   * Batch text by sentences with size limits
   */
  batchSentences(text: string): BatchResult<string>[] {
    // Simple sentence splitting - could be enhanced with proper NLP
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .filter(sentence => sentence.trim().length > 0);
    
    return this.batchItems(sentences as T[]) as BatchResult<string>[];
  }
  
  /**
   * Batch text by paragraphs with size limits
   */
  batchParagraphs(text: string): BatchResult<string>[] {
    const paragraphs = text
      .split(/\n\s*\n/)
      .filter(paragraph => paragraph.trim().length > 0);
    
    return this.batchItems(paragraphs as T[]) as BatchResult<string>[];
  }
  
  /**
   * Batch text by words with size limits
   */
  batchWords(text: string): BatchResult<string>[] {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    return this.batchItems(words as T[]) as BatchResult<string>[];
  }
  
  /**
   * Smart text batching that tries to maintain readability
   */
  smartBatch(text: string): BatchResult<string>[] {
    // Try paragraphs first
    let batches = this.batchParagraphs(text);
    
    // If any batch has overflow, try sentences
    if (batches.some(b => b.info.hasOverflow)) {
      batches = this.batchSentences(text);
    }
    
    // If still overflow, try lines
    if (batches.some(b => b.info.hasOverflow)) {
      batches = this.batchLines(text);
    }
    
    // Last resort: word-level batching
    if (batches.some(b => b.info.hasOverflow)) {
      batches = this.batchWords(text);
    }
    
    return batches;
  }
}

/**
 * Convenience functions for common batching scenarios
 */

/**
 * Batch CSV rows with character limits
 */
export function batchCSVRows(
  rows: string[][],
  options: BatcherOptions = {}
): BatchResult<string[]>[] {
  const batcher = new TextBatcher<string[]>(options);
  return batcher.batchItems(rows);
}

/**
 * Batch JSON objects with size limits
 */
export function batchJSONObjects(
  objects: Record<string, unknown>[],
  options: BatcherOptions = {}
): BatchResult<Record<string, unknown>>[] {
  const batcher = new TextBatcher<Record<string, unknown>>(options);
  return batcher.batchItems(objects);
}

/**
 * Batch text with token counting for AI models
 */
export function batchForAI(
  text: string,
  tokenEstimator: (text: string) => number,
  maxTokens: number = 4000,
  options: Partial<BatcherOptions> = {}
): BatchResult<string>[] {
  const batcher = new TextBatcher<string>({
    maxTokens,
    estimateTokens: tokenEstimator,
    preserveRecordBoundaries: true,
    ...options,
  });
  
  return batcher.smartBatch(text);
}

/**
 * Create a memory-efficient streaming batcher
 */
export class StreamingBatcher<T> {
  private batcher: TextBatcher<T>;
  private buffer: T[] = [];
  private callback: (batch: BatchResult<T>) => void | Promise<void>;
  private flushOnComplete: boolean;
  
  constructor(
    callback: (batch: BatchResult<T>) => void | Promise<void>,
    options: BatcherOptions = {},
    flushOnComplete: boolean = true
  ) {
    this.batcher = new TextBatcher<T>(options);
    this.callback = callback;
    this.flushOnComplete = flushOnComplete;
  }
  
  /**
   * Add items to the streaming batcher
   */
  async add(items: T[]): Promise<void> {
    this.buffer.push(...items);
    
    // Try to create complete batches
    const batches = this.batcher.batchItems(this.buffer);
    
    if (batches.length > 1) {
      // Process all but the last batch (which might be incomplete)
      for (let i = 0; i < batches.length - 1; i++) {
        await this.callback(batches[i]);
      }
      
      // Keep the last batch items in buffer for next iteration
      const lastBatch = batches[batches.length - 1];
      this.buffer = lastBatch.batch;
    }
  }
  
  /**
   * Flush remaining items in buffer
   */
  async flush(): Promise<void> {
    if (this.buffer.length > 0) {
      const batches = this.batcher.batchItems(this.buffer);
      for (const batch of batches) {
        await this.callback(batch);
      }
      this.buffer = [];
    }
  }
  
  /**
   * Complete streaming and flush if configured
   */
  async complete(): Promise<void> {
    if (this.flushOnComplete) {
      await this.flush();
    }
  }
  
  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }
  
  /**
   * Get batching statistics
   */
  getStats(): BatchingStats {
    return this.batcher.getStats();
  }
}
