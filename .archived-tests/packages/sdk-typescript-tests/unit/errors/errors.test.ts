import {
  TicketTokenError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ServerError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
  handleAPIError,
} from '../../../src/errors';
import { createAxiosError, createNetworkError, createTimeoutError } from '../../setup';

describe('Error Classes', () => {
  describe('TicketTokenError', () => {
    it('should create base error with message', () => {
      const error = new TicketTokenError('Test error');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('TicketTokenError');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBeUndefined();
      expect(error.code).toBeUndefined();
    });

    it('should create error with all properties', () => {
      const error = new TicketTokenError('Test error', 400, 'TEST_CODE', { foo: 'bar' });
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ foo: 'bar' });
    });

    it('should maintain stack trace', () => {
      const error = new TicketTokenError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TicketTokenError');
    });
  });

  describe('AuthenticationError', () => {
    it('should create with default message', () => {
      const error = new AuthenticationError();
      expect(error).toBeInstanceOf(TicketTokenError);
      expect(error.name).toBe('AuthenticationError');
      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('AUTHENTICATION_ERROR');
    });

    it('should create with custom message', () => {
      const error = new AuthenticationError('Invalid API key');
      expect(error.message).toBe('Invalid API key');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('AuthorizationError', () => {
    it('should create with correct properties', () => {
      const error = new AuthorizationError('Access denied');
      expect(error.name).toBe('AuthorizationError');
      expect(error.message).toBe('Access denied');
      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('AUTHORIZATION_ERROR');
    });
  });

  describe('NotFoundError', () => {
    it('should create with correct properties', () => {
      const error = new NotFoundError('Event not found');
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe('Event not found');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });

  describe('ValidationError', () => {
    it('should create with validation details', () => {
      const details = { field: 'email', message: 'Invalid format' };
      const error = new ValidationError('Validation failed', details);
      expect(error.name).toBe('ValidationError');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toEqual(details);
    });
  });

  describe('RateLimitError', () => {
    it('should create with retryAfter', () => {
      const error = new RateLimitError('Rate limit exceeded', 60);
      expect(error.name).toBe('RateLimitError');
      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.retryAfter).toBe(60);
    });

    it('should create without retryAfter', () => {
      const error = new RateLimitError();
      expect(error.retryAfter).toBeUndefined();
    });
  });

  describe('ServerError', () => {
    it('should create with default status 500', () => {
      const error = new ServerError();
      expect(error.name).toBe('ServerError');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('SERVER_ERROR');
    });

    it('should create with custom status code', () => {
      const error = new ServerError('Service unavailable', 503);
      expect(error.message).toBe('Service unavailable');
      expect(error.statusCode).toBe(503);
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection failed');
      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.statusCode).toBeUndefined();
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error', () => {
      const error = new TimeoutError();
      expect(error.name).toBe('TimeoutError');
      expect(error.statusCode).toBe(408);
      expect(error.code).toBe('TIMEOUT_ERROR');
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Invalid configuration');
      expect(error.name).toBe('ConfigurationError');
      expect(error.code).toBe('CONFIGURATION_ERROR');
      expect(error.statusCode).toBeUndefined();
    });
  });
});

describe('handleAPIError', () => {
  it('should throw ValidationError for 400 status', () => {
    const axiosError = createAxiosError(400, 'Validation failed');
    expect(() => handleAPIError(axiosError)).toThrow(ValidationError);
  });

  it('should throw AuthenticationError for 401 status', () => {
    const axiosError = createAxiosError(401, 'Unauthorized');
    expect(() => handleAPIError(axiosError)).toThrow(AuthenticationError);
  });

  it('should throw AuthorizationError for 403 status', () => {
    const axiosError = createAxiosError(403, 'Forbidden');
    expect(() => handleAPIError(axiosError)).toThrow(AuthorizationError);
  });

  it('should throw NotFoundError for 404 status', () => {
    const axiosError = createAxiosError(404, 'Not found');
    expect(() => handleAPIError(axiosError)).toThrow(NotFoundError);
  });

  it('should throw TimeoutError for 408 status', () => {
    const axiosError = createAxiosError(408, 'Request timeout');
    expect(() => handleAPIError(axiosError)).toThrow(TimeoutError);
  });

  it('should throw RateLimitError for 429 status with retry-after header', () => {
    const axiosError = createAxiosError(429, 'Rate limit exceeded');
    axiosError.response.headers['retry-after'] = '60';
    
    try {
      handleAPIError(axiosError);
      fail('Should have thrown RateLimitError');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).retryAfter).toBe(60);
    }
  });

  it('should throw ServerError for 500 status', () => {
    const axiosError = createAxiosError(500, 'Internal server error');
    expect(() => handleAPIError(axiosError)).toThrow(ServerError);
  });

  it('should throw ServerError for 503 status', () => {
    const axiosError = createAxiosError(503, 'Service unavailable');
    
    try {
      handleAPIError(axiosError);
      fail('Should have thrown ServerError');
    } catch (error) {
      expect(error).toBeInstanceOf(ServerError);
      expect((error as ServerError).statusCode).toBe(503);
    }
  });

  it('should throw generic TicketTokenError for other status codes', () => {
    const axiosError = createAxiosError(418, 'I\'m a teapot');
    
    try {
      handleAPIError(axiosError);
      fail('Should have thrown TicketTokenError');
    } catch (error) {
      expect(error).toBeInstanceOf(TicketTokenError);
      expect((error as TicketTokenError).statusCode).toBe(418);
    }
  });

  it('should throw NetworkError when no response received', () => {
    const axiosError = createNetworkError();
    expect(() => handleAPIError(axiosError)).toThrow(NetworkError);
  });

  it('should throw TimeoutError for ECONNABORTED code', () => {
    const axiosError = createTimeoutError();
    expect(() => handleAPIError(axiosError)).toThrow(TimeoutError);
  });

  it('should throw NetworkError for request setup errors', () => {
    const error: any = new Error('Request setup failed');
    error.config = {};
    
    expect(() => handleAPIError(error)).toThrow(NetworkError);
  });

  it('should extract error message from response data', () => {
    const axiosError = createAxiosError(400, 'Default message', {
      message: 'Custom error message',
    });
    
    try {
      handleAPIError(axiosError);
      fail('Should have thrown error');
    } catch (error) {
      expect((error as TicketTokenError).message).toBe('Custom error message');
    }
  });

  it('should use error field from response data if message not available', () => {
    const axiosError = createAxiosError(400, 'Default message', {
      error: 'Error from error field',
    });
    
    try {
      handleAPIError(axiosError);
      fail('Should have thrown error');
    } catch (error) {
      expect((error as TicketTokenError).message).toBe('Error from error field');
    }
  });

  it('should include details from response data', () => {
    const details = { field: 'email', issue: 'invalid format' };
    const axiosError = createAxiosError(400, 'Validation failed', {
      message: 'Validation failed',
      details,
    });
    
    try {
      handleAPIError(axiosError);
      fail('Should have thrown error');
    } catch (error) {
      expect((error as ValidationError).details).toEqual({
        message: 'Validation failed',
        details,
      });
    }
  });
});
