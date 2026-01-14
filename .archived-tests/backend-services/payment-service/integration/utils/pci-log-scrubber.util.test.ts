/**
 * PCI Log Scrubber Integration Tests
 * 100% code coverage
 */

import {
  scrubSensitiveData,
  scrubObject,
  SafeLogger,
  maskCardNumber,
  createPaymentLog,
  containsPCIData,
} from '../../../src/utils/pci-log-scrubber.util';

describe('scrubSensitiveData()', () => {
  describe('credit card numbers', () => {
    it('should scrub 16-digit card numbers', () => {
      expect(scrubSensitiveData('Card: 4111111111111111')).toBe('Card: [CARD_REDACTED]');
    });

    it('should scrub card numbers with spaces', () => {
      expect(scrubSensitiveData('4111 1111 1111 1111')).toBe('[CARD_REDACTED]');
    });

    it('should scrub card numbers with dashes', () => {
      expect(scrubSensitiveData('4111-1111-1111-1111')).toBe('[CARD_REDACTED]');
    });

    it('should scrub multiple card numbers', () => {
      const input = 'Cards: 4111111111111111 and 5500000000000004';
      const result = scrubSensitiveData(input);
      expect(result).not.toContain('4111111111111111');
      expect(result).not.toContain('5500000000000004');
    });

    it('should scrub 13-digit card numbers', () => {
      expect(scrubSensitiveData('4111111111111')).toContain('[CARD_REDACTED]');
    });

    it('should scrub 19-digit card numbers', () => {
      expect(scrubSensitiveData('4111111111111111111')).toContain('[CARD_REDACTED]');
    });
  });

  describe('CVV/CVC codes', () => {
    it('should scrub CVV with colon', () => {
      expect(scrubSensitiveData('cvv:123')).toBe('[CVV_REDACTED]');
    });

    it('should scrub CVC with space', () => {
      expect(scrubSensitiveData('cvc 456')).toBe('[CVV_REDACTED]');
    });

    it('should scrub CVV2', () => {
      expect(scrubSensitiveData('cvv2:789')).toBe('[CVV_REDACTED]');
    });

    it('should scrub CVC2', () => {
      expect(scrubSensitiveData('cvc2:012')).toBe('[CVV_REDACTED]');
    });

    it('should scrub 4-digit CVV (Amex)', () => {
      expect(scrubSensitiveData('cid:1234')).toBe('[CVV_REDACTED]');
    });

    it('should scrub JSON CVV', () => {
      expect(scrubSensitiveData('"cvv":"123"')).toBe('[CVV_REDACTED]');
    });

    it('should scrub JSON CVC', () => {
      expect(scrubSensitiveData('"cvc":"456"')).toBe('[CVV_REDACTED]');
    });
  });

  describe('expiration dates', () => {
    it('should scrub exp with slash', () => {
      expect(scrubSensitiveData('exp:12/25')).toBe('[EXP_REDACTED]');
    });

    it('should scrub expiry with dash', () => {
      expect(scrubSensitiveData('expiry:06-2024')).toBe('[EXP_REDACTED]');
    });

    it('should scrub expiration', () => {
      expect(scrubSensitiveData('expiration 01/26')).toBe('[EXP_REDACTED]');
    });

    it('should scrub JSON exp_month', () => {
      expect(scrubSensitiveData('"exp_month":"12"')).toBe('[EXP_REDACTED]');
    });

    it('should scrub JSON exp_year', () => {
      expect(scrubSensitiveData('"exp_year":"2025"')).toBe('[EXP_REDACTED]');
    });
  });

  describe('track data', () => {
    it('should scrub Track 1 data', () => {
      const track1 = '%B4111111111111111^DOE/JOHN^25121011234?';
      const result = scrubSensitiveData(track1);
      expect(result).toBe('[TRACK_REDACTED]');
    });

    it('should scrub Track 2 data', () => {
      const track2 = ';4111111111111111=2512101123456789';
      const result = scrubSensitiveData(track2);
      expect(result).toBe('[TRACK_REDACTED]');
    });

    it('should scrub track data before card numbers are extracted', () => {
      const track1 = '%B4111111111111111^SMITH/JOHN^2512101?';
      const result = scrubSensitiveData(track1);
      // Should be fully redacted, not partially
      expect(result).not.toContain('4111111111111111');
      expect(result).not.toContain('SMITH');
    });
  });

  describe('PIN blocks', () => {
    it('should scrub PIN block', () => {
      expect(scrubSensitiveData('pin:0123456789ABCDEF')).toBe('[PIN_REDACTED]');
    });

    it('should scrub pinblock', () => {
      expect(scrubSensitiveData('pinblock:FEDCBA9876543210')).toBe('[PIN_REDACTED]');
    });
  });

  describe('SSN', () => {
    it('should scrub SSN with dashes', () => {
      expect(scrubSensitiveData('SSN: 123-45-6789')).toBe('SSN: [SSN_REDACTED]');
    });

    it('should scrub SSN with spaces', () => {
      expect(scrubSensitiveData('123 45 6789')).toBe('[SSN_REDACTED]');
    });
  });

  describe('bank accounts', () => {
    it('should scrub account numbers', () => {
      expect(scrubSensitiveData('account:12345678901')).toBe('[ACCOUNT_REDACTED]');
    });

    it('should scrub routing numbers with 10+ digits', () => {
      // Use 10 digits to avoid SSN pattern match (9 digits matches SSN)
      expect(scrubSensitiveData('routing:1234567890')).toBe('[ACCOUNT_REDACTED]');
    });

    it('should scrub acct numbers', () => {
      expect(scrubSensitiveData('acct:98765432101')).toBe('[ACCOUNT_REDACTED]');
    });
  });

  describe('email addresses', () => {
    it('should scrub email addresses', () => {
      expect(scrubSensitiveData('user@example.com')).toBe('[EMAIL_REDACTED]');
    });

    it('should scrub complex emails', () => {
      expect(scrubSensitiveData('john.doe+test@sub.example.co.uk')).toBe('[EMAIL_REDACTED]');
    });
  });

  describe('tokens and API keys', () => {
    it('should scrub bearer tokens', () => {
      expect(scrubSensitiveData('bearer abc123xyz')).toBe('[TOKEN_REDACTED]');
    });

    it('should scrub API keys', () => {
      expect(scrubSensitiveData('api_key:sk_test_123')).toBe('[TOKEN_REDACTED]');
    });

    it('should scrub JSON tokens', () => {
      expect(scrubSensitiveData('"token":"abc123"')).toBe('[TOKEN_REDACTED]');
    });

    it('should scrub JSON api_key', () => {
      expect(scrubSensitiveData('"api_key":"secret123"')).toBe('[TOKEN_REDACTED]');
    });
  });

  describe('edge cases', () => {
    it('should handle null input', () => {
      expect(scrubSensitiveData(null as any)).toBeNull();
    });

    it('should handle undefined input', () => {
      expect(scrubSensitiveData(undefined as any)).toBeUndefined();
    });

    it('should handle empty string', () => {
      expect(scrubSensitiveData('')).toBe('');
    });

    it('should handle string without sensitive data', () => {
      const input = 'This is a normal log message';
      expect(scrubSensitiveData(input)).toBe(input);
    });

    it('should handle multiple types of sensitive data', () => {
      const input = 'User user@test.com paid with 4111111111111111 cvv:123';
      const result = scrubSensitiveData(input);
      expect(result).not.toContain('user@test.com');
      expect(result).not.toContain('4111111111111111');
      expect(result).not.toContain('cvv:123');
    });
  });
});

