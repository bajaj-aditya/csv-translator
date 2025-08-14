import { z } from 'zod';

const envSchema = z.object({
  AZURE_TRANSLATOR_KEY: z.string().min(1, 'Azure Translator API key is required'),
  AZURE_TRANSLATOR_REGION: z.string().min(1, 'Azure Translator region is required'),
  AZURE_TRANSLATOR_ENDPOINT: z.string().url('Azure Translator endpoint must be a valid URL').optional().default('https://api.cognitive.microsofttranslator.com'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function validateEnv(): EnvConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
      );
      throw new Error(
        `❌ Invalid environment variables:\n${errorMessages.join('\n')}`
      );
    }
    throw error;
  }
}

export const env = validateEnv();

export default env;
