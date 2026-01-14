import { ErrorHandler, ErrorCategory, ErrorSeverity } from '../../../src/utils/error-handler';

describe('ErrorHandler', () => {
  describe('categorize', () => {
    it('should categorize authentication errors', () => {
      const error = new Error('Unauthorized: Invalid token');
      
      const result = ErrorHandler.categorize(error, 'mailchimp', 'api_call');

      expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.retryable).toBe(false);
    });

    it('should categorize authorization errors', () => {
      const error = new Error('Forbidden: Access denied to resource');
      
      const result = ErrorHandler.categorize(error, 'quickbooks', 'get_customer');

      expect(result.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.retryable).toBe(false);
    });

    it('should categorize rate limit errors', () => {
      const error = new Error('Rate limit exceeded - 429');
      
      const result = ErrorHandler.categorize(error, 'stripe', 'create_charge');

      expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.retryable).toBe(true);
      expect(result.retryAfter).toBeDefined();
    });

    it('should categorize validation errors', () => {
      const error = new Error('Bad request: Missing required field email');
      
      const result = ErrorHandler.categorize(error, 'mailchimp', 'add_subscriber');

      expect(result.category).toBe(ErrorCategory.VALIDATION);
      expect(result.severity).toBe(ErrorSeverity.LOW);
      expect(result.retryable).toBe(false);
    });

    it('should categorize network errors', () => {
      const error = new Error('Network timeout occurred');
      
      const result = ErrorHandler.categorize(error, 'square', 'api_call');

      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.retryable).toBe(true);
      expect(result.retryAfter).toBe(30);
    });

    it('should categorize provider errors', () => {
      const error = new Error('500 Internal Server Error');
      
      const result = ErrorHandler.categorize(error, 'quickbooks', 'query_invoice');

      expect(result.category).toBe(ErrorCategory.PROVIDER_ERROR);
      expect(result.severity).toBe(ErrorSeverity.HIGH);
      expect(result.retryable).toBe(true);
      expect(result.retryAfter).toBe(60);
    });

    it('should categorize data errors', () => {
      const error = new Error('JSON parsing error: Unexpected token');
      
      const result = ErrorHandler.categorize(error, 'stripe', 'parse_webhook');

      expect(result.category).toBe(ErrorCategory.DATA_ERROR);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.retryable).toBe(false);
    });

    it('should categorize configuration errors', () => {
      const error = new Error('Configuration not configured for provider');
      
      const result = ErrorHandler.categorize(error);

      expect(result.category).toBe(ErrorCategory.CONFIGURATION);
      expect(result.severity).toBe(ErrorSeverity.CRITICAL);
      expect(result.retryable).toBe(false);
    });

    it('should categorize unknown errors', () => {
      const error = new Error('Something unexpected happened');
      
      const result = ErrorHandler.categorize(error);

      expect(result.category).toBe(ErrorCategory.UNKNOWN);
      expect(result.severity).toBe(ErrorSeverity.MEDIUM);
      expect(result.retryable).toBe(false);
    });

    it('should include timestamp', () => {
      const error = new Error('Test error');
      const before = new Date();
      
      const result = ErrorHandler.categorize(error);
      const after = new Date();

      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include provider and operation if provided', () => {
      const error = new Error('Test error');
      
      const result = ErrorHandler.categorize(error, 'mailchimp', 'sync_contacts');

      expect(result.provider).toBe('mailchimp');
      expect(result.operation).toBe('sync_contacts');
    });
  });

  describe('handle', () => {
    it('should log error details', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Test error');

      await ErrorHandler.handle(error, 'mailchimp', 'api_call');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should send alert for high severity errors', async () => {
      const sendAlertSpy = jest.spyOn(ErrorHandler as any, 'sendAlert').mockResolvedValue(undefined);
      const error = new Error('Unauthorized: Invalid credentials');

      await ErrorHandler.handle(error, 'stripe');

      expect(sendAlertSpy).toHaveBeenCalled();
      sendAlertSpy.mockRestore();
    });

    it('should send alert for critical severity errors', async () => {
      const sendAlertSpy = jest.spyOn(ErrorHandler as any, 'sendAlert').mockResolvedValue(undefined);
      const error = new Error('Configuration not found');

      await ErrorHandler.handle(error);

      expect(sendAlertSpy).toHaveBeenCalled();
      sendAlertSpy.mockRestore();
    });

    it('should not send alert for low severity errors', async () => {
      const sendAlertSpy = jest.spyOn(ErrorHandler as any, 'sendAlert').mockResolvedValue(undefined);
      const error = new Error('Validation failed: invalid email');

      await ErrorHandler.handle(error, 'mailchimp');

      expect(sendAlertSpy).not.toHaveBeenCalled();
      sendAlertSpy.mockRestore();
    });

    it('should return categorized error', async () => {
      const error = new Error('Network timeout');

      const result = await ErrorHandler.handle(error, 'quickbooks', 'query_data');

      expect(result.category).toBe(ErrorCategory.NETWORK);
      expect(result.provider).toBe('quickbooks');
      expect(result.operation).toBe('query_data');
    });
  });

  describe('getUserMessage', () => {
    it('should provide user-friendly authentication error message', () => {
      const error = {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        message: 'Unauthorized',
        originalError: new Error('Unauthorized'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toContain('credentials');
      expect(message).not.toContain('Unauthorized'); // Should not expose technical details
    });

    it('should provide user-friendly authorization error message', () => {
      const error = {
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
        message: 'Forbidden',
        originalError: new Error('Forbidden'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toContain('permission');
    });

    it('should provide user-friendly rate limit error message with retry time', () => {
      const error = {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        message: 'Rate limit exceeded',
        originalError: new Error('Rate limit exceeded'),
        retryable: true,
        retryAfter: 120,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toContain('Rate limit');
      expect(message).toContain('120 seconds');
    });

    it('should provide user-friendly configuration error message', () => {
      const error = {
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.CRITICAL,
        message: 'Missing config',
        originalError: new Error('Missing config'),
        retryable: false,
        timestamp: new Date(),
      };

      const message = ErrorHandler.getUserMessage(error);

      expect(message).toContain('configuration');
      expect(message).toContain('support');
    });
  });

  describe('shouldRetry', () => {
    it('should not retry non-retryable errors', () => {
      const error = {
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        message: '',
        originalError: new Error(),
        retryable: false,
        timestamp: new Date(),
      };

      expect(ErrorHandler.shouldRetry(error, 1)).toBe(false);
    });

    it('should retry retryable errors within max attempts', () => {
      const error = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: '',
        originalError: new Error(),
        retryable: true,
        timestamp: new Date(),
      };

      expect(ErrorHandler.shouldRetry(error, 1)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 2)).toBe(true);
      expect(ErrorHandler.shouldRetry(error, 3)).toBe(false); // Max is 3
    });

    it('should not retry critical errors even if retryable', () => {
      const error = {
        category: ErrorCategory.PROVIDER_ERROR,
        severity: ErrorSeverity.CRITICAL,
        message: '',
        originalError: new Error(),
        retryable: true,
        timestamp: new Date(),
      };

      expect(ErrorHandler.shouldRetry(error, 1)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should use retryAfter if provided', () => {
      const error = {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        message: '',
        originalError: new Error(),
        retryable: true,
        retryAfter: 45,
        timestamp: new Date(),
      };

      const delay = ErrorHandler.getRetryDelay(error, 1);

      expect(delay).toBe(45000); // 45 seconds in ms
    });

    it('should use exponential backoff if retryAfter not provided', () => {
      const error = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: '',
        originalError: new Error(),
        retryable: true,
        timestamp: new Date(),
      };

      const delay1 = ErrorHandler.getRetryDelay(error, 1);
      const delay2 = ErrorHandler.getRetryDelay(error, 2);
      const delay3 = ErrorHandler.getRetryDelay(error, 3);

      expect(delay1).toBe(2000); // 2^1 * 1000
      expect(delay2).toBe(4000); // 2^2 * 1000
      expect(delay3).toBe(8000); // 2^3 * 1000
    });

    it('should cap exponential backoff at 60 seconds', () => {
      const error = {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        message: '',
        originalError: new Error(),
        retryable: true,
        timestamp: new Date(),
      };

      const delay = ErrorHandler.getRetryDelay(error, 10); // Would be 1024s without cap

      expect(delay).toBe(60000); // Capped at 60 seconds
    });
  });

  describe('executeWithRetry', () => {
    it('should execute function successfully on first try', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await ErrorHandler.executeWithRetry(mockFn, 'mailchimp', 'sync');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success');

      const result = await ErrorHandler.executeWithRetry(mockFn, 'mailchimp', 'sync');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable error', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Unauthorized'));

      await expect(
        ErrorHandler.executeWithRetry(mockFn, 'mailchimp', 'sync')
      ).rejects.toThrow('Unauthorized');

      expect(mockFn).toHaveBeenCalledTimes(1); // No retry
    });

    it('should respect max attempts', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(
        ErrorHandler.executeWithRetry(mockFn, 'mailchimp', 'sync', 3)
      ).rejects.toThrow('Network timeout');

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should wait between retries', async () => {
      jest.useFakeTimers();
      
      const mockFn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success');

      const promise = ErrorHandler.executeWithRetry(mockFn, 'mailchimp', 'sync');

      // Advance time for retry delay
      jest.advanceTimersByTime(2000);

      const result = await promise;

      expect(result).toBe('success');
      
      jest.useRealTimers();
    });
  });

  describe('extractRetryAfter', () => {
    it('should extract retry-after from error message', () => {
      const message = 'Rate limit exceeded. Please retry after 120 seconds';
      
      const retryAfter = (ErrorHandler as any).extractRetryAfter(message);

      expect(retryAfter).toBe(120);
    });

    it('should return default 60 seconds if not found', () => {
      const message = 'Rate limit exceeded';
      
      const retryAfter = (ErrorHandler as any).extractRetryAfter(message);

      expect(retryAfter).toBe(60);
    });

    it('should handle case-insensitive matching', () => {
      const message = 'RETRY AFTER 30 seconds';
      
      const retryAfter = (ErrorHandler as any).extractRetryAfter(message);

      expect(retryAfter).toBe(30);
    });
  });
});
