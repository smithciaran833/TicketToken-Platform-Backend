// Service URL configuration with environment variable support
// Uses Docker service names when running in containers, localhost for local dev

export const getServiceUrl = (envVar: string, dockerService: string, port: number): string => {
  return process.env[envVar] || `http://${dockerService}:${port}`;
};

export const serviceUrls = {
  auth:         getServiceUrl('AUTH_SERVICE_URL',         'auth-service',         3001),
  venue:        getServiceUrl('VENUE_SERVICE_URL',        'venue-service',        3002),
  event:        getServiceUrl('EVENT_SERVICE_URL',        'event-service',        3003),
  ticket:       getServiceUrl('TICKET_SERVICE_URL',       'ticket-service',       3004),
  payment:      getServiceUrl('PAYMENT_SERVICE_URL',      'payment-service',      3005),
  marketplace:  getServiceUrl('MARKETPLACE_SERVICE_URL',  'marketplace-service',  3006),
  analytics:    getServiceUrl('ANALYTICS_SERVICE_URL',    'analytics-service',    3007),
  notification: getServiceUrl('NOTIFICATION_SERVICE_URL', 'notification-service', 3008),
  integration:  getServiceUrl('INTEGRATION_SERVICE_URL',  'integration-service',  3009),
  compliance:   getServiceUrl('COMPLIANCE_SERVICE_URL',   'compliance-service',   3010),
  queue:        getServiceUrl('QUEUE_SERVICE_URL',        'queue-service',        3011),
  search:       getServiceUrl('SEARCH_SERVICE_URL',       'search-service',       3012),
  file:         getServiceUrl('FILE_SERVICE_URL',         'file-service',         3013),
  monitoring:   getServiceUrl('MONITORING_SERVICE_URL',   'monitoring-service',   3014),
  blockchain:   getServiceUrl('BLOCKCHAIN_SERVICE_URL',   'blockchain-service',   3015),
  order:        getServiceUrl('ORDER_SERVICE_URL',        'order-service',        3016),
  scanning:     getServiceUrl('SCANNING_SERVICE_URL',     'scanning-service',     3020),
  minting:      getServiceUrl('MINTING_SERVICE_URL',      'minting-service',      3018),
  transfer:     getServiceUrl('TRANSFER_SERVICE_URL',     'transfer-service',     3019),
};
