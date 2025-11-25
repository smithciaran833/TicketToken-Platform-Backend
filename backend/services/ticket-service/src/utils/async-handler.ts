import { logger } from './logger';
const log = logger.child({ component: 'GlobalErrorHandler' });

/**
 * Setup global error handlers for uncaught exceptions and unhandled rejections
 */
export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    log.error('UNCAUGHT EXCEPTION', { error, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    log.error('UNHANDLED REJECTION', { reason, promise: String(promise) });
    process.exit(1);
  });
}
