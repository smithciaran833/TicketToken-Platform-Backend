export const config = {
  service: {
    name: process.env.SERVICE_NAME || 'queue-service',
    port: parseInt(process.env.PORT || '3008', 10),
    env: process.env.NODE_ENV || 'development'
  },
  database: {
    url: process.env.DATABASE_URL || ''
  },
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD
  }
};
