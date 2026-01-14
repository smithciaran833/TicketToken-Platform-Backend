/**
 * Unit Tests for Intents Controller
 * 
 * Tests payment intent creation endpoint.
 */

import { createMockRequest, createMockReply } from '../../setup';

// Mock Stripe
const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn(),
  },
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    stripe: {
      secretKey: 'sk_test_mock_key',
    },
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

// Mock money utils
jest.mock('../../../src/utils/money', () => ({
  percentOfCents: jest.fn((amount: number, basisPoints: number) => {
    return Math.round((amount * basisPoints) / 10000);
  }),
}));

import { IntentsController, intentsController } from '../../../src/controllers/intentsController';
import { percentOfCents } from '../../../src/utils/money';

describe('IntentsController', () => {
  let controller: IntentsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new IntentsController();
  });

  describe('createIntent', () => {
    it('should create a payment intent successfully', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000, // $100.00
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      const mockIntent = {
        id: 'pi_test_123456',
        client_secret: 'pi_test_123456_secret_abc',
        amount: 10000,
        currency: 'usd',
        status: 'requires_payment_method',
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockIntent);

      await controller.createIntent(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        clientSecret: 'pi_test_123456_secret_abc',
        intentId: 'pi_test_123456',
      });
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 10000,
        currency: 'usd',
        metadata: {
          platformFee: expect.any(String),
        },
      });
    });

    it('should use default currency when not provided', async () => {
      const request = createMockRequest({
        body: {
          amount: 5000,
          // currency not provided
        },
      });
      const reply = createMockReply();

      const mockIntent = {
        id: 'pi_default_currency',
        client_secret: 'pi_default_currency_secret',
        amount: 5000,
        currency: 'usd',
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockIntent);

      await controller.createIntent(request, reply);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'usd',
        })
      );
    });

    it('should calculate platform fee correctly at 2.5%', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000, // $100.00
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_fee_test',
        client_secret: 'secret',
      });

      await controller.createIntent(request, reply);

      // 2.5% fee = 250 basis points
      expect(percentOfCents).toHaveBeenCalledWith(10000, 250);
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: {
            platformFee: '250', // 2.5% of $100 = $2.50 = 250 cents
          },
        })
      );
    });

    it('should handle different currencies', async () => {
      const request = createMockRequest({
        body: {
          amount: 5000,
          currency: 'eur',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_eur_test',
        client_secret: 'pi_eur_secret',
        currency: 'eur',
      });

      await controller.createIntent(request, reply);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'eur',
        })
      );
    });

    it('should return 500 when Stripe API fails', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockRejectedValue(
        new Error('Stripe API error')
      );

      await controller.createIntent(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Failed to create payment intent',
      });
    });

    it('should handle Stripe card declined errors', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      const stripeError = new Error('Your card was declined');
      (stripeError as any).type = 'StripeCardError';
      (stripeError as any).code = 'card_declined';

      mockStripe.paymentIntents.create.mockRejectedValue(stripeError);

      await controller.createIntent(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
    });

    it('should handle very small amounts', async () => {
      const request = createMockRequest({
        body: {
          amount: 50, // $0.50 - minimum for Stripe
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_small',
        client_secret: 'pi_small_secret',
        amount: 50,
      });

      await controller.createIntent(request, reply);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 50,
        })
      );
    });

    it('should handle large amounts', async () => {
      const request = createMockRequest({
        body: {
          amount: 99999999, // $999,999.99
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_large',
        client_secret: 'pi_large_secret',
        amount: 99999999,
      });

      await controller.createIntent(request, reply);

      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          intentId: 'pi_large',
        })
      );
    });

    it('should handle network timeout errors', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      const timeoutError = new Error('Request timeout');
      (timeoutError as any).code = 'ETIMEDOUT';

      mockStripe.paymentIntents.create.mockRejectedValue(timeoutError);

      await controller.createIntent(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Failed to create payment intent',
      });
    });

    it('should handle Stripe rate limiting', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).type = 'StripeRateLimitError';

      mockStripe.paymentIntents.create.mockRejectedValue(rateLimitError);

      await controller.createIntent(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('Exported Instance', () => {
    it('should export a singleton instance', () => {
      expect(intentsController).toBeDefined();
      expect(intentsController).toBeInstanceOf(IntentsController);
    });

    it('should have createIntent method', () => {
      expect(typeof intentsController.createIntent).toBe('function');
    });
  });

  describe('Fee Calculation Edge Cases', () => {
    it('should calculate fee for amounts that result in fractional cents', async () => {
      const request = createMockRequest({
        body: {
          amount: 123, // Results in 3.075 cents fee (2.5%)
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_fractional',
        client_secret: 'secret',
      });

      await controller.createIntent(request, reply);

      // percentOfCents should round appropriately
      expect(percentOfCents).toHaveBeenCalledWith(123, 250);
    });

    it('should handle zero fee for very small amounts', async () => {
      const request = createMockRequest({
        body: {
          amount: 1, // 1 cent - fee would be 0.025 cents
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_tiny',
        client_secret: 'secret',
      });

      await controller.createIntent(request, reply);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalled();
    });
  });

  describe('Currency Handling', () => {
    const currencies = ['usd', 'eur', 'gbp', 'cad', 'aud', 'jpy'];

    currencies.forEach((currency) => {
      it(`should accept ${currency.toUpperCase()} currency`, async () => {
        const request = createMockRequest({
          body: {
            amount: 10000,
            currency,
          },
        });
        const reply = createMockReply();

        mockStripe.paymentIntents.create.mockResolvedValue({
          id: `pi_${currency}`,
          client_secret: `secret_${currency}`,
        });

        await controller.createIntent(request, reply);

        expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
          expect.objectContaining({
            currency,
          })
        );
      });
    });

    it('should handle uppercase currency codes', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'USD',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_upper',
        client_secret: 'secret',
      });

      await controller.createIntent(request, reply);

      // Controller passes through as-is
      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USD',
        })
      );
    });
  });

  describe('Response Format', () => {
    it('should return clientSecret and intentId in response', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_response_test',
        client_secret: 'pi_response_test_secret_xyz',
      });

      await controller.createIntent(request, reply);

      expect(reply.send).toHaveBeenCalledWith({
        clientSecret: 'pi_response_test_secret_xyz',
        intentId: 'pi_response_test',
      });
    });

    it('should not expose full intent object in response', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_secure',
        client_secret: 'pi_secure_secret',
        amount: 10000,
        currency: 'usd',
        metadata: { platformFee: '250' },
        payment_method: null,
        customer: null,
      });

      await controller.createIntent(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      
      // Should only contain clientSecret and intentId
      expect(Object.keys(response)).toEqual(['clientSecret', 'intentId']);
      expect(response.amount).toBeUndefined();
      expect(response.metadata).toBeUndefined();
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      mockStripe.paymentIntents.create.mockRejectedValue(new Error('Any error'));

      await controller.createIntent(request, reply);

      expect(reply.code).toHaveBeenCalledWith(500);
      expect(reply.send).toHaveBeenCalledWith({
        error: 'Failed to create payment intent',
      });
    });

    it('should not expose internal error details', async () => {
      const request = createMockRequest({
        body: {
          amount: 10000,
          currency: 'usd',
        },
      });
      const reply = createMockReply();

      const sensitiveError = new Error('Database connection string: postgres://user:password@host');
      mockStripe.paymentIntents.create.mockRejectedValue(sensitiveError);

      await controller.createIntent(request, reply);

      const response = (reply.send as jest.Mock).mock.calls[0][0];
      expect(response.error).toBe('Failed to create payment intent');
      expect(response.error).not.toContain('postgres');
      expect(response.error).not.toContain('password');
    });
  });
});
