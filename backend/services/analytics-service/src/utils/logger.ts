import pino from 'pino';
import { config } from '../config';

/**
 * Pino Logger
 * 
 * All code in this service uses pino-style logging:
 *   logger.info({ meta }, 'message')
 * 
 * This replaces the previous winston logger to match the codebase conventions.
 */

export const logger = pino({
  name: 'analytics-service',
  level: config.env === 'production' ? 'info' : 'debug',
  transport: config.env === 'development' 
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        }
      }
    : undefined,
  base: {
    service: 'analytics-service',
  },
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
});

// Create child loggers for specific components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

export default logger;
