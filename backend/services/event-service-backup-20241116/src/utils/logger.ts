import pino from 'pino';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FORMAT = process.env.LOG_FORMAT || (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');

// Create base logger
const logger = pino({
  level: LOG_LEVEL,
  transport: LOG_FORMAT === 'pretty' ? {
    target: 'pino-pretty',
    options: {
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  base: {
    service: 'event-service'
  }
});

export { logger };
