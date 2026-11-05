/**
 * Environment configuration validation for AI assistant service
 * 
 * This module validates required environment variables at startup and exports
 * typed configuration for use throughout the service.
 */

export interface Config {
  // Required variables
  openrouterApiKey: string;
  supabaseUrl: string;
  supabaseSecretKey: string;
  
  // Optional variables with defaults
  openrouterModel: string;
  port: number;
  logLevel: string;
  nodeEnv: string;
  appUrl: string;
}

/**
 * Validates that all required environment variables are present and properly formatted.
 * Exits with code 1 if validation fails.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */
export function validateConfig(): Config {
  const errors: string[] = [];
  
  // Check required variables
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) {
    errors.push('OPENROUTER_API_KEY is required but not set');
  }
  
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    errors.push('SUPABASE_URL is required but not set');
  } else if (!supabaseUrl.startsWith('https://') && !supabaseUrl.startsWith('http://')) {
    // Allow http:// for local development, but validate format
    errors.push('SUPABASE_URL must start with https:// (or http:// for local development)');
  }
  
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseSecretKey) {
    errors.push('SUPABASE_SECRET_KEY is required but not set');
  }
  
  // If there are errors, log them and exit
  if (errors.length > 0) {
    console.error('❌ Environment configuration validation failed:\n');
    errors.forEach(error => {
      console.error(`  • ${error}`);
    });
    console.error('\nPlease check your .env file and ensure all required variables are set.');
    console.error('See .env.example for reference.\n');
    process.exit(1);
  }
  
  // Return validated config with defaults for optional variables
  return {
    openrouterApiKey: openrouterApiKey!,
    supabaseUrl: supabaseUrl!,
    supabaseSecretKey: supabaseSecretKey!,
    openrouterModel: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet',
    port: parseInt(process.env.PORT || '3000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
    appUrl: process.env.APP_URL || 'http://localhost:3000',
  };
}

/**
 * Get the validated configuration.
 * Must call validateConfig() first during startup.
 */
let configCache: Config | null = null;

export function getConfig(): Config {
  if (!configCache) {
    configCache = validateConfig();
  }
  return configCache;
}
