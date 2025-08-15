import { env } from './env';

/**
 * Azure Translator API Configuration
 */
interface AzureTranslatorConfig {
  apiKey: string;
  region: string;
  endpoint: string;
  maxRetries: number;
  initialRetryDelay: number;
  maxRetryDelay: number;
  batchCharacterLimit: number;
  requestTimeout: number;
}

/**
 * Translation request structure
 */
interface TranslationRequest {
  text: string;
}

/**
 * Translation response structure from Azure
 */
interface AzureTranslationResponse {
  translations: Array<{
    text: string;
    to: string;
  }>;
  detectedLanguage?: {
    language: string;
    score: number;
  };
}

/**
 * Batch translation response
 */
interface BatchTranslationResponse {
  translations: string[];
  batchInfo: {
    totalBatches: number;
    totalCharacters: number;
    averageProcessingTime: number;
  };
}

/**
 * Custom error classes for better error handling
 */
export class AzureTranslatorError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public errorCode?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AzureTranslatorError';
  }
}

export class RateLimitError extends AzureTranslatorError {
  constructor(retryAfter?: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class AuthenticationError extends AzureTranslatorError {
  constructor() {
    super('Authentication failed - invalid API key or region', 401, 'AUTHENTICATION_FAILED');
    this.name = 'AuthenticationError';
  }
}

export class QuotaExceededError extends AzureTranslatorError {
  constructor() {
    super('Translation quota exceeded', 403, 'QUOTA_EXCEEDED');
    this.name = 'QuotaExceededError';
  }
}

export class NetworkError extends AzureTranslatorError {
  constructor(message: string, cause?: Error) {
    super(message, undefined, 'NETWORK_ERROR', { cause });
    this.name = 'NetworkError';
  }
}

/**
 * Azure Translator API Client
 */
export class AzureTranslator {
  private config: AzureTranslatorConfig;

  constructor(config?: Partial<AzureTranslatorConfig>) {
    this.config = {
      apiKey: env.AZURE_TRANSLATOR_KEY,
      region: env.AZURE_TRANSLATOR_REGION,
      endpoint: env.AZURE_TRANSLATOR_ENDPOINT,
      maxRetries: 5, // More retries for better reliability
      initialRetryDelay: 2000, // 2 seconds
      maxRetryDelay: 60000, // 1 minute max
      batchCharacterLimit: 50000, // Azure's character limit per request
      requestTimeout: 45000, // 45 seconds
      ...config,
    };

    if (!this.config.apiKey || !this.config.region) {
      throw new Error('Azure Translator API key and region are required');
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoffDelay(attempt: number): number {
    const delay = this.config.initialRetryDelay * Math.pow(2, attempt);
    return Math.min(delay, this.config.maxRetryDelay);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Response) {
      // Retry on server errors and rate limits
      return error.status >= 500 || error.status === 429;
    }
    
    if (error instanceof Error) {
      // Retry on network errors
      return error.name === 'TypeError' || error.message.includes('fetch');
    }
    
    return false;
  }

  /**
   * Parse Azure API error response
   */
  private async parseErrorResponse(response: Response): Promise<never> {
    let errorDetails: { error?: { message?: string; code?: string }; message?: string };
    
    try {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        errorDetails = await response.json();
      } else {
        errorDetails = { message: await response.text() };
      }
    } catch {
      errorDetails = { message: 'Unknown error occurred' };
    }

    switch (response.status) {
      case 401:
        throw new AuthenticationError();
      case 403:
        throw new QuotaExceededError();
      case 429:
        const retryAfter = response.headers.get('retry-after');
        throw new RateLimitError(retryAfter ? parseInt(retryAfter) * 1000 : undefined);
      case 400:
        throw new AzureTranslatorError(
          `Bad request: ${errorDetails.error?.message || errorDetails.message || 'Invalid request'}`,
          400,
          'BAD_REQUEST',
          errorDetails
        );
      case 404:
        throw new AzureTranslatorError('Translation service not found', 404, 'NOT_FOUND');
      default:
        throw new AzureTranslatorError(
          `Azure Translator API error: ${errorDetails.error?.message || errorDetails.message || 'Unknown error'}`,
          response.status,
          errorDetails.error?.code || 'UNKNOWN_ERROR',
          errorDetails
        );
    }
  }

  /**
   * Make HTTP request to Azure Translator API with retry logic
   */
  private async makeRequest(
    endpoint: string,
    body: unknown,
    attempt: number = 0
  ): Promise<Response> {
    const url = `${this.config.endpoint}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.config.apiKey,
          'Ocp-Apim-Subscription-Region': this.config.region,
          'Content-Type': 'application/json',
          'X-ClientTraceId': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.parseErrorResponse(response);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Handle timeout errors
      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError('Request timeout', error);
      }

      // Handle network errors with retry logic
      if (this.isRetryableError(error) && attempt < this.config.maxRetries) {
        const delay = this.calculateBackoffDelay(attempt);
        console.warn(
          `Azure Translator API request failed (attempt ${attempt + 1}/${this.config.maxRetries + 1}), retrying in ${delay}ms:`,
          error
        );
        
        await this.sleep(delay);
        return this.makeRequest(endpoint, body, attempt + 1);
      }

      // Re-throw custom errors
      if (error instanceof AzureTranslatorError) {
        throw error;
      }

      // Wrap unknown errors
      throw new NetworkError(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Get available languages
   */
  async getAvailableLanguages(): Promise<Record<string, { name: string; nativeName: string; dir: string }>> {
    try {
      const response = await fetch(`${this.config.endpoint}/languages?api-version=3.0`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        await this.parseErrorResponse(response);
      }

      const data = await response.json();
      return data.translation || {};
    } catch (error) {
      if (error instanceof AzureTranslatorError) {
        throw error;
      }
      throw new NetworkError(`Failed to fetch available languages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect language of given text
   */
  async detectLanguage(text: string): Promise<{ language: string; score: number; isTranslationSupported: boolean; isTransliterationSupported: boolean }> {
    if (!text.trim()) {
      throw new AzureTranslatorError('Text cannot be empty for language detection', 400, 'EMPTY_TEXT');
    }

    try {
      const response = await this.makeRequest('/detect?api-version=3.0', [{ text }]);
      const data = await response.json();
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new AzureTranslatorError('Invalid response from language detection API', 500, 'INVALID_RESPONSE');
      }

      return data[0];
    } catch (error) {
      if (error instanceof AzureTranslatorError) {
        throw error;
      }
      throw new NetworkError(`Language detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Translate single text
   */
  async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<{ translatedText: string; detectedLanguage?: string; confidence?: number }> {
    if (!text.trim()) {
      throw new AzureTranslatorError('Text cannot be empty for translation', 400, 'EMPTY_TEXT');
    }

    if (!targetLanguage) {
      throw new AzureTranslatorError('Target language is required', 400, 'MISSING_TARGET_LANGUAGE');
    }

    // Check character limit
    if (text.length > this.config.batchCharacterLimit) {
      throw new AzureTranslatorError(
        `Text exceeds character limit of ${this.config.batchCharacterLimit}`,
        400,
        'TEXT_TOO_LONG'
      );
    }

    const endpoint = `/translate?api-version=3.0&to=${encodeURIComponent(targetLanguage)}${
      sourceLanguage ? `&from=${encodeURIComponent(sourceLanguage)}` : ''
    }`;

    try {
      const response = await this.makeRequest(endpoint, [{ text }]);
      const data: AzureTranslationResponse[] = await response.json();
      
      if (!data || !Array.isArray(data) || data.length === 0 || !data[0].translations?.length) {
        throw new AzureTranslatorError('Invalid response from translation API', 500, 'INVALID_RESPONSE');
      }

      const result = data[0];
      return {
        translatedText: result.translations[0].text,
        detectedLanguage: result.detectedLanguage?.language,
        confidence: result.detectedLanguage?.score,
      };
    } catch (error) {
      if (error instanceof AzureTranslatorError) {
        throw error;
      }
      throw new NetworkError(`Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Split texts into batches based on character limit
   */
  private createBatches(texts: string[]): string[][] {
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentCharacterCount = 0;

    for (const text of texts) {
      const textLength = text.length;
      
      // If single text exceeds limit, it goes in its own batch
      if (textLength > this.config.batchCharacterLimit) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentCharacterCount = 0;
        }
        batches.push([text]);
        continue;
      }

      // If adding this text would exceed the limit, start a new batch
      if (currentCharacterCount + textLength > this.config.batchCharacterLimit && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentCharacterCount = 0;
      }

      currentBatch.push(text);
      currentCharacterCount += textLength;
    }

    // Add the last batch if it has content
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Translate multiple texts with automatic batching
   */
  async translateBatch(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string
  ): Promise<BatchTranslationResponse> {
    if (!texts || texts.length === 0) {
      throw new AzureTranslatorError('Texts array cannot be empty', 400, 'EMPTY_TEXTS');
    }

    if (!targetLanguage) {
      throw new AzureTranslatorError('Target language is required', 400, 'MISSING_TARGET_LANGUAGE');
    }

    const startTime = Date.now();
    const batches = this.createBatches(texts);
    const allTranslations: string[] = [];
    const totalCharacters = texts.reduce((sum, text) => sum + text.length, 0);

    console.log(`Processing ${texts.length} texts in ${batches.length} batches (${totalCharacters} characters total)`);

    const endpoint = `/translate?api-version=3.0&to=${encodeURIComponent(targetLanguage)}${
      sourceLanguage ? `&from=${encodeURIComponent(sourceLanguage)}` : ''
    }`;

    try {
      // Process batches sequentially to avoid rate limiting
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchStartTime = Date.now();
        
        console.log(`Processing batch ${i + 1}/${batches.length} (${batch.length} texts)`);

        const requestBody = batch.map(text => ({ text }));
        const response = await this.makeRequest(endpoint, requestBody);
        const data: AzureTranslationResponse[] = await response.json();

        if (!data || !Array.isArray(data) || data.length !== batch.length) {
          throw new AzureTranslatorError(
            `Invalid response from translation API for batch ${i + 1}`,
            500,
            'INVALID_BATCH_RESPONSE'
          );
        }

        // Extract translations
        const batchTranslations = data.map((item) => {
          if (!item.translations || item.translations.length === 0) {
            throw new AzureTranslatorError(
              `Missing translation in response for batch ${i + 1}`,
              500,
              'MISSING_TRANSLATION'
            );
          }
          return item.translations[0].text;
        });

        allTranslations.push(...batchTranslations);

        const batchTime = Date.now() - batchStartTime;
        console.log(`Batch ${i + 1} completed in ${batchTime}ms`);

        // Add a small delay between batches to be respectful of rate limits
        if (i < batches.length - 1) {
          await this.sleep(100);
        }
      }

      const totalTime = Date.now() - startTime;
      console.log(`All batches completed in ${totalTime}ms`);

      return {
        translations: allTranslations,
        batchInfo: {
          totalBatches: batches.length,
          totalCharacters,
          averageProcessingTime: totalTime / texts.length,
        },
      };
    } catch (error) {
      if (error instanceof AzureTranslatorError) {
        throw error;
      }
      throw new NetworkError(`Batch translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get usage statistics (if available through Azure Metrics API)
   * Note: This would require additional Azure Management API setup
   */
  async getUsageStats(): Promise<{ charactersTranslated: number; requestsCount: number }> {
    // This is a placeholder implementation
    // In practice, you would need to integrate with Azure Monitor/Metrics API
    console.warn('Usage statistics require Azure Monitor API integration');
    return {
      charactersTranslated: 0,
      requestsCount: 0,
    };
  }

  /**
   * Test the API connection and configuration
   */
  async testConnection(): Promise<{ success: boolean; latency: number; region: string }> {
    const startTime = Date.now();
    
    try {
      await this.translateText('Hello', 'es');
      const latency = Date.now() - startTime;
      
      return {
        success: true,
        latency,
        region: this.config.region,
      };
    } catch (error) {
      throw new AzureTranslatorError(
        `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        undefined,
        'CONNECTION_TEST_FAILED',
        error
      );
    }
  }
}

/**
 * Default Azure Translator instance
 */
export const azureTranslator = new AzureTranslator();

/**
 * Convenience functions
 */
export const translateText = (text: string, targetLanguage: string, sourceLanguage?: string) => 
  azureTranslator.translateText(text, targetLanguage, sourceLanguage);

export const translateBatch = (texts: string[], targetLanguage: string, sourceLanguage?: string) => 
  azureTranslator.translateBatch(texts, targetLanguage, sourceLanguage);

export const detectLanguage = (text: string) => 
  azureTranslator.detectLanguage(text);

export const getAvailableLanguages = () => 
  azureTranslator.getAvailableLanguages();
