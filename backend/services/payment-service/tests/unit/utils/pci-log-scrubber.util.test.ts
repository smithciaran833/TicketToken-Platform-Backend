/**
 * Unit Tests for PCI Log Scrubber Utility
 * 
 * Tests sensitive data scrubbing for PCI DSS compliance.
 */

import {
  scrubSensitiveData,
  scrubObject,
  SafeLogger,
  maskCardNumber,
  createPaymentLog,
  containsPCIData,
} from '../../../src/utils/pci-log-scrubber.util';

describe('PCI Log Scrubber Utility', () => {
  describe('scrubSensitiveData', () => {
    describe('Credit Card Numbers', () => {
      it('should scrub 16-digit card number with spaces', () => {
        const input = 'Card: 4111 1111 1111 1111';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CARD_REDACTED]');
        expect(result).not.toContain('4111');
      });

      it('should scrub 16-digit card number with dashes', () => {
        const input = 'Card: 4111-1111-1111-1111';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CARD_REDACTED]');
      });

      it('should scrub 16-digit card number without separators', () => {
        const input = 'Card: 4111111111111111';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CARD_REDACTED]');
      });

      it('should scrub American Express 15-digit card', () => {
        const input = 'Amex: 371449635398431';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CARD_REDACTED]');
      });

      it('should scrub Discover 16-digit card', () => {
        const input = 'Discover: 6011111111111117';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CARD_REDACTED]');
      });
    });

    describe('CVV/CVC', () => {
      it('should scrub CVV in text', () => {
        const input = 'cvv: 123';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CVV_REDACTED]');
        expect(result).not.toContain('123');
      });

      it('should scrub CVC in text', () => {
        const input = 'CVC: 456';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CVV_REDACTED]');
      });

      it('should scrub 4-digit CVV (Amex)', () => {
        const input = 'cvv: 1234';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CVV_REDACTED]');
      });

      it('should scrub CVV in JSON format', () => {
        const input = '{"cvv": "123"}';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[CVV_REDACTED]');
      });
    });

    describe('Expiration Dates', () => {
      it('should scrub expiration with slash', () => {
        const input = 'exp: 12/25';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[EXP_REDACTED]');
      });

      it('should scrub expiration with dash', () => {
        const input = 'expiry: 01-2027';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[EXP_REDACTED]');
      });

      it('should scrub expiration in JSON', () => {
        const input = '{"exp_month": "12"}';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[EXP_REDACTED]');
      });
    });

    describe('Track Data', () => {
      it('should scrub Track 1 data', () => {
        const input = '%B4111111111111111^DOE/JOHN^2512101123456789?';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[TRACK_REDACTED]');
        expect(result).not.toContain('4111111111111111');
      });

      it('should scrub Track 2 data', () => {
        const input = ';4111111111111111=251210123456?';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[TRACK_REDACTED]');
      });
    });

    describe('SSN', () => {
      it('should scrub SSN with dashes', () => {
        const input = 'SSN: 123-45-6789';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[SSN_REDACTED]');
        expect(result).not.toContain('123-45-6789');
      });

      it('should scrub SSN with spaces', () => {
        const input = 'SSN: 123 45 6789';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[SSN_REDACTED]');
      });

      it('should scrub SSN without separators', () => {
        const input = 'SSN: 123456789';
        const result = scrubSensitiveData(input);
        // Note: This will match card pattern, both should be redacted
        expect(result).not.toContain('123456789');
      });
    });

    describe('Bank Account Numbers', () => {
      it('should scrub account number', () => {
        const input = 'account: 12345678901';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[ACCOUNT_REDACTED]');
      });

      it('should scrub routing number', () => {
        const input = 'routing: 121000248';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[ACCOUNT_REDACTED]');
      });
    });

    describe('Email Addresses', () => {
      it('should scrub email addresses', () => {
        const input = 'Contact: john.doe@example.com';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[EMAIL_REDACTED]');
        expect(result).not.toContain('john.doe@example.com');
      });
    });

    describe('Tokens and API Keys', () => {
      it('should scrub bearer tokens', () => {
        const input = 'bearer: abc123xyz';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[TOKEN_REDACTED]');
      });

      it('should scrub API keys', () => {
        const input = 'api_key: sk_live_abcdefghijklmnop';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[TOKEN_REDACTED]');
      });

      it('should scrub token in JSON', () => {
        const input = '{"token": "secret_value_123"}';
        const result = scrubSensitiveData(input);
        expect(result).toContain('[TOKEN_REDACTED]');
      });
    });

    describe('Edge Cases', () => {
      it('should handle null input', () => {
        expect(scrubSensitiveData(null as any)).toBeNull();
      });

      it('should handle undefined input', () => {
        expect(scrubSensitiveData(undefined as any)).toBeUndefined();
      });

      it('should handle empty string', () => {
        expect(scrubSensitiveData('')).toBe('');
      });

      it('should not modify safe strings', () => {
        const input = 'This is a safe message without sensitive data';
        expect(scrubSensitiveData(input)).toBe(input);
      });

      it('should handle multiple sensitive values', () => {
        const input = 'Card: 4111111111111111, CVV: 123, SSN: 123-45-6789';
        const result = scrubSensitiveData(input);
        expect(result).not.toContain('4111111111111111');
        expect(result).not.toContain('123-45-6789');
      });
    });
  });

  describe('scrubObject', () => {
    it('should scrub nested objects', () => {
      const input = {
        payment: {
          card_number: '4111111111111111',
          cvv: '123',
        },
      };
      const result = scrubObject(input);
      expect(result.payment.card_number).toBe('[REDACTED]');
      expect(result.payment.cvv).toBe('[REDACTED]');
    });

    it('should scrub arrays', () => {
      const input = [
        { card: '4111111111111111' },
        { card: '5500000000000004' },
      ];
      const result = scrubObject(input);
      expect(result[0].card).toContain('[CARD_REDACTED]');
      expect(result[1].card).toContain('[CARD_REDACTED]');
    });

    it('should scrub specific field names', () => {
      const input = {
        cardNumber: '4111111111111111',
        password: 'secret123',
        apiKey: 'sk_live_abc',
        accountNumber: '12345678',
      };
      const result = scrubObject(input);
      expect(result.cardNumber).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.accountNumber).toBe('[REDACTED]');
    });

    it('should handle null', () => {
      expect(scrubObject(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(scrubObject(undefined)).toBeUndefined();
    });

    it('should handle primitive types', () => {
      expect(scrubObject(123)).toBe(123);
      expect(scrubObject(true)).toBe(true);
    });

    it('should not mutate original object', () => {
      const original = { card: '4111111111111111' };
      const result = scrubObject(original);
      expect(original.card).toBe('4111111111111111');
      expect(result.card).toContain('[CARD_REDACTED]');
    });

    it('should handle deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              secret: 'sensitive_data',
            },
          },
        },
      };
      const result = scrubObject(input);
      expect(result.level1.level2.level3.secret).toBe('[REDACTED]');
    });
  });

  describe('SafeLogger', () => {
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleDebugSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should create logger with context', () => {
      const logger = new SafeLogger('TestContext');
      logger.info('Test message');
      
      expect(consoleLogSpy).toHaveBeenCalled();
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.context).toBe('TestContext');
    });

    it('should scrub sensitive data in messages', () => {
      const logger = new SafeLogger('Payment');
      logger.info('Processing card 4111111111111111');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.message).toContain('[CARD_REDACTED]');
      expect(logEntry.message).not.toContain('4111111111111111');
    });

    it('should scrub sensitive data in meta objects', () => {
      const logger = new SafeLogger('Payment');
      logger.info('Processing payment', { cardNumber: '4111111111111111' });
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.meta.cardNumber).toBe('[REDACTED]');
    });

    it('should support pino-style logging', () => {
      const logger = new SafeLogger('Payment');
      logger.info({ orderId: '123', cardNumber: '4111111111111111' }, 'Processing');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.message).toBe('Processing');
      expect(logEntry.meta.cardNumber).toBe('[REDACTED]');
    });

    it('should log errors to console.error', () => {
      const logger = new SafeLogger('Error');
      logger.error('An error occurred');
      
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should log warnings to console.warn', () => {
      const logger = new SafeLogger('Warn');
      logger.warn('A warning');
      
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should log debug to console.debug', () => {
      const logger = new SafeLogger('Debug');
      logger.debug('Debug message');
      
      expect(consoleDebugSpy).toHaveBeenCalled();
    });

    it('should include timestamp', () => {
      const logger = new SafeLogger('Test');
      logger.info('Test');
      
      const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(logEntry.timestamp).toBeDefined();
      expect(new Date(logEntry.timestamp).toString()).not.toBe('Invalid Date');
    });
  });

  describe('maskCardNumber', () => {
    it('should mask card number showing last 4', () => {
      expect(maskCardNumber('4111111111111111')).toBe('**** **** **** 1111');
    });

    it('should handle card with different last 4', () => {
      expect(maskCardNumber('5500000000005678')).toBe('**** **** **** 5678');
    });

    it('should handle invalid card (empty)', () => {
      expect(maskCardNumber('')).toBe('[INVALID_CARD]');
    });

    it('should handle invalid card (null)', () => {
      expect(maskCardNumber(null as any)).toBe('[INVALID_CARD]');
    });

    it('should handle card with less than 4 digits', () => {
      expect(maskCardNumber('123')).toBe('[INVALID_CARD]');
    });

    it('should handle exactly 4 digits', () => {
      expect(maskCardNumber('1234')).toBe('**** **** **** 1234');
    });
  });

  describe('createPaymentLog', () => {
    it('should create log entry with all fields', () => {
      const log = createPaymentLog('txn_123', 5000, 'completed', '1234');
      
      expect(log.transactionId).toBe('txn_123');
      expect(log.amount).toBe(5000);
      expect(log.status).toBe('completed');
      expect(log.cardLast4).toBe('1234');
      expect(log.timestamp).toBeDefined();
    });

    it('should create log entry without last4', () => {
      const log = createPaymentLog('txn_456', 1000, 'pending');
      
      expect(log.transactionId).toBe('txn_456');
      expect(log.cardLast4).toBeUndefined();
    });

    it('should include ISO timestamp', () => {
      const log = createPaymentLog('txn_789', 2000, 'failed');
      
      expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('containsPCIData', () => {
    it('should detect credit card numbers', () => {
      expect(containsPCIData('Card: 4111111111111111')).toBe(true);
    });

    it('should detect CVV', () => {
      expect(containsPCIData('cvv: 123')).toBe(true);
    });

    it('should detect track data', () => {
      expect(containsPCIData('%B4111111111111111^DOE/JOHN^2512?')).toBe(true);
    });

    it('should detect SSN', () => {
      expect(containsPCIData('SSN: 123-45-6789')).toBe(true);
    });

    it('should return false for safe data', () => {
      expect(containsPCIData('Order ID: ORD-123456')).toBe(false);
    });

    it('should handle empty string', () => {
      expect(containsPCIData('')).toBe(false);
    });

    it('should handle null/undefined', () => {
      expect(containsPCIData(null as any)).toBe(false);
      expect(containsPCIData(undefined as any)).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complex payment object', () => {
      const paymentData = {
        order: {
          id: 'ord_123',
          customer: {
            email: 'customer@example.com',
            phone: '555-1234',
          },
        },
        payment: {
          card_number: '4111111111111111',
          exp_month: '12',
          exp_year: '2025',
          cvv: '123',
          billing: {
            name: 'John Doe',
            address: '123 Main St',
          },
        },
        metadata: {
          ip: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
        },
      };

      const result = scrubObject(paymentData);

      // Should preserve safe data
      expect(result.order.id).toBe('ord_123');
      expect(result.payment.billing.name).toBe('John Doe');
      expect(result.metadata.ip).toBe('192.168.1.1');

      // Should scrub sensitive data
      expect(result.order.customer.email).toContain('[EMAIL_REDACTED]');
      expect(result.payment.card_number).toBe('[REDACTED]');
      expect(result.payment.cvv).toBe('[REDACTED]');
      expect(result.payment.exp_month).toBe('[REDACTED]');
      expect(result.payment.exp_year).toBe('[REDACTED]');
    });

    it('should handle error objects with stack traces', () => {
      const error = {
        message: 'Payment failed for card 4111111111111111',
        stack: 'Error at processCard(card=4111111111111111)',
        details: {
          cvv: '123',
        },
      };

      const result = scrubObject(error);

      expect(result.message).toContain('[CARD_REDACTED]');
      expect(result.stack).toContain('[CARD_REDACTED]');
      expect(result.details.cvv).toBe('[REDACTED]');
    });
  });
});
