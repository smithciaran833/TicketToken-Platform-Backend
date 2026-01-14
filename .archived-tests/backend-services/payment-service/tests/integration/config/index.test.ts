/**
 * Config Index Integration Tests
 *
 * Tests the main configuration object including:
 * - Server config
 * - Database config
 * - Redis config
 * - Stripe, PayPal, Square, Plaid configs
 * - Blockchain config
 * - Services URLs
 * - JWT config
 */

import { config } from '../../../src/config/index';

describe('config/index', () => {
  // ==========================================================================
  // server
  // ==========================================================================
  describe('server', () => {
    it('should have port as number', () => {
      expect(typeof config.server.port).toBe('number');
      expect(config.server.port).toBeGreaterThan(0);
    });

    it('should have env as string', () => {
      expect(typeof config.server.env).toBe('string');
      expect(['development', 'test', 'production', 'staging']).toContain(config.server.env);
    });
  });

  // ==========================================================================
  // database
  // ==========================================================================
  describe('database', () => {
    it('should have url defined or undefined', () => {
      expect(config.database.url === undefined || typeof config.database.url === 'string').toBe(true);
    });

    it('should have host as string', () => {
      expect(typeof config.database.host).toBe('string');
      expect(config.database.host.length).toBeGreaterThan(0);
    });

    it('should have port as number', () => {
      expect(typeof config.database.port).toBe('number');
      expect(config.database.port).toBeGreaterThan(0);
    });

    it('should have name as string', () => {
      expect(typeof config.database.name).toBe('string');
    });

    it('should have user as string', () => {
      expect(typeof config.database.user).toBe('string');
    });

    it('should have password as string', () => {
      expect(typeof config.database.password).toBe('string');
    });
  });

  // ==========================================================================
  // redis
  // ==========================================================================
  describe('redis', () => {
    it('should have url defined or undefined', () => {
      expect(config.redis.url === undefined || typeof config.redis.url === 'string').toBe(true);
    });

    it('should have host as string', () => {
      expect(typeof config.redis.host).toBe('string');
      expect(config.redis.host.length).toBeGreaterThan(0);
    });

    it('should have port as number', () => {
      expect(typeof config.redis.port).toBe('number');
      expect(config.redis.port).toBeGreaterThan(0);
    });

    it('should have password defined or undefined', () => {
      expect(config.redis.password === undefined || typeof config.redis.password === 'string').toBe(true);
    });
  });

  // ==========================================================================
  // stripe
  // ==========================================================================
  describe('stripe', () => {
    it('should have secretKey as string', () => {
      expect(typeof config.stripe.secretKey).toBe('string');
    });

    it('should have publishableKey as string', () => {
      expect(typeof config.stripe.publishableKey).toBe('string');
    });

    it('should have webhookSecret as string', () => {
      expect(typeof config.stripe.webhookSecret).toBe('string');
    });
  });

  // ==========================================================================
  // paypal
  // ==========================================================================
  describe('paypal', () => {
    it('should have clientId as string', () => {
      expect(typeof config.paypal.clientId).toBe('string');
    });

    it('should have clientSecret as string', () => {
      expect(typeof config.paypal.clientSecret).toBe('string');
    });

    it('should have mode as sandbox or production', () => {
      expect(['sandbox', 'production']).toContain(config.paypal.mode);
    });
  });

  // ==========================================================================
  // square
  // ==========================================================================
  describe('square', () => {
    it('should have accessToken as string', () => {
      expect(typeof config.square.accessToken).toBe('string');
    });

    it('should have environment as sandbox or production', () => {
      expect(['sandbox', 'production']).toContain(config.square.environment);
    });
  });

  // ==========================================================================
  // plaid
  // ==========================================================================
  describe('plaid', () => {
    it('should have clientId as string', () => {
      expect(typeof config.plaid.clientId).toBe('string');
    });

    it('should have secret as string', () => {
      expect(typeof config.plaid.secret).toBe('string');
    });

    it('should have env as valid environment', () => {
      expect(['sandbox', 'development', 'production']).toContain(config.plaid.env);
    });
  });

  // ==========================================================================
  // taxJar
  // ==========================================================================
  describe('taxJar', () => {
    it('should have apiKey as string', () => {
      expect(typeof config.taxJar.apiKey).toBe('string');
    });
  });

  // ==========================================================================
  // blockchain
  // ==========================================================================
  describe('blockchain', () => {
    it('should have solanaRpcUrl as string', () => {
      expect(typeof config.blockchain.solanaRpcUrl).toBe('string');
      expect(config.blockchain.solanaRpcUrl.length).toBeGreaterThan(0);
    });

    it('should have polygonRpcUrl as string', () => {
      expect(typeof config.blockchain.polygonRpcUrl).toBe('string');
    });
  });

  // ==========================================================================
  // services
  // ==========================================================================
  describe('services', () => {
    it('should have authUrl as valid URL', () => {
      expect(config.services.authUrl).toMatch(/^https?:\/\//);
    });

    it('should have eventUrl as valid URL', () => {
      expect(config.services.eventUrl).toMatch(/^https?:\/\//);
    });

    it('should have ticketUrl as valid URL', () => {
      expect(config.services.ticketUrl).toMatch(/^https?:\/\//);
    });

    it('should have venueUrl as valid URL', () => {
      expect(config.services.venueUrl).toMatch(/^https?:\/\//);
    });

    it('should have paymentUrl as valid URL', () => {
      expect(config.services.paymentUrl).toMatch(/^https?:\/\//);
    });

    it('should have marketplaceUrl as valid URL', () => {
      expect(config.services.marketplaceUrl).toMatch(/^https?:\/\//);
    });
  });

  // ==========================================================================
  // jwt
  // ==========================================================================
  describe('jwt', () => {
    it('should have secret as string', () => {
      expect(typeof config.jwt.secret).toBe('string');
      expect(config.jwt.secret.length).toBeGreaterThan(0);
    });
  });
});
