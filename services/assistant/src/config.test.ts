/**
 * Tests for environment configuration validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateConfig } from './config';

describe('validateConfig', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: any;
  let consoleErrorSpy: any;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Mock process.exit
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit: ${code}`);
    }) as any);
    
    // Mock console.error to suppress test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  
  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    
    // Restore mocks
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
  
  it('should validate successfully with all required variables', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    
    const config = validateConfig();
    
    expect(config).toBeDefined();
    expect(config.openrouterApiKey).toBe('test-key');
    expect(config.supabaseUrl).toBe('https://example.supabase.co');
    expect(config.supabaseSecretKey).toBe('test-secret');
    expect(exitSpy).not.toHaveBeenCalled();
  });
  
  it('should set defaults for optional variables', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    
    // Delete optional variables to test defaults
    delete process.env.OPENROUTER_MODEL;
    delete process.env.PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.NODE_ENV;
    delete process.env.APP_URL;
    
    const config = validateConfig();
    
    expect(config.openrouterModel).toBe('anthropic/claude-3.5-sonnet');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.nodeEnv).toBe('development');
    expect(config.appUrl).toBe('http://localhost:3000');
  });
  
  it('should use custom values for optional variables when provided', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    process.env.OPENROUTER_MODEL = 'custom/model';
    process.env.PORT = '8080';
    process.env.LOG_LEVEL = 'debug';
    process.env.NODE_ENV = 'production';
    process.env.APP_URL = 'https://app.example.com';
    
    const config = validateConfig();
    
    expect(config.openrouterModel).toBe('custom/model');
    expect(config.port).toBe(8080);
    expect(config.logLevel).toBe('debug');
    expect(config.nodeEnv).toBe('production');
    expect(config.appUrl).toBe('https://app.example.com');
  });
  
  it('should exit with code 1 when OPENROUTER_API_KEY is missing', () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    
    expect(() => validateConfig()).toThrow('process.exit: 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
  
  it('should exit with code 1 when SUPABASE_URL is missing', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    delete process.env.SUPABASE_URL;
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    
    expect(() => validateConfig()).toThrow('process.exit: 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  
  it('should exit with code 1 when SUPABASE_SECRET_KEY is missing', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SECRET_KEY;
    
    expect(() => validateConfig()).toThrow('process.exit: 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  
  it('should accept http:// URLs for local development', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    
    const config = validateConfig();
    
    expect(config.supabaseUrl).toBe('http://127.0.0.1:54321');
    expect(exitSpy).not.toHaveBeenCalled();
  });
  
  it('should exit with code 1 when SUPABASE_URL has invalid format', () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.SUPABASE_URL = 'invalid-url';
    process.env.SUPABASE_SECRET_KEY = 'test-secret';
    
    expect(() => validateConfig()).toThrow('process.exit: 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
  
  it('should report all missing variables at once', () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    
    expect(() => validateConfig()).toThrow('process.exit: 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
    
    // Check that all three errors were reported
    const errorCalls = consoleErrorSpy.mock.calls.flat().join(' ');
    expect(errorCalls).toContain('OPENROUTER_API_KEY');
    expect(errorCalls).toContain('SUPABASE_URL');
    expect(errorCalls).toContain('SUPABASE_SECRET_KEY');
  });
});
