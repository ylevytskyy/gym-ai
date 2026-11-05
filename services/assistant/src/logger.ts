/**
 * Structured logging configuration using Pino
 * 
 * This module provides a configured Pino logger instance with:
 * - Log level from LOG_LEVEL environment variable (default: info)
 * - Redaction of sensitive fields (authorization, api_key, secret, token)
 * - Custom serializers for errors
 * - Base context including service name and environment
 * 
 * Requirements: 17.1, 17.2, 17.9, 17.10
 */

import { pino } from 'pino';

/**
 * Get log level from environment, default to 'info'
 * Valid levels: trace, debug, info, warn, error, fatal
 */
const logLevel = process.env.LOG_LEVEL || 'info';

/**
 * Get environment (development, production, test)
 */
const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Create and configure the Pino logger instance
 */
export const logger = pino({
  // Log level from environment variable
  level: logLevel,
  
  // Base context included in all log entries
  base: {
    service: 'aura-fit-assistant',
    environment: nodeEnv,
  },
  
  // Redact sensitive fields to prevent leaking secrets in logs
  // These paths will be replaced with '[Redacted]'
  redact: {
    paths: [
      // HTTP headers
      'req.headers.authorization',
      'req.headers.Authorization',
      'request.headers.authorization',
      'request.headers.Authorization',
      
      // API keys and secrets
      'api_key',
      'apiKey',
      'API_KEY',
      'secret',
      'SECRET',
      'token',
      'TOKEN',
      'access_token',
      'accessToken',
      'refresh_token',
      'refreshToken',
      
      // Supabase specific
      'supabase_key',
      'supabaseKey',
      'anon_key',
      'anonKey',
      
      // OpenRouter specific
      'openrouter_key',
      'openrouterKey',
      'OPENROUTER_API_KEY',
      
      // Common patterns in nested objects
      '*.api_key',
      '*.apiKey',
      '*.secret',
      '*.token',
      '*.authorization',
      '*.password',
      '*.PASSWORD',
    ],
    // Mark redacted values clearly
    censor: '[Redacted]',
  },
  
  // Custom serializers for better error logging
  serializers: {
    // Error serializer - includes stack trace and cause
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
    
    // Request serializer (if using with Express/HTTP)
    req: pino.stdSerializers.req,
    
    // Response serializer
    res: pino.stdSerializers.res,
  },
  
  // Format timestamps as ISO 8601
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Create a child logger with additional context
 * 
 * @example
 * const reqLogger = createChildLogger({ requestId: 'abc-123' });
 * reqLogger.info('Processing request');
 */
export function createChildLogger(bindings: Record<string, any>) {
  return logger.child(bindings);
}

/**
 * Log level type for type safety
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Check if a log level is enabled
 */
export function isLevelEnabled(level: LogLevel): boolean {
  return logger.isLevelEnabled(level);
}
