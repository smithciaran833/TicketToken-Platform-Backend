/**
 * COMPONENT TEST: IntentsController
 *
 * Tests payment intent creation
 */

import { v4 as uuidv4 } from 'uuid';
import { FastifyRequest, FastifyReply } from 'fastify';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';

// Mock Stripe
const mockStripeCreate = jest.fn();
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockStripeCreate,
    },
  }));
});

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    stripe: {
      secretKey: 'sk_test_fake',
    },
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
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

import { IntentsController, intentsController } from '../../../src/controllers/intentsController';

// Helper to create mock request
function createMockRequest(body: any = {}): FastifyRequest {
  return {
    body,
    headers: {},
    params: {},
    query: {},
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): { reply: FastifyReply; getResponse: () => any; getStatus: () => number } {
  let response: any = null;
  let status = 200;

  const reply = {
    send: jest.fn().mockImplementation((data) => {
      response = data;
      return reply;
    }),
    code: jest.fn().mockImplementation((code) => {
      status = code;
      return reply;
    }),
    status: jest.fn().mockImplementation((code) => {
      status = code;
      return reply;
    }),
  } as unknown as FastifyReply;

  return {
    reply,
    getResponse: () => response,
    getStatus: () => status,
  };
}

describe('IntentsController Component Tests', () => {
  beforeEach(() => {
    mockStripeCreate.mockReset();
    mockStripeCreate.mockResolvedValue({
      id: 'pi_test123',
      client_secret: 'pi_test123_secret_abc',
    });
  });

  // ===========================================================================
  // CREATE INTENT
  // ===========================================================================
  describe('createIntent()', () => {
    it('should create payment intent with amount', async () => {
      const request = createMockRequest({ amount: 5000 });
      const { reply, getResponse } = createMockReply();

      await intentsController.createIntent(request, reply);

      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          currency: 'usd',
        })
      );

      const response = getResponse();
      expect(response.clientSecret).toBe('pi_test123_secret_abc');
      expect(response.intentId).toBe('pi_test123');
    });

    it('should use provided currency', async () => {
      const request = createMockRequest({ amount: 5000, currency: 'eur' });
      const { reply } = createMockReply();

      await intentsController.createIntent(request, reply);

      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'eur',
        })
      );
    });

    it('should default to USD currency', async () => {
      const request = createMockRequest({ amount: 5000 });
      const { reply } = createMockReply();

      await intentsController.createIntent(request, reply);

      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'usd',
        })
      );
    });

    it('should calculate platform fee (2.5%)', async () => {
      const request = createMockRequest({ amount: 10000 }); // $100.00
      const { reply } = createMockReply();

      await intentsController.createIntent(request, reply);

      expect(mockStripeCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            platformFee: '250', // 2.5% of 10000
          }),
        })
      );
    });

    it('should handle Stripe errors', async () => {
      mockStripeCreate.mockRejectedValueOnce(new Error('Stripe API error'));

      const request = createMockRequest({ amount: 5000 });
      const { reply, getResponse, getStatus } = createMockReply();

      await intentsController.createIntent(request, reply);

      expect(getStatus()).toBe(500);
      expect(getResponse().error).toContain('Failed to create payment intent');
    });
  });

  // ===========================================================================
  // SINGLETON EXPORT
  // ===========================================================================
  describe('singleton export', () => {
    it('should export intentsController instance', () => {
      expect(intentsController).toBeInstanceOf(IntentsController);
    });
  });
});
