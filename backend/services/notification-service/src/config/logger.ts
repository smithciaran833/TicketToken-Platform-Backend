import winston from 'winston';
import { env } from './env';

const logLevel = env.NODE_ENV === 'production' ? 'info' : 'debug';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: env.SERVICE_NAME },
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'production'
        ? logFormat
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
    }),
  ],
});

export const createLogger = (component: string) => {
  return logger.child({ component });
};
