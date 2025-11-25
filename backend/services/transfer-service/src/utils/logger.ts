import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  prettyPrint: process.env.NODE_ENV === 'development' ? {
    colorize: true,
    translateTime: true
  } : false,
  base: {
    service: 'transfer-service'
  }
});

export default logger;
