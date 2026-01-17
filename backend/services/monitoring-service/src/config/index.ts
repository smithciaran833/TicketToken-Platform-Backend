import dotenv from 'dotenv';
import joi from 'joi';

// Only load .env file in non-test environments
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const envSchema = joi.object({
  NODE_ENV: joi.string().valid('development', 'production', 'test').default('development'),
  PORT: joi.number().default(3013),
  SERVICE_NAME: joi.string().default('monitoring-service'),

  // Database
  DB_HOST: joi.string().required(),
  DB_PORT: joi.number().default(5432),
  DB_NAME: joi.string().required(),
  DB_USER: joi.string().required(),
  DB_PASSWORD: joi.string().required(),

  // Redis
  REDIS_HOST: joi.string().default('redis'),
  REDIS_PORT: joi.number().default(6379),

  // MongoDB
  MONGODB_URI: joi.string().required(),

  // Elasticsearch
  ELASTICSEARCH_NODE: joi.string().required(),

  // InfluxDB
  INFLUXDB_URL: joi.string().required(),
  INFLUXDB_TOKEN: joi.string().required(),
  INFLUXDB_ORG: joi.string().required(),
  INFLUXDB_BUCKET: joi.string().required(),

  // Services
  AUTH_SERVICE_URL: joi.string().required(),
  VENUE_SERVICE_URL: joi.string().required(),
  EVENT_SERVICE_URL: joi.string().required(),
  TICKET_SERVICE_URL: joi.string().required(),
  PAYMENT_SERVICE_URL: joi.string().required(),
  MARKETPLACE_SERVICE_URL: joi.string().required(),
  ANALYTICS_SERVICE_URL: joi.string().required(),
  API_GATEWAY_URL: joi.string().required(),

  // Intervals
  HEALTH_CHECK_INTERVAL: joi.number().default(30),
  METRIC_COLLECTION_INTERVAL: joi.number().default(60),
  ALERT_EVALUATION_INTERVAL: joi.number().default(60),

  // Thresholds
  CPU_THRESHOLD: joi.number().default(80),
  MEMORY_THRESHOLD: joi.number().default(85),
  DISK_THRESHOLD: joi.number().default(90),
  ERROR_RATE_THRESHOLD: joi.number().default(5),
  RESPONSE_TIME_THRESHOLD_MS: joi.number().default(2000),

  // JWT
  JWT_SECRET: joi.string().required(),

  // Logging
  LOG_LEVEL: joi.string().default('info'),
}).unknown();

function createConfig() {
  const { error, value: envVars } = envSchema.validate(process.env);

  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }

  return {
    env: envVars.NODE_ENV,
    port: envVars.PORT,
    serviceName: envVars.SERVICE_NAME,

    database: {
      host: envVars.DB_HOST,
      port: envVars.DB_PORT,
      database: envVars.DB_NAME,
      user: envVars.DB_USER,
      password: envVars.DB_PASSWORD,
    },

    redis: {
      host: envVars.REDIS_HOST,
      port: envVars.REDIS_PORT,
    },

    mongodb: {
      uri: envVars.MONGODB_URI,
    },

    elasticsearch: {
      node: envVars.ELASTICSEARCH_NODE,
    },

    influxdb: {
      url: envVars.INFLUXDB_URL,
      token: envVars.INFLUXDB_TOKEN,
      org: envVars.INFLUXDB_ORG,
      bucket: envVars.INFLUXDB_BUCKET,
    },

    services: {
      auth: envVars.AUTH_SERVICE_URL,
      venue: envVars.VENUE_SERVICE_URL,
      event: envVars.EVENT_SERVICE_URL,
      ticket: envVars.TICKET_SERVICE_URL,
      payment: envVars.PAYMENT_SERVICE_URL,
      marketplace: envVars.MARKETPLACE_SERVICE_URL,
      analytics: envVars.ANALYTICS_SERVICE_URL,
      apiGateway: envVars.API_GATEWAY_URL,
    },

    intervals: {
      healthCheck: envVars.HEALTH_CHECK_INTERVAL * 1000,
      metricCollection: envVars.METRIC_COLLECTION_INTERVAL * 1000,
      alertEvaluation: envVars.ALERT_EVALUATION_INTERVAL * 1000,
    },

    thresholds: {
      cpu: envVars.CPU_THRESHOLD,
      memory: envVars.MEMORY_THRESHOLD,
      disk: envVars.DISK_THRESHOLD,
      errorRate: envVars.ERROR_RATE_THRESHOLD,
      responseTime: envVars.RESPONSE_TIME_THRESHOLD_MS,
    },

    jwt: {
      secret: envVars.JWT_SECRET,
    },

    logging: {
      level: envVars.LOG_LEVEL,
    },

    cors: {
      origin: envVars.NODE_ENV === 'production'
        ? ['https://tickettoken.com']
        : true,
    },
  };
}

export const config = createConfig();
