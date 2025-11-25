import { cleanEnv, str, url, port, num } from 'envalid';

// Base config that all services need
export const baseEnv = cleanEnv(process.env, {
  NODE_ENV: str({ default: 'development', choices: ['development', 'test', 'production'] }),
  PORT: port({ default: 3000 }),
  SERVICE_NAME: str({ default: 'unknown-service' }),
  JWT_SECRET: str({ default: 'this-is-a-very-long-secret-key-that-is-at-least-32-characters' }),
});

// Database config - supports both URL and granular
export const getDatabaseConfig = () => {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };
};

// Redis config - supports both URL and granular
export const getRedisConfig = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  return {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
  };
};

// RabbitMQ config
export const getRabbitMQConfig = () => {
  return process.env.AMQP_URL || process.env.RABBITMQ_URL || 'amqp://admin:admin@rabbitmq:5672';
};

// MongoDB config
export const getMongoDBConfig = () => {
  return (
    process.env.MONGODB_URI || process.env.MONGODB_URL || 'mongodb://mongodb:27017/tickettoken'
  );
};
