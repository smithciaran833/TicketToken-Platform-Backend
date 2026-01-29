/**
 * COMPONENT TEST: PaymentProcessorService
 *
 * Tests PaymentProcessorService with REAL Database, MOCKED Stripe
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long-for-testing';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'tickettoken_db';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing_only_1234567890';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_webhook_secret_for_testing_1234';
process.env.SERVICE_AUTH_SECRET = 'test-service-auth-secret-at-least-32-chars-long';
process.env.HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-characters-long';
process.env.LOG_LEVEL = 'silent';

// Shared pool
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
  }
  return sharedPool;
}

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock circuit breaker to pass through
jest.mock('../../../../src/utils/circuit-breaker', () => ({
  stripeCircuitBreaker: {
    execute: async (fn: () => Promise<any>) => fn(),
    getStats: () => ({ state: 'closed', failures: 0, successes: 0 }),
    reset: jest.fn(),
    forceOpen: jest.fn(),
    forceClose: jest.fn(),
  },
  CircuitState: {
    CLOSED: 'closed',
    OPEN: 'open',
    HALF_OPEN: 'half_open',
  },
}));

import { PaymentProcessorService, StripePaymentError } from '../../../../src/services/core/payment-processor.service';

// Create a mock Stripe client
function createMockStripe() {
  const paymentIntents: Map<string, any> = new Map();

  return {
    paymentIntents: {
      create: jest.fn(async (params: any, options?: any) => {
        const id = `pi_test_${uuidv4().slice(0, 8)}`;
        const intent = {
          id,
          amount: params.amount,
          currency: params.currency,
          status: 'requires_confirmation',
          client_secret: `${id}_secret_test`,
          metadata: params.metadata || {},
          created: Math.floor(Date.now() / 1000),
        };
        paymentIntents.set(id, intent);
        return intent;
      }),
      confirm: jest.fn(async (id: string) => {
        const intent = paymentIntents.get(id);
        if (!intent) {
          const error: any = new Error('No such payment_intent');
          error.type = 'StripeInvalidRequestError';
          error.code = 'resource_missing';
          throw error;
        }
        intent.status = 'succeeded';
        return intent;
      }),
      retrieve: jest.fn(async (id: string) => {
        const intent = paymentIntents.get(id);
        if (!intent) {
          const error: any = new Error('No such payment_intent');
          error.type = 'StripeInvalidRequestError';
          error.code = 'resource_missing';
          throw error;
        }
        return intent;
      }),
    },
    _intents: paymentIntents,
    _reset: () => paymentIntents.clear(),
  };
}

// Create a mock Knex-like DB interface
function createMockDb(pool: Pool) {
  return (tableName: string) => {
    let insertData: any = null;
    let whereClause: any = {};

    const builder: any = {
      insert: (data: any) => {
        insertData = data;
        return builder;
      },
      returning: async (fields: string) => {
        if (insertData) {
          const columns = Object.keys(insertData);
          const values = Object.values(insertData);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

          const text = `
            INSERT INTO ${tableName} (${columns.join(', ')})
            VALUES (${placeholders})
            RETURNING *
          `;

          const result = await pool.query(text, values);
          return result.rows;
        }
        return [];
      },
      where: (clause: any) => {
        whereClause = clause;
        return builder;
      },
      update: async (data: any) => {
        const setClauses = Object.keys(data).map((key, i) => `${key} = $${i + 1}`);
        const whereKeys = Object.keys(whereClause);
        const whereClauses = whereKeys.map((key, i) => `${key} = $${setClauses.length + i + 1}`);

        const text = `
          UPDATE ${tableName}
          SET ${setClauses.join(', ')}
          WHERE ${whereClauses.join(' AND ')}
        `;

        const values = [...Object.values(data), ...Object.values(whereClause)];
        await pool.query(text, values);
        return 1;
      },
    };

    return builder;
  };
}

describe('PaymentProcessorService Component Tests', () => {
  let pool: Pool;
  let mockStripe: ReturnType<typeof createMockStripe>;
  let mockDb: ReturnType<typeof createMockDb>;
  let service: PaymentProcessorService;
  let tenantId: string;
  let userId: string;
  let eventId: string;
  let venueId: string;
  let orderId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    eventId = uuidv4();
    venueId = uuidv4();
    orderId = uuidv4();

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);

    // Create test venue
    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000]);

    // Create test event
    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`, new Date(Date.now() + 86400000)]);

    // Setup mocks and service
    mockStripe = createMockStripe();
    mockDb = createMockDb(pool);
    service = new PaymentProcessorService(mockStripe, mockDb);
  });

  afterEach(async () => {
    mockStripe._reset();
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // PROCESS PAYMENT
  // ===========================================================================
  describe('processPayment()', () => {
    it('should create payment intent and store transaction', async () => {
      const result = await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 10000,
        currency: 'usd',
        tenantId,
      });

      expect(result).toBeDefined();
      expect(result.transactionId).toBeDefined();
      expect(result.paymentIntentId).toMatch(/^pi_test_/);
      expect(result.status).toBe('requires_confirmation');
      expect(result.clientSecret).toContain('_secret_test');

      // Verify Stripe was called with correct metadata
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000,
          currency: 'usd',
          metadata: expect.objectContaining({
            orderId,
            userId,
            venueId,
            eventId,
            tenantId,
          }),
        }),
        expect.any(Object)
      );

      // Verify transaction was stored in database with all required fields
      const dbResult = await pool.query(
        'SELECT * FROM payment_transactions WHERE order_id = $1',
        [orderId]
      );
      expect(dbResult.rows).toHaveLength(1);
      expect(parseFloat(dbResult.rows[0].amount)).toBe(10000);
      expect(dbResult.rows[0].stripe_payment_intent_id).toBe(result.paymentIntentId);
      expect(dbResult.rows[0].venue_id).toBe(venueId);
      expect(dbResult.rows[0].event_id).toBe(eventId);
      expect(dbResult.rows[0].type).toBe('ticket_purchase');
      expect(dbResult.rows[0].status).toBe('pending');
    });

    it('should calculate default platform fee (5%)', async () => {
      await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 10000,
        currency: 'usd',
        tenantId,
      });

      const dbResult = await pool.query(
        'SELECT platform_fee, venue_payout FROM payment_transactions WHERE order_id = $1',
        [orderId]
      );
      expect(parseFloat(dbResult.rows[0].platform_fee)).toBe(500); // 5% of 10000
      expect(parseFloat(dbResult.rows[0].venue_payout)).toBe(9500); // 10000 - 500
    });

    it('should use custom platform fee when provided', async () => {
      await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 10000,
        currency: 'usd',
        platformFeeCents: 1000,
        venuePayoutCents: 9000,
        tenantId,
      });

      const dbResult = await pool.query(
        'SELECT platform_fee, venue_payout FROM payment_transactions WHERE order_id = $1',
        [orderId]
      );
      expect(parseFloat(dbResult.rows[0].platform_fee)).toBe(1000);
      expect(parseFloat(dbResult.rows[0].venue_payout)).toBe(9000);
    });

    it('should use idempotency key when provided', async () => {
      const idempotencyKey = uuidv4();

      await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 5000,
        currency: 'usd',
        idempotencyKey,
        tenantId,
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          idempotencyKey,
        })
      );

      // Verify idempotency key stored in DB
      const dbResult = await pool.query(
        'SELECT idempotency_key FROM payment_transactions WHERE order_id = $1',
        [orderId]
      );
      expect(dbResult.rows[0].idempotency_key).toBe(idempotencyKey);
    });

    it('should handle different currencies', async () => {
      const result = await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 10000,
        currency: 'eur',
        tenantId,
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'eur',
        }),
        expect.any(Object)
      );

      const dbResult = await pool.query(
        'SELECT currency FROM payment_transactions WHERE order_id = $1',
        [orderId]
      );
      expect(dbResult.rows[0].currency).toBe('eur');
    });

    it('should store custom metadata', async () => {
      const customMetadata = { ticketIds: ['t1', 't2'], seatNumbers: ['A1', 'A2'] };

      await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 7500,
        currency: 'usd',
        metadata: customMetadata,
        tenantId,
      });

      // Check Stripe metadata includes our custom data
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining(customMetadata),
        }),
        expect.any(Object)
      );

      // Check DB metadata
      const dbResult = await pool.query(
        'SELECT metadata FROM payment_transactions WHERE order_id = $1',
        [orderId]
      );
      expect(dbResult.rows[0].metadata).toEqual(customMetadata);
    });

    it('should handle different transaction types', async () => {
      await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 5000,
        currency: 'usd',
        type: 'refund',
        tenantId,
      });

      const dbResult = await pool.query(
        'SELECT type FROM payment_transactions WHERE order_id = $1',
        [orderId]
      );
      expect(dbResult.rows[0].type).toBe('refund');
    });
  });

  // ===========================================================================
  // CONFIRM PAYMENT
  // ===========================================================================
  describe('confirmPayment()', () => {
    it('should confirm payment and update transaction status', async () => {
      // First create a payment
      const createResult = await service.processPayment({
        userId,
        orderId,
        venueId,
        eventId,
        amountCents: 10000,
        currency: 'usd',
        tenantId,
      });

      // Confirm it
      const confirmResult = await service.confirmPayment(createResult.paymentIntentId, userId);

      expect(confirmResult.status).toBe('succeeded');
      expect(confirmResult.confirmedAt).toBeInstanceOf(Date);

      // Verify Stripe confirm was called
      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith(createResult.paymentIntentId);

      // Verify database was updated to 'completed' (mapped from 'succeeded')
      const dbResult = await pool.query(
        'SELECT status, updated_at FROM payment_transactions WHERE stripe_payment_intent_id = $1',
        [createResult.paymentIntentId]
      );
      expect(dbResult.rows[0].status).toBe('completed');
    });

    it('should handle non-existent payment intent', async () => {
      await expect(
        service.confirmPayment('pi_nonexistent', userId)
      ).rejects.toThrow(StripePaymentError);
    });
  });

  // ===========================================================================
  // CIRCUIT BREAKER STATUS
  // ===========================================================================
  describe('getCircuitBreakerStatus()', () => {
    it('should return circuit breaker status', () => {
      const status = service.getCircuitBreakerStatus();

      expect(status).toEqual({
        state: 'closed',
        failures: 0,
        successes: 0,
      });
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should wrap card errors properly', async () => {
      mockStripe.paymentIntents.create.mockRejectedValueOnce({
        type: 'StripeCardError',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
        message: 'Your card has insufficient funds.',
      });

      try {
        await service.processPayment({
          userId,
          orderId,
          venueId,
          eventId,
          amountCents: 10000,
          currency: 'usd',
          tenantId,
        });
        fail('Expected StripePaymentError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(StripePaymentError);
        expect(error.type).toBe('card_error');
        expect(error.retryable).toBe(false);
        expect(error.declineCode).toBe('insufficient_funds');
      }
    });

    it('should mark rate limit errors as retryable', async () => {
      mockStripe.paymentIntents.create.mockRejectedValueOnce({
        type: 'StripeRateLimitError',
        message: 'Rate limit exceeded',
      });

      try {
        await service.processPayment({
          userId,
          orderId,
          venueId,
          eventId,
          amountCents: 10000,
          currency: 'usd',
          tenantId,
        });
        fail('Expected StripePaymentError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(StripePaymentError);
        expect(error.type).toBe('rate_limit');
        expect(error.retryable).toBe(true);
      }
    });

    it('should mark API errors as retryable', async () => {
      mockStripe.paymentIntents.create.mockRejectedValueOnce({
        type: 'StripeAPIError',
        message: 'Internal Stripe error',
      });

      try {
        await service.processPayment({
          userId,
          orderId,
          venueId,
          eventId,
          amountCents: 10000,
          currency: 'usd',
          tenantId,
        });
        fail('Expected StripePaymentError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(StripePaymentError);
        expect(error.type).toBe('api_error');
        expect(error.retryable).toBe(true);
      }
    });

    it('should mark validation errors as non-retryable', async () => {
      mockStripe.paymentIntents.create.mockRejectedValueOnce({
        type: 'StripeInvalidRequestError',
        code: 'parameter_invalid',
        message: 'Invalid amount',
      });

      try {
        await service.processPayment({
          userId,
          orderId,
          venueId,
          eventId,
          amountCents: 10000,
          currency: 'usd',
          tenantId,
        });
        fail('Expected StripePaymentError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(StripePaymentError);
        expect(error.type).toBe('validation');
        expect(error.retryable).toBe(false);
      }
    });
  });

  // ===========================================================================
  // STRIPE PAYMENT ERROR CLASS
  // ===========================================================================
  describe('StripePaymentError', () => {
    it('should provide user-friendly message for insufficient_funds', () => {
      const error = new StripePaymentError({
        type: 'StripeCardError',
        decline_code: 'insufficient_funds',
      });

      expect(error.message).toContain('insufficient funds');
    });

    it('should provide user-friendly message for expired_card', () => {
      const error = new StripePaymentError({
        type: 'StripeCardError',
        decline_code: 'expired_card',
      });

      expect(error.message).toContain('expired');
    });

    it('should provide user-friendly message for incorrect_cvc', () => {
      const error = new StripePaymentError({
        type: 'StripeCardError',
        decline_code: 'incorrect_cvc',
      });

      expect(error.message).toContain('security code');
    });

    it('should provide generic message for unknown decline codes', () => {
      const error = new StripePaymentError({
        type: 'StripeCardError',
        decline_code: 'unknown_code',
      });

      expect(error.message).toContain('declined');
    });

    it('should handle network errors', () => {
      const error = new StripePaymentError({
        code: 'ECONNREFUSED',
        message: 'Connection refused',
      });

      expect(error.type).toBe('network_error');
      expect(error.retryable).toBe(true);
    });
  });
});
