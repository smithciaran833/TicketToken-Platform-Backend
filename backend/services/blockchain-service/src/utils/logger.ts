import winston from 'winston';

const isProduction = process.env.NODE_ENV === 'production';
const SERVICE_NAME = process.env.SERVICE_NAME || 'blockchain-service';

// Custom format for development
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}] ${message} ${metaStr}`;
  })
);

// Production format (structured JSON)
const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: isProduction ? prodFormat : devFormat,
  defaultMeta: { 
    service: SERVICE_NAME,
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error', 'warn']
    })
  ],
  exitOnError: false
});

// Add request ID to logger context
export const createLoggerWithContext = (requestId?: string) => {
  return logger.child({ requestId });
};
