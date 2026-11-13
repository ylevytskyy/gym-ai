/**
 * Service entry point: validate config, build the app with real dependencies, listen.
 * Requirements: 12.4, 12.5
 */

import { validateConfig } from './config.js';
import { logger } from './logger.js';
import { authenticateRequest } from './api/auth.js';
import { createApp } from './api/server.js';
import { OpenRouterAssistant } from './providers/openrouter.js';
import {
  addInjuries,
  archivePlans,
  deleteAccount,
  finishAiUse,
  getActivePlan,
  getMessages,
  getProfile,
  reserveAiUse,
  saveMessages,
  savePlan,
} from './tools/database.js';
import { getHealthSummary } from './tools/health.js';

const config = validateConfig(); // exits with code 1 if required variables are missing

const app = createApp({
  assistant: new OpenRouterAssistant({ apiKey: config.openrouterApiKey, model: config.openrouterModel }),
  authenticate: (req) => authenticateRequest(req),
  loadProfile: (userId) => getProfile(userId),
  storePlan: (userId, plan, provider) => savePlan(userId, plan, provider),
  loadHealthSummary: (userId) => getHealthSummary(userId),
  loadActivePlan: (userId) => getActivePlan(userId),
  loadMessages: (userId, limit) => getMessages(userId, limit),
  storeMessages: (userId, message, reply) => saveMessages(userId, message, reply),
  addInjuries: (userId, injuries) => addInjuries(userId, injuries),
  archivePlans: (userId) => archivePlans(userId),
  deleteAccount: (userId) => deleteAccount(userId),
  reserveUse: (userId, action, requestId) => reserveAiUse(userId, action, requestId),
  finishUse: (useId, ok) => finishAiUse(useId, ok),
});

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, environment: config.nodeEnv }, 'AI service started');
});

const SHUTDOWN_GRACE_MS = 10_000;

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  // Do not hang forever on open keep-alive connections.
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
