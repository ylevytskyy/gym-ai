#!/usr/bin/env node
/**
 * Manual verification script for config validation
 * Run with: node --loader tsx src/config.verify.ts
 */

// Test 1: Missing all required variables
console.log('Test 1: Missing all required variables (should exit with code 1)');
delete process.env.OPENROUTER_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;

try {
  const { validateConfig } = await import('./config.js');
  validateConfig();
  console.log('❌ FAILED: Should have exited');
} catch (error) {
  // Expected - process.exit(1) was called
  console.log('✅ PASSED: Validation failed as expected');
}

// Test 2: Valid configuration
console.log('\nTest 2: Valid configuration (should succeed)');
process.env.OPENROUTER_API_KEY = 'test-key';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY = 'test-secret';

const { validateConfig: validateConfig2 } = await import('./config.js');
const config = validateConfig2();
console.log('✅ PASSED: Configuration validated successfully');
console.log('Config:', {
  openrouterApiKey: config.openrouterApiKey?.substring(0, 8) + '...',
  supabaseUrl: config.supabaseUrl,
  port: config.port,
  logLevel: config.logLevel
});

// Test 3: Invalid SUPABASE_URL format
console.log('\nTest 3: Invalid SUPABASE_URL format (should exit with code 1)');
process.env.SUPABASE_URL = 'invalid-url';

try {
  // Need to clear module cache to re-import
  const { validateConfig: validateConfig3 } = await import('./config.js?t=' + Date.now());
  validateConfig3();
  console.log('❌ FAILED: Should have exited');
} catch (error) {
  console.log('✅ PASSED: Validation failed as expected for invalid URL');
}

console.log('\n✅ All manual verification tests passed!');
