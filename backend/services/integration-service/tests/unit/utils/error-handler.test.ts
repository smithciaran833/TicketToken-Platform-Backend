import {
  ErrorHandler,
  ErrorCategory,
  ErrorSeverity,
  CategorizedError,
} from '../../../src/utils/error-handler';

describe('ErrorHandler', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('categorize', () => {
    describe('authentication errors', () => {
      const authMessages = [
        'Unauthorized access',
        'Authentication failed',
        'Invalid token provided',
        'Expired token',
        'Invalid credentials',
      ];

      it.each(authMessages)('should categorize "%s" as AUTHENTICATION', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
        expect(result.retryable).toBe(false);
      });
    });

    describe('authorization errors', () => {
      const authzMessages = [
        'Forbidden resource',
        'Access denied',
        'Permission required',
      ];

      it.each(authzMessages)('should categorize "%s" as AUTHORIZATION', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.AUTHORIZATION);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
        expect(result.retryable).toBe(false);
      });
    });

    describe('rate limit errors', () => {
      const rateLimitMessages = [
        'Rate limit exceeded',
        'Too many requests',
        'Error 429 returned',
      ];

      it.each(rateLimitMessages)('should categorize "%s" as RATE_LIMIT', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.retryable).toBe(true);
        expect(result.retryAfter).toBeDefined();
      });

      it('should extract retry after value from message', () => {
        const error = new Error('Rate limit exceeded. Retry after 120 seconds');
        const result = ErrorHandler.categorize(error);

        expect(result.retryAfter).toBe(120);
      });

      it('should default to 60 seconds when no retry after in message', () => {
        const error = new Error('Rate limit exceeded');
        const result = ErrorHandler.categorize(error);

        expect(result.retryAfter).toBe(60);
      });
    });

    describe('validation errors', () => {
      const validationMessages = [
        'Validation failed',
        'Invalid input data',
        'Missing required field',
        'Bad request',
        'Error 400',
      ];

      it.each(validationMessages)('should categorize "%s" as VALIDATION', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.VALIDATION);
        expect(result.severity).toBe(ErrorSeverity.LOW);
        expect(result.retryable).toBe(false);
      });
    });

    describe('network errors', () => {
      const networkMessages = [
        'Network error occurred',
        'Request timeout',
        'ECONNREFUSED',
        'Socket hang up',
        'DNS lookup failed',
      ];

      it.each(networkMessages)('should categorize "%s" as NETWORK', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.NETWORK);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.retryable).toBe(true);
        expect(result.retryAfter).toBe(30);
      });
    });

    describe('provider errors', () => {
      const providerMessages = [
        'Error 500 from server',
        'Error 503',
        'Internal server error',
        'Service unavailable',
      ];

      it.each(providerMessages)('should categorize "%s" as PROVIDER_ERROR', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.PROVIDER_ERROR);
        expect(result.severity).toBe(ErrorSeverity.HIGH);
        expect(result.retryable).toBe(true);
        expect(result.retryAfter).toBe(60);
      });
    });

    describe('data errors', () => {
      const dataMessages = [
        'Data corruption detected',
        'Parsing error',
        'JSON syntax error',
      ];

      it.each(dataMessages)('should categorize "%s" as DATA_ERROR', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.DATA_ERROR);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.retryable).toBe(false);
      });

      it('should categorize "Invalid JSON response" as VALIDATION due to keyword priority', () => {
        const error = new Error('Invalid JSON response');
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.VALIDATION);
      });
    });

    describe('configuration errors', () => {
      const configMessages = [
        'Configuration error',
        'Service not configured',
        'Missing API key',
      ];

      it.each(configMessages)('should categorize "%s" as CONFIGURATION', (msg) => {
        const error = new Error(msg);
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.CONFIGURATION);
        expect(result.severity).toBe(ErrorSeverity.CRITICAL);
        expect(result.retryable).toBe(false);
      });
    });

    describe('unknown errors', () => {
      it('should categorize unrecognized errors as UNKNOWN', () => {
        const error = new Error('Some random error happened');
        const result = ErrorHandler.categorize(error);

        expect(result.category).toBe(ErrorCategory.UNKNOWN);
        expect(result.severity).toBe(ErrorSeverity.MEDIUM);
        expect(result.retryable).toBe(false);
      });
    });

    describe('result structure', () => {
      it('should include all required fields in result', () => {
        const error = new Error('Test error');
        const result = ErrorHandler.categorize(error, 'stripe', 'createPayment');

        expect(result.category).toBeDefined();
        expect(result.severity).toBeDefined();
        expect(result.message).toBe('Test error');
        expect(result.originalError).toBe(error);
        expect(result.retryable).toBeDefined();
        expect(result.provider).toBe('stripe');
        expect(result.operation).toBe('createPayment');
        expect(result.timestamp).toBeInstanceOf(Date);
      });

      it('should work without provider and operation', () => {
        const error = new Error('Test error');
        const result = ErrorHandler.categorize(error);

        expect(result.provider).toBeUndefined();
        expect(result.operation).toBeUndefined();
      });
    });
  });

  describe('handle', () => {
    it('should categorize and log error', async () => {
      const error = new Error('Network timeout');
      const result = await ErrorHandler.handle(error, 'square', 'fetchOrders');

      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MEDIUM] network: Network timeout',
        expect.objectContaining({
          provider: 'square',
          operation: 'fetchOrders',
          retryable: true,
        })
      );
    });

    it('should send alert for HIGH severity errors', async () => {
      const error = new Error('Internal server error');
      await ErrorHandler.handle(error, 'quickbooks', 'sync');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'ALERT:',
        expect.objectContaining({
          category: ErrorCategory.PROVIDER_ERROR,
          severity: ErrorSeverity.HIGH,
        })
      );
    });

    it('should send alert for CRITICAL severity errors', async () => {
      const error = new Error('Configuration error');
      await ErrorHandler.handle(error, 'mailchimp', 'connect');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'ALERT:',
        expect.objectContaining({
          category: ErrorCategory.CONFIGURATION,
          severity: ErrorSeverity.CRITICAL,
        })
      );
    });

    it('should not send alert for LOW severity errors', async () => {
      const error = new Error('Validation failed');
      await ErrorHandler.handle(error, 'stripe', 'createCustomer');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not send alert for MEDIUM severity errors', async () => {
      const error = new Error('Some unknown error');
      await ErrorHandler.handle(error, 'stripe', 'refund');

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('getUserMessage', () => {
    it('should return message for AUTHENTICATION errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        message: 'Token expired',
        originalError: new Error('Token expired'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('Authentication failed. Please check your credentials and try again.');
    });

    it('should return message for AUTHORIZATION errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
        message: 'Forbidden',
        originalError: new Error('Forbidden'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('You do not have permission to perform this operation.');
    });

    it('should return message for RATE_LIMIT errors with retryAfter', () => {
      const error: CategorizedError = {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Too many requests',
        originalError: new Error('Too many requests'),
        retryable: true,
        retryAfter: 120,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('Rate limit exceeded. Please try again in 120 seconds.');
    });

    it('should return message for RATE_LIMIT errors without retryAfter', () => {
      const error: CategorizedError = {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Too many requests',
        originalError: new Error('Too many requests'),
        retryable: true,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('Rate limit exceeded. Please try again in 60 seconds.');
    });

    it('should return message for VALIDATION errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        message: 'Invalid input',
        originalError: new Error('Invalid input'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('Invalid data provided. Please check your input and try again.');
    });

    it('should return message for NETWORK errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'Timeout',
        originalError: new Error('Timeout'),
        retryable: true,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('Network error occurred. Please check your connection and try again.');
    });

    it('should return message for PROVIDER_ERROR errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.PROVIDER_ERROR,
        severity: ErrorSeverity.HIGH,
        message: '500 Error',
        originalError: new Error('500 Error'),
        retryable: true,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('The service is temporarily unavailable. Please try again later.');
    });

    it('should return message for DATA_ERROR errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.DATA_ERROR,
        severity: ErrorSeverity.MEDIUM,
        message: 'JSON parse error',
        originalError: new Error('JSON parse error'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('Error processing data. Please contact support if the issue persists.');
    });

    it('should return message for CONFIGURATION errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.CRITICAL,
        message: 'Not configured',
        originalError: new Error('Not configured'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('System configuration error. Please contact support.');
    });

    it('should return message for UNKNOWN errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.MEDIUM,
        message: 'Something went wrong',
        originalError: new Error('Something went wrong'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);
      expect(message).toBe('An unexpected error occurred. Please try again or contact support.');
    });
  });

  describe('shouldRetry', () => {
    it('should return false for non-retryable errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        message: 'Unauthorized',
        originalError: new Error('Unauthorized'),
        retryable: false,
        timestamp: new Date(),
      };

      expect(ErrorHandler.shouldRetry(error, 1)).toBe(false);
    });

    it('should return false for CRITICAL severity errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.CRITICAL,
        message: 'Config error',
        originalError: new Error('Config error'),
        retryable: true,
        timestamp: new Date(),
      };

      expect(ErrorHandler.shouldRetry(error, 0)).toBe(false);
    });

    it('should return true for retryable errors within max attempts', () => {
      const error: CategorizedError = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'Timeout',
        originalError: new Error('Timeout'),
        retryable: true,
        timestamp: new Date(),
      };

      expect(ErrorHandler.shouldRetry(error, 1)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 2)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 3)).toBe(false);
    });

    it('should allow up to 3 retries for non-critical errors', () => {
      const error: CategorizedError = {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Rate limited',
        originalError: new Error('Rate limited'),
        retryable: true,
        timestamp: new Date(),
      };

      expect(ErrorHandler.shouldRetry(error, 0)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 1)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 2)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 3)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should use retryAfter value when present', () => {
      const error: CategorizedError = {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Rate limited',
        originalError: new Error('Rate limited'),
        retryable: true,
        retryAfter: 120,
        timestamp: new Date(),
      };

      const delay = ErrorHandler.getRetryDelay(error, 0);
      expect(delay).toBe(120000);
    });

    it('should use exponential backoff when no retryAfter', () => {
      const error: CategorizedError = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'Timeout',
        originalError: new Error('Timeout'),
        retryable: true,
        timestamp: new Date(),
      };

      expect(ErrorHandler.getRetryDelay(error, 0)).toBe(1000);
      expect(ErrorHandler.getRetryDelay(error, 1)).toBe(2000);
      expect(ErrorHandler.getRetryDelay(error, 2)).toBe(4000);
      expect(ErrorHandler.getRetryDelay(error, 3)).toBe(8000);
    });

    it('should cap delay at 60 seconds', () => {
      const error: CategorizedError = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: 'Timeout',
        originalError: new Error('Timeout'),
        retryable: true,
        timestamp: new Date(),
      };

      expect(ErrorHandler.getRetryDelay(error, 10)).toBe(60000);
    });
  });

  describe('executeWithRetry', () => {
    let originalSetTimeout: typeof setTimeout;

    beforeEach(() => {
      originalSetTimeout = global.setTimeout;
      // Mock setTimeout to resolve immediately
      global.setTimeout = ((fn: () => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout;
    });

    afterEach(() => {
      global.setTimeout = originalSetTimeout;
    });

    it('should return result on first successful attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      const result = await ErrorHandler.executeWithRetry(fn, 'stripe', 'charge');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable failure and succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('success');

      const result = await ErrorHandler.executeWithRetry(fn, 'stripe', 'charge');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts exhausted', async () => {
      const error = new Error('Network timeout');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        ErrorHandler.executeWithRetry(fn, 'stripe', 'charge', 3)
      ).rejects.toThrow('Network timeout');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw immediately for non-retryable errors', async () => {
      const error = new Error('Unauthorized');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        ErrorHandler.executeWithRetry(fn, 'stripe', 'charge')
      ).rejects.toThrow('Unauthorized');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should log retry attempts', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('success');

      await ErrorHandler.executeWithRetry(fn, 'stripe', 'charge');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Retrying operation after \d+ms \(attempt \d+\/\d+\)/)
      );
    });

    it('should respect shouldRetry max of 3 attempts', async () => {
      const error = new Error('Network timeout');
      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        ErrorHandler.executeWithRetry(fn, 'stripe', 'charge', 10)
      ).rejects.toThrow('Network timeout');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should handle errors without provider and operation', async () => {
      const fn = jest.fn().mockResolvedValue('done');

      const result = await ErrorHandler.executeWithRetry(fn);

      expect(result).toBe('done');
    });

    it('should call handle for each failed attempt', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce('success');

      await ErrorHandler.executeWithRetry(fn, 'stripe', 'charge');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });
  });
});
