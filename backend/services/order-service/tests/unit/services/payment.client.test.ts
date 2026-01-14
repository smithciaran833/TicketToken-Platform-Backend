/**
 * Unit Tests: Payment Client
 * Tests payment service client including circuit breaker, error handling, and fail-closed behavior
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/utils/http-client.util', () => ({
  createSecureServiceClient: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
  })),
  executeWithRetry: jest.fn(),
  getServiceUrl: jest.fn(() => 'http://localhost:3006'),
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  createCircuitBreaker: jest.fn((fn, options) => ({
    fire: jest.fn((...args) => fn(...args)),
    getState: jest.fn(() => 'CLOSED'),
    isOpen: jest.fn(() => false),
    reset: jest.fn(),
  })),
}));

import { PaymentClient } from '../../../src/services/payment.client';
import { executeWithRetry } from '../../../src/utils/http-client.util';
import { logger } from '../../../src/utils/logger';

describe('PaymentClient', () => {
  let client: PaymentClient;
  let mockExecuteWithRetry: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteWithRetry = executeWithRetry as jest.Mock;
    client = new PaymentClient();
  });

  // ============================================
  // Constructor
  // ============================================
  describe('constructor', () => {
    it('should create secure service client with 10s timeout', () => {
      const { createSecureServiceClient } = require('../../../src/utils/http-client.util');
      expect(createSecureServiceClient).toHaveBeenCalledWith({
        baseUrl: expect.any(String),
        serviceName: 'payment-service',
        timeout: 10000,
      });
    });

    it('should create circuit breakers for all operations', () => {
      const { createCircuitBreaker } = require('../../../src/utils/circuit-breaker');
      const breakerNames = createCircuitBreaker.mock.calls.map((call: any) => call[1].name);
      
      expect(breakerNames).toContain('payment-service-create-intent');
      expect(breakerNames).toContain('payment-service-confirm');
      expect(breakerNames).toContain('payment-service-cancel');
      expect(breakerNames).toContain('payment-service-refund');
      expect(breakerNames).toContain('payment-service-get-status');
    });

    it('should configure fallback only for getPaymentStatus', () => {
      const { createCircuitBreaker } = require('../../../src/utils/circuit-breaker');
      const statusBreakerCall = createCircuitBreaker.mock.calls.find(
        (call: any) => call[1].name === 'payment-service-get-status'
      );
      expect(statusBreakerCall[1].fallback).toBeDefined();
    });
  });

  // ============================================
  // createPaymentIntent
  // ============================================
  describe('createPaymentIntent', () => {
    const paymentData = {
      orderId: 'order-123',
      amountCents: 5000,
      currency: 'USD',
      userId: 'user-456',
    };

    it('should create payment intent successfully', async () => {
      const response = { paymentIntentId: 'pi_123', clientSecret: 'cs_456' };
      mockExecuteWithRetry.mockResolvedValue({ data: response });

      const result = await client.createPaymentIntent(paymentData);

      expect(result).toEqual(response);
    });

    it('should throw error on failure (no fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Payment service down'));

      await expect(client.createPaymentIntent(paymentData)).rejects.toThrow('Payment service down');
    });

    it('should log error on failure', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Failed'));

      await expect(client.createPaymentIntent(paymentData)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error creating payment intent',
        expect.objectContaining({ data: paymentData })
      );
    });

    it('should use 3 retries', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: {} });

      await client.createPaymentIntent(paymentData);

      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        3,
        'payment-service'
      );
    });
  });

  // ============================================
  // confirmPayment
  // ============================================
  describe('confirmPayment', () => {
    it('should confirm payment successfully', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await expect(client.confirmPayment('pi_123')).resolves.toBeUndefined();
    });

    it('should throw error on failure (no fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Confirmation failed'));

      await expect(client.confirmPayment('pi_123')).rejects.toThrow('Confirmation failed');
    });

    it('should log error on failure', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Failed'));

      await expect(client.confirmPayment('pi_123')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error confirming payment',
        expect.objectContaining({ paymentIntentId: 'pi_123' })
      );
    });
  });

  // ============================================
  // cancelPaymentIntent
  // ============================================
  describe('cancelPaymentIntent', () => {
    it('should cancel payment intent successfully', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await expect(client.cancelPaymentIntent('pi_123')).resolves.toBeUndefined();
    });

    it('should throw error on failure (no fallback)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Cancel failed'));

      await expect(client.cancelPaymentIntent('pi_123')).rejects.toThrow('Cancel failed');
    });

    it('should use 2 retries for cancellation', async () => {
      mockExecuteWithRetry.mockResolvedValue({});

      await client.cancelPaymentIntent('pi_123');

      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        2,
        'payment-service'
      );
    });
  });

  // ============================================
  // initiateRefund
  // ============================================
  describe('initiateRefund', () => {
    const refundData = {
      orderId: 'order-123',
      paymentIntentId: 'pi_456',
      amountCents: 2500,
      reason: 'customer_request',
    };

    it('should initiate refund successfully', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: { refundId: 'ref_789' } });

      const result = await client.initiateRefund(refundData);

      expect(result).toEqual({ refundId: 'ref_789' });
    });

    it('should throw error on failure (no fallback for writes)', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Refund failed'));

      await expect(client.initiateRefund(refundData)).rejects.toThrow('Refund failed');
    });

    it('should include reverseTransfer flag', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: { refundId: 'ref_789' } });

      await client.initiateRefund({ ...refundData, reverseTransfer: true });

      expect(mockExecuteWithRetry).toHaveBeenCalled();
    });

    it('should include refundApplicationFee flag', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: { refundId: 'ref_789' } });

      await client.initiateRefund({ ...refundData, refundApplicationFee: true });

      expect(mockExecuteWithRetry).toHaveBeenCalled();
    });

    it('should log error on failure', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Failed'));

      await expect(client.initiateRefund(refundData)).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error initiating refund',
        expect.objectContaining({ data: refundData })
      );
    });
  });

  // ============================================
  // getPaymentStatus
  // ============================================
  describe('getPaymentStatus', () => {
    it('should return payment status on success', async () => {
      const statusData = { status: 'succeeded', refundable: true, hasDispute: false };
      mockExecuteWithRetry.mockResolvedValue({ data: statusData });

      const result = await client.getPaymentStatus('pi_123');

      expect(result).toEqual(statusData);
    });

    it('should return status with dispute', async () => {
      const statusData = { status: 'disputed', refundable: false, hasDispute: true };
      mockExecuteWithRetry.mockResolvedValue({ data: statusData });

      const result = await client.getPaymentStatus('pi_123');

      expect(result.hasDispute).toBe(true);
      expect(result.refundable).toBe(false);
    });

    it('should return fail-closed default on error', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      const result = await client.getPaymentStatus('pi_123');

      expect(result).toEqual({
        status: 'unknown',
        refundable: false,  // Fail closed - don't allow refund
        hasDispute: false,
      });
    });

    it('should log error when service fails', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Timeout'));

      await client.getPaymentStatus('pi_123');

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting payment status',
        expect.objectContaining({ paymentIntentId: 'pi_123' })
      );
    });
  });
});
