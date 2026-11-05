/**
 * Example usage of the logger module
 * 
 * Run with: npx tsx src/logger.example.ts
 * 
 * This demonstrates:
 * - Basic logging at different levels
 * - Sensitive data redaction
 * - Error serialization
 * - Child logger usage
 */

import { logger, createChildLogger } from './logger.js';

// Set log level for demo (remove in production)
process.env.LOG_LEVEL = 'debug';

console.log('=== Logger Examples ===\n');

// 1. Basic logging
console.log('1. Basic logging at different levels:');
logger.debug('This is a debug message');
logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message');

console.log('\n2. Logging with context:');
logger.info({ userId: '123', action: 'login' }, 'User action');

// 2. Sensitive data redaction
console.log('\n3. Sensitive data redaction:');
logger.info({
  api_key: 'sk-secret-should-be-redacted',
  token: 'bearer-token-should-be-redacted',
  user: 'visible-username',
}, 'API request with secrets (should be redacted)');

logger.info({
  req: {
    headers: {
      authorization: 'Bearer secret-token-should-be-redacted',
      'content-type': 'application/json',
    },
  },
}, 'Request headers (authorization should be redacted)');

// 3. Error serialization
console.log('\n4. Error serialization:');
const error = new Error('Something went wrong');
error.cause = new Error('Root cause error') as any;
logger.error({ err: error }, 'Error with stack trace');

// 4. Child logger
console.log('\n5. Child logger with additional context:');
const requestLogger = createChildLogger({ 
  requestId: 'req-abc-123',
  userId: 'user-456' 
});
requestLogger.info('Request started');
requestLogger.info({ duration: 123 }, 'Request completed');

// 5. Structured logging
console.log('\n6. Structured logging for business events:');
logger.info({
  event: 'plan_generated',
  planId: 'plan-789',
  provider: 'openrouter',
  duration_ms: 1523,
  validation: {
    schema_valid: true,
    safety_valid: true,
  },
}, 'Workout plan generated successfully');

console.log('\n=== End of examples ===');