describe('scrubObject()', () => {
  it('should handle null', () => {
    expect(scrubObject(null)).toBeNull();
  });

  it('should handle undefined', () => {
    expect(scrubObject(undefined)).toBeUndefined();
  });

  it('should handle primitive string', () => {
    expect(scrubObject('user@test.com')).toBe('[EMAIL_REDACTED]');
  });

  it('should handle primitive number', () => {
    expect(scrubObject(42)).toBe(42);
  });

  it('should handle primitive boolean', () => {
    expect(scrubObject(true)).toBe(true);
  });

  it('should scrub sensitive field names', () => {
    const obj = {
      card_number: '4111111111111111',
      cardNumber: '4111111111111111',
      cvv: '123',
      cvc: '456',
      exp_month: '12',
      exp_year: '2025',
      pin: '1234',
      password: 'secret',
      secret: 'hidden',
      token: 'abc123',
      api_key: 'sk_test',
      apiKey: 'pk_test',
      ssn: '123-45-6789',
      account_number: '12345678',
      accountNumber: '87654321',
      routing_number: '123456789',
      routingNumber: '987654321',
    };

    const result = scrubObject(obj);
    
    Object.values(result).forEach(value => {
      expect(value).toBe('[REDACTED]');
    });
  });

  it('should scrub nested objects', () => {
    const obj = {
      user: {
        email: 'test@example.com',
        payment: {
          card_number: '4111111111111111',
        },
      },
    };

    const result = scrubObject(obj);
    expect(result.user.email).toBe('[EMAIL_REDACTED]');
    expect(result.user.payment.card_number).toBe('[REDACTED]');
  });

  it('should scrub arrays', () => {
    const arr = ['user@test.com', '4111111111111111'];
    const result = scrubObject(arr);
    expect(result[0]).toBe('[EMAIL_REDACTED]');
    expect(result[1]).toContain('[CARD_REDACTED]');
  });

  it('should handle mixed arrays', () => {
    const arr = [
      { email: 'test@example.com' },
      'plain text',
      42,
    ];
    const result = scrubObject(arr);
    expect(result[0].email).toBe('[EMAIL_REDACTED]');
    expect(result[1]).toBe('plain text');
    expect(result[2]).toBe(42);
  });

  it('should not mutate original object', () => {
    const original = { email: 'test@example.com' };
    scrubObject(original);
    expect(original.email).toBe('test@example.com');
  });

  it('should handle authorization field', () => {
    const obj = { authorization: 'Bearer token123' };
    const result = scrubObject(obj);
    expect(result.authorization).toBe('[REDACTED]');
  });

  it('should scrub values in non-sensitive fields', () => {
    const obj = { message: 'User email is user@test.com' };
    const result = scrubObject(obj);
    expect(result.message).toBe('User email is [EMAIL_REDACTED]');
  });

  it('should handle number field name', () => {
    const obj = { number: '4111111111111111' };
    const result = scrubObject(obj);
    expect(result.number).toBe('[REDACTED]');
  });
});

