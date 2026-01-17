import axios from 'axios';
import { AuthServiceClient } from '../../../src/clients/AuthServiceClient';
import { getCircuitBreaker } from '../../../src/middleware/circuit-breaker.middleware';
import { generateInternalAuthHeaders } from '../../../src/utils/internal-auth';

jest.mock('axios');
jest.mock('../../../src/middleware/circuit-breaker.middleware');
jest.mock('../../../src/utils/internal-auth');
jest.mock('../../../src/config/services', () => ({
  serviceUrls: {
    auth: 'http://auth-service:3001',
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetCircuitBreaker = getCircuitBreaker as jest.MockedFunction<typeof getCircuitBreaker>;
const mockedGenerateInternalAuthHeaders = generateInternalAuthHeaders as jest.MockedFunction<typeof generateInternalAuthHeaders>;

describe('AuthServiceClient', () => {
  let client: AuthServiceClient;
  let mockServer: any;
  let mockHttpClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
    };

    mockedAxios.create.mockReturnValue(mockHttpClient as any);

    mockServer = {
      log: {
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
      },
    };

    mockedGenerateInternalAuthHeaders.mockReturnValue({
      'x-internal-service': 'api-gateway',
      'x-internal-timestamp': '123456789',
      'x-internal-signature': 'mock-signature',
    });

    // Default: no circuit breaker
    mockedGetCircuitBreaker.mockReturnValue(undefined);

    client = new AuthServiceClient(mockServer);
  });

  describe('constructor', () => {
    it('creates axios client with correct baseURL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('auth-service'),
        })
      );
    });

    it('sets timeout to 5000ms', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('sets Content-Type header to application/json', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });
  });

  describe('getUserById', () => {
    it('makes GET request to /users/:userId', async () => {
      mockHttpClient.get.mockResolvedValue({ data: { userId: 'user-123' } });

      await client.getUserById('user-123');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/users/user-123',
        expect.any(Object)
      );
    });

    it('includes internal auth headers', async () => {
      mockHttpClient.get.mockResolvedValue({ data: { userId: 'user-123' } });

      await client.getUserById('user-123');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: {
            'x-internal-service': 'api-gateway',
            'x-internal-timestamp': '123456789',
            'x-internal-signature': 'mock-signature',
          },
        })
      );
    });

    it('returns user data on success', async () => {
      const userData = { userId: 'user-123', email: 'test@example.com' };
      mockHttpClient.get.mockResolvedValue({ data: userData });

      const result = await client.getUserById('user-123');

      expect(result).toEqual(userData);
    });

    it('uses circuit breaker when available', async () => {
      const mockCircuitBreaker = { fire: jest.fn().mockResolvedValue({ userId: 'user-123' }) };
      mockedGetCircuitBreaker.mockReturnValue(mockCircuitBreaker as any);

      await client.getUserById('user-123');

      expect(mockCircuitBreaker.fire).toHaveBeenCalledWith(expect.any(Function));
    });

    it('returns null on 404 error', async () => {
      mockHttpClient.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 404 },
      });

      const result = await client.getUserById('user-123');

      expect(result).toBeNull();
    });

    it('returns null on ECONNREFUSED error', async () => {
      mockHttpClient.get.mockRejectedValue({
        isAxiosError: true,
        code: 'ECONNREFUSED',
      });

      const result = await client.getUserById('user-123');

      expect(result).toBeNull();
    });

    it('logs error on connection failure', async () => {
      mockHttpClient.get.mockRejectedValue({
        isAxiosError: true,
        code: 'ETIMEDOUT',
      });

      await client.getUserById('user-123');

      expect(mockServer.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'getUserById',
          error: 'Auth service unavailable',
          code: 'ETIMEDOUT',
        }),
        'AuthServiceClient error'
      );
    });
  });

  describe('validateToken', () => {
    it('makes POST request to /auth/validate', async () => {
      mockHttpClient.post.mockResolvedValue({ data: { valid: true } });

      await client.validateToken('test-token');

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/auth/validate',
        { token: 'test-token' },
        expect.any(Object)
      );
    });

    it('includes internal auth headers', async () => {
      mockHttpClient.post.mockResolvedValue({ data: { valid: true } });

      await client.validateToken('test-token');

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-service': 'api-gateway',
          }),
        })
      );
    });

    it('returns validation result on success', async () => {
      const validationResult = { valid: true, user: { userId: 'user-123' } };
      mockHttpClient.post.mockResolvedValue({ data: validationResult });

      const result = await client.validateToken('test-token');

      expect(result).toEqual(validationResult);
    });

    it('returns { valid: false } on error', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Service error'));

      const result = await client.validateToken('test-token');

      expect(result).toEqual({ valid: false });
    });

    it('uses circuit breaker when available', async () => {
      const mockCircuitBreaker = { fire: jest.fn().mockResolvedValue({ valid: true }) };
      mockedGetCircuitBreaker.mockReturnValue(mockCircuitBreaker as any);

      await client.validateToken('test-token');

      expect(mockCircuitBreaker.fire).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('healthCheck', () => {
    it('makes GET request to /health', async () => {
      mockHttpClient.get.mockResolvedValue({ status: 200 });

      await client.healthCheck();

      expect(mockHttpClient.get).toHaveBeenCalledWith('/health', { timeout: 2000 });
    });

    it('returns true when status is 200', async () => {
      mockHttpClient.get.mockResolvedValue({ status: 200 });

      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Connection failed'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });

    it('returns false when status is not 200', async () => {
      mockHttpClient.get.mockResolvedValue({ status: 500 });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });
});
