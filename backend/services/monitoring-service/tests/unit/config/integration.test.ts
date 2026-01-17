describe('Integration Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    // Clear integration-related env vars
    delete process.env.MARKETPLACE_SERVICE_URL;
    delete process.env.AUTH_SERVICE_URL;
    delete process.env.BLOCKCHAIN_SERVICE_URL;
    delete process.env.VENUE_SERVICE_URL;
    delete process.env.EVENT_SERVICE_URL;
    delete process.env.TICKET_SERVICE_URL;
    delete process.env.PAYMENT_SERVICE_URL;
    delete process.env.NOTIFICATION_SERVICE_URL;
    delete process.env.ANALYTICS_SERVICE_URL;
    delete process.env.DB_HOST;
    delete process.env.REDIS_HOST;

    jest.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Marketplace Integration', () => {
    it('should have default marketplace service URL', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace.url).toBe('http://marketplace-service:3006');
    });

    it('should use environment variable for marketplace service URL', () => {
      process.env.MARKETPLACE_SERVICE_URL = 'http://custom-marketplace:8080';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace.url).toBe('http://custom-marketplace:8080');
    });

    it('should have ticketSales endpoint configured', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace.endpoints.ticketSales).toBe('/api/v1/tickets/sales');
    });

    it('should have fraudCheck endpoint configured', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace.endpoints.fraudCheck).toBe('/api/v1/users/verify');
    });

    it('should have both marketplace endpoints', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace.endpoints).toHaveProperty('ticketSales');
      expect(INTEGRATION_CONFIG.marketplace.endpoints).toHaveProperty('fraudCheck');
      expect(Object.keys(INTEGRATION_CONFIG.marketplace.endpoints)).toHaveLength(2);
    });
  });

  describe('Services Configuration', () => {
    it('should have all default service URLs', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services).toEqual({
        marketplace: 'http://marketplace-service:3006',
        auth: 'http://auth-service:3001',
        blockchain: 'http://blockchain-service:3011',
        venue: 'http://venue-service:3002',
        event: 'http://event-service:3003',
        ticket: 'http://ticket-service:3004',
        payment: 'http://payment-service:3006',
        notification: 'http://notification-service:3010',
        analytics: 'http://analytics-service:3016',
      });
    });

    it('should use environment variable for auth service', () => {
      process.env.AUTH_SERVICE_URL = 'http://custom-auth:4001';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.auth).toBe('http://custom-auth:4001');
    });

    it('should use environment variable for blockchain service', () => {
      process.env.BLOCKCHAIN_SERVICE_URL = 'http://custom-blockchain:4011';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.blockchain).toBe('http://custom-blockchain:4011');
    });

    it('should use environment variable for venue service', () => {
      process.env.VENUE_SERVICE_URL = 'http://custom-venue:4002';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.venue).toBe('http://custom-venue:4002');
    });

    it('should use environment variable for event service', () => {
      process.env.EVENT_SERVICE_URL = 'http://custom-event:4003';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.event).toBe('http://custom-event:4003');
    });

    it('should use environment variable for ticket service', () => {
      process.env.TICKET_SERVICE_URL = 'http://custom-ticket:4004';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.ticket).toBe('http://custom-ticket:4004');
    });

    it('should use environment variable for payment service', () => {
      process.env.PAYMENT_SERVICE_URL = 'http://custom-payment:4006';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.payment).toBe('http://custom-payment:4006');
    });

    it('should use environment variable for notification service', () => {
      process.env.NOTIFICATION_SERVICE_URL = 'http://custom-notification:4010';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.notification).toBe('http://custom-notification:4010');
    });

    it('should use environment variable for analytics service', () => {
      process.env.ANALYTICS_SERVICE_URL = 'http://custom-analytics:4016';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.analytics).toBe('http://custom-analytics:4016');
    });

    it('should use multiple custom service URLs simultaneously', () => {
      process.env.AUTH_SERVICE_URL = 'http://custom-auth:4001';
      process.env.VENUE_SERVICE_URL = 'http://custom-venue:4002';
      process.env.ANALYTICS_SERVICE_URL = 'http://custom-analytics:4016';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.auth).toBe('http://custom-auth:4001');
      expect(INTEGRATION_CONFIG.services.venue).toBe('http://custom-venue:4002');
      expect(INTEGRATION_CONFIG.services.analytics).toBe('http://custom-analytics:4016');
    });

    it('should have exactly 9 services configured', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(Object.keys(INTEGRATION_CONFIG.services)).toHaveLength(9);
    });
  });

  describe('Kafka Topics Configuration', () => {
    it('should have monitoring topics configured', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.kafkaTopics.monitoring).toEqual([
        'metrics-stream',
        'fraud-events',
        'alerts-stream',
      ]);
    });

    it('should have marketplace topics configured', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.kafkaTopics.marketplace).toEqual([
        'ticket-sales',
        'user-activity',
      ]);
    });

    it('should have blockchain topics configured', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.kafkaTopics.blockchain).toEqual([
        'chain-events',
        'smart-contract-calls',
      ]);
    });

    it('should have exactly 3 Kafka topic categories', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(Object.keys(INTEGRATION_CONFIG.kafkaTopics)).toHaveLength(3);
      expect(INTEGRATION_CONFIG.kafkaTopics).toHaveProperty('monitoring');
      expect(INTEGRATION_CONFIG.kafkaTopics).toHaveProperty('marketplace');
      expect(INTEGRATION_CONFIG.kafkaTopics).toHaveProperty('blockchain');
    });

    it('should have array of strings for each topic category', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(Array.isArray(INTEGRATION_CONFIG.kafkaTopics.monitoring)).toBe(true);
      expect(Array.isArray(INTEGRATION_CONFIG.kafkaTopics.marketplace)).toBe(true);
      expect(Array.isArray(INTEGRATION_CONFIG.kafkaTopics.blockchain)).toBe(true);

      INTEGRATION_CONFIG.kafkaTopics.monitoring.forEach((topic: any) => {
        expect(typeof topic).toBe('string');
      });
    });
  });

  describe('Databases Configuration', () => {
    it('should have default PostgreSQL configuration', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.postgres).toEqual({
        host: 'postgres',
        port: 5432,
        database: 'postgres',
      });
    });

    it('should use environment variable for PostgreSQL host', () => {
      process.env.DB_HOST = 'custom-postgres-host';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.postgres.host).toBe('custom-postgres-host');
    });

    it('should have default Redis configuration', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.redis).toEqual({
        host: 'redis',
        port: 6379,
      });
    });

    it('should use environment variable for Redis host', () => {
      process.env.REDIS_HOST = 'custom-redis-host';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.redis.host).toBe('custom-redis-host');
    });

    it('should have static port for PostgreSQL', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.postgres.port).toBe(5432);
    });

    it('should have static port for Redis', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.redis.port).toBe(6379);
    });

    it('should have static database name for PostgreSQL', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.postgres.database).toBe('postgres');
    });

    it('should have exactly 2 database configurations', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(Object.keys(INTEGRATION_CONFIG.databases)).toHaveLength(2);
      expect(INTEGRATION_CONFIG.databases).toHaveProperty('postgres');
      expect(INTEGRATION_CONFIG.databases).toHaveProperty('redis');
    });
  });

  describe('Configuration Structure', () => {
    it('should export INTEGRATION_CONFIG', () => {
      const module = require('../../../src/config/integration');

      expect(module).toHaveProperty('INTEGRATION_CONFIG');
    });

    it('should have all top-level configuration sections', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG).toHaveProperty('marketplace');
      expect(INTEGRATION_CONFIG).toHaveProperty('services');
      expect(INTEGRATION_CONFIG).toHaveProperty('kafkaTopics');
      expect(INTEGRATION_CONFIG).toHaveProperty('databases');
    });

    it('should have exactly 4 top-level sections', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(Object.keys(INTEGRATION_CONFIG)).toHaveLength(4);
    });

    it('should have marketplace section with url and endpoints', () => {
      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace).toHaveProperty('url');
      expect(INTEGRATION_CONFIG.marketplace).toHaveProperty('endpoints');
      expect(typeof INTEGRATION_CONFIG.marketplace.url).toBe('string');
      expect(typeof INTEGRATION_CONFIG.marketplace.endpoints).toBe('object');
    });
  });

  describe('URL Format Validation', () => {
    it('should handle URLs with trailing slashes', () => {
      process.env.MARKETPLACE_SERVICE_URL = 'http://marketplace:3006/';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace.url).toBe('http://marketplace:3006/');
    });

    it('should handle URLs with custom ports', () => {
      process.env.AUTH_SERVICE_URL = 'http://auth-service:8080';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.auth).toBe('http://auth-service:8080');
    });

    it('should handle HTTPS URLs', () => {
      process.env.VENUE_SERVICE_URL = 'https://venue-service:443';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.venue).toBe('https://venue-service:443');
    });

    it('should handle localhost URLs', () => {
      process.env.EVENT_SERVICE_URL = 'http://localhost:3003';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.event).toBe('http://localhost:3003');
    });

    it('should handle IP address URLs', () => {
      process.env.TICKET_SERVICE_URL = 'http://192.168.1.100:3004';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.services.ticket).toBe('http://192.168.1.100:3004');
    });
  });

  describe('Empty Environment Variables', () => {
    it('should use default when env var is empty string', () => {
      process.env.MARKETPLACE_SERVICE_URL = '';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.marketplace.url).toBe('http://marketplace-service:3006');
    });

    it('should use default when DB_HOST is empty string', () => {
      process.env.DB_HOST = '';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.postgres.host).toBe('postgres');
    });

    it('should use default when REDIS_HOST is empty string', () => {
      process.env.REDIS_HOST = '';

      const { INTEGRATION_CONFIG } = require('../../../src/config/integration');

      expect(INTEGRATION_CONFIG.databases.redis.host).toBe('redis');
    });
  });
});