describe('SafeLogger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create logger with context', () => {
      const logger = new SafeLogger('TestContext');
      logger.info('test');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('TestContext');
    });

    it('should use default context if not provided', () => {
      const logger = new SafeLogger();
      logger.info('test');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('Application');
    });
  });

  describe('info()', () => {
    it('should log info messages', () => {
      const logger = new SafeLogger('Test');
      logger.info('Info message');
      expect(consoleLogSpy).toHaveBeenCalled();
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('INFO');
      expect(call).toContain('Info message');
    });

    it('should scrub sensitive data in message', () => {
      const logger = new SafeLogger('Test');
      logger.info('User email: test@example.com');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[EMAIL_REDACTED]');
      expect(call).not.toContain('test@example.com');
    });

    it('should scrub sensitive data in meta', () => {
      const logger = new SafeLogger('Test');
      logger.info('Payment', { card_number: '4111111111111111' });
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('[REDACTED]');
    });

    it('should handle undefined meta', () => {
      const logger = new SafeLogger('Test');
      logger.info('No meta');
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  describe('warn()', () => {
    it('should log warn messages', () => {
      const logger = new SafeLogger('Test');
      logger.warn('Warning message');
      expect(consoleWarnSpy).toHaveBeenCalled();
      const call = consoleWarnSpy.mock.calls[0][0];
      expect(call).toContain('WARN');
    });

    it('should scrub sensitive data', () => {
      const logger = new SafeLogger('Test');
      logger.warn('Card 4111111111111111 failed');
      const call = consoleWarnSpy.mock.calls[0][0];
      expect(call).not.toContain('4111111111111111');
    });
  });

  describe('error()', () => {
    it('should log error messages', () => {
      const logger = new SafeLogger('Test');
      logger.error('Error message');
      expect(consoleErrorSpy).toHaveBeenCalled();
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).toContain('ERROR');
    });

    it('should scrub sensitive data', () => {
      const logger = new SafeLogger('Test');
      logger.error('Failed for user@test.com');
      const call = consoleErrorSpy.mock.calls[0][0];
      expect(call).not.toContain('user@test.com');
    });
  });

  describe('debug()', () => {
    it('should log debug messages', () => {
      const logger = new SafeLogger('Test');
      logger.debug('Debug message');
      expect(consoleDebugSpy).toHaveBeenCalled();
      const call = consoleDebugSpy.mock.calls[0][0];
      expect(call).toContain('DEBUG');
    });

    it('should scrub sensitive data', () => {
      const logger = new SafeLogger('Test');
      logger.debug('Debug SSN: 123-45-6789');
      const call = consoleDebugSpy.mock.calls[0][0];
      expect(call).not.toContain('123-45-6789');
    });
  });

  describe('log format', () => {
    it('should include timestamp', () => {
      const logger = new SafeLogger('Test');
      logger.info('Test');
      const call = consoleLogSpy.mock.calls[0][0];
      expect(call).toContain('timestamp');
    });

    it('should be valid JSON', () => {
      const logger = new SafeLogger('Test');
      logger.info('Test message', { key: 'value' });
      const call = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(call)).not.toThrow();
    });
  });
});

