// Centralized Redis configuration
const getRedisConfig = () => {
  // Use Docker service name when in container, localhost for local dev
  const host = process.env.REDIS_HOST || (process.env.NODE_ENV === 'production' ? 'redis' : 'localhost');
  const port = parseInt(process.env.REDIS_PORT || '6379');
  
  return {
    host,
    port,
    password: process.env.REDIS_PASSWORD, // Never hardcode passwords!
    url: process.env.REDIS_URL || `redis://${host}:${port}`
  };
};

module.exports = { getRedisConfig };
