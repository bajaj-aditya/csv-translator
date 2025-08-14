// Application constants
export const APP_NAME = 'CSV Translator';
export const APP_VERSION = '1.0.0';

export const ROUTES = {
  HOME: '/',
  ABOUT: '/about',
  CONTACT: '/contact',
  TRANSLATOR: '/translator',
} as const;

export const API_ENDPOINTS = {
  USERS: '/api/users',
  AUTH: '/api/auth',
  TRANSLATE: '/api/translate',
  LANGUAGES: '/api/languages',
} as const;

// CSV Translator Constants - English and Indian Languages Focus
// Only includes languages supported by Azure Translator API
export const SUPPORTED_LANGUAGES = [
  // English (Primary)
  { code: 'en', name: 'English', nativeName: 'English' },
  
  // Major Indian Languages (Azure Translator Supported)
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
  { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' },
  { code: 'ne', name: 'Nepali', nativeName: 'नेपाली' },
  { code: 'si', name: 'Sinhala', nativeName: 'සිංහල' },
  
  // Additional South Asian Languages
  { code: 'my', name: 'Myanmar (Burmese)', nativeName: 'မြန်မာ' },
] as const;

export const CSV_CONFIG = {
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB - Increased for large files
  SUPPORTED_FORMATS: ['.csv', '.txt'],
  DEFAULT_BATCH_SIZE: 50, // Reduced for better progress tracking
  MAX_BATCH_SIZE: 200, // Reduced to prevent memory issues
  MIN_BATCH_SIZE: 1,
  DEFAULT_CONCURRENCY: 2, // Conservative for large files
  MAX_CONCURRENCY: 5, // Reduced to prevent rate limits
} as const;

export const TRANSLATION_LIMITS = {
  AZURE_MAX_TEXT_LENGTH: 50000, // Azure Translator character limit
  MAX_CONCURRENT_REQUESTS: 2, // Further reduced for large files
  REQUEST_TIMEOUT: 45000, // Increased timeout for large batches
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 2000, // Increased delay to prevent rate limits
} as const;
