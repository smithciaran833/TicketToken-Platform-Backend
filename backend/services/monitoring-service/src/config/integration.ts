// Integration points for other TicketToken services
export const INTEGRATION_CONFIG = {
  // Marketplace service integration
  marketplace: {
    url: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006',
    endpoints: {
      ticketSales: '/api/v1/tickets/sales',
      fraudCheck: '/api/v1/users/verify',
    }
  },

  // Other services to monitor
  services: {
    marketplace: process.env.MARKETPLACE_SERVICE_URL || 'http://marketplace-service:3006',
    auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    blockchain: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3011',
    venue: process.env.VENUE_SERVICE_URL || 'http://venue-service:3002',
    event: process.env.EVENT_SERVICE_URL || 'http://event-service:3003',
    ticket: process.env.TICKET_SERVICE_URL || 'http://ticket-service:3004',
    payment: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3006',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3010',
    analytics: process.env.ANALYTICS_SERVICE_URL || 'http://analytics-service:3016',
  },

  // Shared Kafka topics
  kafkaTopics: {
    // Monitoring service owns these
    monitoring: ['metrics-stream', 'fraud-events', 'alerts-stream'],
    // Subscribe to these from other services
    marketplace: ['ticket-sales', 'user-activity'],
    blockchain: ['chain-events', 'smart-contract-calls'],
  },

  // Shared databases
  databases: {
    postgres: {
      host: process.env.DB_HOST || 'postgres',
      port: 5432,
      database: 'postgres', // Shared main DB
    },
    redis: {
      host: process.env.REDIS_HOST || 'redis',
      port: 6379, // Shared cache
    }
  }
};
