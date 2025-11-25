export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3010', 10),
  serviceName: process.env.SERVICE_NAME || 'analytics-service',
  database: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '6432', 10),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
    },
  },
  analyticsDatabase: {
    host: process.env.ANALYTICS_DB_HOST || 'pgbouncer',
    port: parseInt(process.env.ANALYTICS_DB_PORT || '6432', 10),
    database: process.env.ANALYTICS_DB_NAME || 'tickettoken_db',
    user: process.env.ANALYTICS_DB_USER || 'postgres',
    password: process.env.ANALYTICS_DB_PASSWORD || 'postgres',
  },
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '7', 10),
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://mongodb:27017/tickettoken_analytics',
    user: process.env.MONGODB_USER || '',
    password: process.env.MONGODB_PASSWORD || 'postgres',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672',
    exchange: process.env.RABBITMQ_EXCHANGE || 'tickettoken_events',
    queue: process.env.RABBITMQ_QUEUE || 'analytics_events',
  },
  // NEW: InfluxDB configuration
  influxdb: {
    url: process.env.INFLUXDB_URL || 'http://influxdb:8086',
    token: process.env.INFLUXDB_TOKEN || 'my-super-secret-auth-token',
    org: process.env.INFLUXDB_ORG || 'tickettoken',
    bucket: process.env.INFLUXDB_BUCKET || 'metrics',
  },
  // NEW: Metrics backend feature flag
  metrics: {
    backend: (process.env.METRICS_BACKEND || 'postgres') as 'postgres' | 'influxdb' | 'dual',
    // When in dual mode, continue on error from secondary backend
    failSilently: process.env.METRICS_FAIL_SILENTLY !== 'false',
  },
  websocket: {
    port: parseInt(process.env.WEBSOCKET_PORT || '3008', 10),
    path: process.env.WEBSOCKET_PATH || '/analytics/realtime',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    venue: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    event: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
    ticket: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3004',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3005',
    marketplace: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006',
  },
  ml: {
    modelPath: process.env.ML_MODEL_PATH || '/app/models',
    trainingEnabled: process.env.ML_TRAINING_ENABLED === 'true',
    updateInterval: parseInt(process.env.ML_UPDATE_INTERVAL || '86400', 10),
  },
  export: {
    tempPath: process.env.EXPORT_TEMP_PATH || '/tmp/exports',
    s3Bucket: process.env.EXPORT_S3_BUCKET || 'tickettoken-exports',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  monitoring: {
    enabled: process.env.ENABLE_METRICS === 'true',
    port: parseInt(process.env.METRICS_PORT || '9090', 10),
  },
  privacy: {
    customerHashSalt: process.env.CUSTOMER_HASH_SALT || 'default-salt-change-this',
    dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
  },
};
