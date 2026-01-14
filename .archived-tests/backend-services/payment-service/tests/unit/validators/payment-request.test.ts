// =============================================================================
// TEST SUITE: payment-request validator
// =============================================================================

import { PaymentRequest, PaymentRequestValidator } from '../../../src/validators/payment-request';

describe('PaymentRequestValidator', () => {
  // ===========================================================================
  // validate() - Valid Requests - 5 test cases
  // ===========================================================================

  describe('validate() - Valid Requests', () => {
    it('should pass validation for valid request', () => {
      const request: PaymentRequest = {
        amount: 10000,
        currency: 'USD',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toEqual([]);
    });

    it('should pass with optional payment method', () => {
      const request: PaymentRequest = {
        amount: 5000,
        currency: 'EUR',
        orderId: 'order-789',
        customerId: 'customer-012',
        paymentMethod: 'card',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toHaveLength(0);
    });

    it('should pass with optional metadata', () => {
      const request: PaymentRequest = {
        amount: 2500,
        currency: 'GBP',
        orderId: 'order-abc',
        customerId: 'customer-def',
        metadata: { source: 'mobile-app' },
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toHaveLength(0);
    });

    it('should pass with all supported currencies', () => {
      const currencies = ['USD', 'EUR', 'GBP', 'CAD'];

      currencies.forEach(currency => {
        const request: PaymentRequest = {
          amount: 1000,
          currency,
          orderId: 'order-1',
          customerId: 'customer-1',
        };

        const errors = PaymentRequestValidator.validate(request);
        expect(errors).toHaveLength(0);
      });
    });

    it('should pass with maximum allowed amount', () => {
      const request: PaymentRequest = {
        amount: 99999999,
        currency: 'USD',
        orderId: 'order-max',
        customerId: 'customer-max',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // validate() - Amount Validation - 3 test cases
  // ===========================================================================

  describe('validate() - Amount Validation', () => {
    it('should reject zero amount', () => {
      const request: PaymentRequest = {
        amount: 0,
        currency: 'USD',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Amount must be greater than 0');
    });

    it('should reject negative amount', () => {
      const request: PaymentRequest = {
        amount: -100,
        currency: 'USD',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Amount must be greater than 0');
    });

    it('should reject amount exceeding maximum', () => {
      const request: PaymentRequest = {
        amount: 100000000,
        currency: 'USD',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Amount exceeds maximum allowed');
    });
  });

  // ===========================================================================
  // validate() - Currency Validation - 3 test cases
  // ===========================================================================

  describe('validate() - Currency Validation', () => {
    it('should reject missing currency', () => {
      const request: any = {
        amount: 1000,
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Currency must be a 3-letter ISO code');
    });

    it('should reject invalid currency length', () => {
      const request: PaymentRequest = {
        amount: 1000,
        currency: 'US',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Currency must be a 3-letter ISO code');
    });

    it('should reject unsupported currency', () => {
      const request: PaymentRequest = {
        amount: 1000,
        currency: 'JPY',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Currency JPY is not supported');
    });
  });

  // ===========================================================================
  // validate() - Required Fields - 2 test cases
  // ===========================================================================

  describe('validate() - Required Fields', () => {
    it('should reject missing orderId', () => {
      const request: any = {
        amount: 1000,
        currency: 'USD',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Order ID is required');
    });

    it('should reject missing customerId', () => {
      const request: any = {
        amount: 1000,
        currency: 'USD',
        orderId: 'order-123',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Customer ID is required');
    });
  });

  // ===========================================================================
  // validate() - Multiple Errors - 2 test cases
  // ===========================================================================

  describe('validate() - Multiple Errors', () => {
    it('should return multiple errors for invalid request', () => {
      const request: any = {
        amount: 0,
        currency: 'US',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors.length).toBeGreaterThan(1);
      expect(errors).toContain('Amount must be greater than 0');
      expect(errors).toContain('Currency must be a 3-letter ISO code');
      expect(errors).toContain('Order ID is required');
      expect(errors).toContain('Customer ID is required');
    });

    it('should return all validation errors', () => {
      const request: PaymentRequest = {
        amount: 100000000,
        currency: 'JPY',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const errors = PaymentRequestValidator.validate(request);

      expect(errors).toContain('Amount exceeds maximum allowed');
      expect(errors).toContain('Currency JPY is not supported');
    });
  });

  // ===========================================================================
  // sanitize() - 6 test cases
  // ===========================================================================

  describe('sanitize()', () => {
    it('should round amount to integer', () => {
      const request: PaymentRequest = {
        amount: 1000.75,
        currency: 'USD',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const sanitized = PaymentRequestValidator.sanitize(request);

      expect(sanitized.amount).toBe(1001);
    });

    it('should uppercase currency', () => {
      const request: PaymentRequest = {
        amount: 1000,
        currency: 'usd',
        orderId: 'order-123',
        customerId: 'customer-456',
      };

      const sanitized = PaymentRequestValidator.sanitize(request);

      expect(sanitized.currency).toBe('USD');
    });

    it('should trim orderId', () => {
      const request: PaymentRequest = {
        amount: 1000,
        currency: 'USD',
        orderId: '  order-123  ',
        customerId: 'customer-456',
      };

      const sanitized = PaymentRequestValidator.sanitize(request);

      expect(sanitized.orderId).toBe('order-123');
    });

    it('should trim customerId', () => {
      const request: PaymentRequest = {
        amount: 1000,
        currency: 'USD',
        orderId: 'order-123',
        customerId: '  customer-456  ',
      };

      const sanitized = PaymentRequestValidator.sanitize(request);

      expect(sanitized.customerId).toBe('customer-456');
    });

    it('should preserve optional fields', () => {
      const request: PaymentRequest = {
        amount: 1000,
        currency: 'USD',
        orderId: 'order-123',
        customerId: 'customer-456',
        paymentMethod: 'card',
        metadata: { key: 'value' },
      };

      const sanitized = PaymentRequestValidator.sanitize(request);

      expect(sanitized.paymentMethod).toBe('card');
      expect(sanitized.metadata).toEqual({ key: 'value' });
    });

    it('should handle all transformations together', () => {
      const request: PaymentRequest = {
        amount: 2500.99,
        currency: 'eur',
        orderId: '  order-abc  ',
        customerId: '  customer-xyz  ',
      };

      const sanitized = PaymentRequestValidator.sanitize(request);

      expect(sanitized.amount).toBe(2501);
      expect(sanitized.currency).toBe('EUR');
      expect(sanitized.orderId).toBe('order-abc');
      expect(sanitized.customerId).toBe('customer-xyz');
    });
  });
});
