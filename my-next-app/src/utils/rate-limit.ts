import pLimit from 'p-limit';

export interface RateLimitConfig {
  concurrency: number;
  delay?: number;
}

export class RateLimiter {
  private limit: ReturnType<typeof pLimit>;
  private delay: number;

  constructor(config: RateLimitConfig) {
    this.limit = pLimit(config.concurrency);
    this.delay = config.delay || 0;
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return this.limit(async () => {
      if (this.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delay));
      }
      return fn();
    });
  }

  /**
   * Execute multiple functions with rate limiting
   */
  async executeAll<T>(functions: (() => Promise<T>)[]): Promise<T[]> {
    return Promise.all(functions.map(fn => this.execute(fn)));
  }

  /**
   * Execute functions in batches with rate limiting
   */
  async executeBatch<T>(
    items: any[], 
    processor: (item: any) => Promise<T>,
    batchSize?: number
  ): Promise<T[]> {
    const actualBatchSize = batchSize || this.limit.concurrency;
    const results: T[] = [];
    
    for (let i = 0; i < items.length; i += actualBatchSize) {
      const batch = items.slice(i, i + actualBatchSize);
      const batchPromises = batch.map(item => this.execute(() => processor(item)));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Get current pending count
   */
  get pendingCount(): number {
    return this.limit.pendingCount;
  }

  /**
   * Get current active count
   */
  get activeCount(): number {
    return this.limit.activeCount;
  }

  /**
   * Clear all pending operations
   */
  clearQueue(): void {
    this.limit.clearQueue();
  }
}

/**
 * Create a rate limiter for translation operations
 * Azure Translator has rate limits, so this helps manage concurrent requests
 */
export const createTranslationRateLimiter = (
  requestsPerSecond: number = 10,
  burstSize: number = 20
): RateLimiter => {
  return new RateLimiter({
    concurrency: burstSize,
    delay: 1000 / requestsPerSecond
  });
};

/**
 * Create a rate limiter for file operations
 */
export const createFileOperationRateLimiter = (
  concurrency: number = 5
): RateLimiter => {
  return new RateLimiter({
    concurrency,
    delay: 100 // Small delay to prevent overwhelming the system
  });
};

/**
 * Default rate limiters for common use cases
 */
export const defaultRateLimiters = {
  translation: createTranslationRateLimiter(),
  fileOperations: createFileOperationRateLimiter(),
  general: new RateLimiter({ concurrency: 10, delay: 50 })
};
