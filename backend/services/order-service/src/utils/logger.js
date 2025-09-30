const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  } : undefined,
  base: {
    service: 'order-service'
  },
  timestamp: pino.stdTimeFunctions.isoTime
});

module.exports = logger;