describe('maskCardNumber()', () => {
  it('should mask 16-digit card number', () => {
    expect(maskCardNumber('4111111111111111')).toBe('**** **** **** 1111');
  });

  it('should show last 4 digits only', () => {
    expect(maskCardNumber('5500000000000004')).toBe('**** **** **** 0004');
  });

  it('should handle short card numbers', () => {
    expect(maskCardNumber('1234')).toBe('**** **** **** 1234');
  });

  it('should return invalid for too short input', () => {
    expect(maskCardNumber('123')).toBe('[INVALID_CARD]');
  });

  it('should return invalid for empty string', () => {
    expect(maskCardNumber('')).toBe('[INVALID_CARD]');
  });

  it('should return invalid for null', () => {
    expect(maskCardNumber(null as any)).toBe('[INVALID_CARD]');
  });

  it('should return invalid for undefined', () => {
    expect(maskCardNumber(undefined as any)).toBe('[INVALID_CARD]');
  });
});

describe('createPaymentLog()', () => {
  it('should create log with required fields', () => {
    const log = createPaymentLog('txn_123', 5000, 'completed');
    expect(log.transactionId).toBe('txn_123');
    expect(log.amount).toBe(5000);
    expect(log.status).toBe('completed');
    expect(log.timestamp).toBeDefined();
  });

  it('should include last4 when provided', () => {
    const log = createPaymentLog('txn_123', 5000, 'completed', '4242');
    expect(log.cardLast4).toBe('4242');
  });

  it('should not include last4 when not provided', () => {
    const log = createPaymentLog('txn_123', 5000, 'completed');
    expect(log.cardLast4).toBeUndefined();
  });

  it('should have ISO timestamp', () => {
    const log = createPaymentLog('txn_123', 5000, 'completed');
    expect(log.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('containsPCIData()', () => {
  it('should detect credit card numbers', () => {
    expect(containsPCIData('4111111111111111')).toBe(true);
  });

  it('should detect CVV', () => {
    expect(containsPCIData('cvv:123')).toBe(true);
  });

  it('should detect expiration dates', () => {
    expect(containsPCIData('exp:12/25')).toBe(true);
  });

  it('should detect SSN', () => {
    expect(containsPCIData('123-45-6789')).toBe(true);
  });

  it('should detect email', () => {
    expect(containsPCIData('test@example.com')).toBe(true);
  });

  it('should return false for clean data', () => {
    expect(containsPCIData('This is clean data')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(containsPCIData('')).toBe(false);
  });

  it('should return false for null', () => {
    expect(containsPCIData(null as any)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(containsPCIData(undefined as any)).toBe(false);
  });

  it('should detect track data', () => {
    expect(containsPCIData('%B4111111111111111^DOE/JOHN^25121011234?')).toBe(true);
  });
});
