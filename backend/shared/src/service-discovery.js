// Service discovery with Docker DNS fallback
const getServiceHost = (serviceName) => {
  // In Docker, use service names; locally use localhost
  return process.env.NODE_ENV === 'production' || process.env.DOCKER_ENV
    ? serviceName
    : 'localhost';
};

const getServiceUrl = (serviceName, port) => {
  const envVar = `${serviceName.toUpperCase().replace(/-/g, '_')}_URL`;
  return process.env[envVar] || `http://${getServiceHost(serviceName)}:${port}`;
};

const getDbHost = () => process.env.DB_HOST || getServiceHost('postgres');
const getRedisHost = () => process.env.REDIS_HOST || getServiceHost('redis');
const getRabbitHost = () => process.env.RABBITMQ_HOST || getServiceHost('rabbitmq');

module.exports = {
  getServiceHost,
  getServiceUrl,
  getDbHost,
  getRedisHost,
  getRabbitHost,
  
  // Predefined service URLs
  services: {
    auth: () => getServiceUrl('auth-service', 3001),
    venue: () => getServiceUrl('venue-service', 3002),
    event: () => getServiceUrl('event-service', 3003),
    ticket: () => getServiceUrl('ticket-service', 3004),
    payment: () => getServiceUrl('payment-service', 3005),
    marketplace: () => getServiceUrl('marketplace-service', 3006),
    analytics: () => getServiceUrl('analytics-service', 3007),
    notification: () => getServiceUrl('notification-service', 3008),
  }
};
