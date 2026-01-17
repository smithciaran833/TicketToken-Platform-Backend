import axios from 'axios';
import { VenueServiceClient } from '../../../src/clients/VenueServiceClient';
import { getCircuitBreaker } from '../../../src/middleware/circuit-breaker.middleware';
import { logSecurityEvent } from '../../../src/utils/logger';
import { generateInternalAuthHeaders } from '../../../src/utils/internal-auth';

jest.mock('axios');
jest.mock('../../../src/middleware/circuit-breaker.middleware');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/internal-auth');
jest.mock('../../../src/config/services', () => ({
  serviceUrls: {
    venue: 'http://venue-service:3002',
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedGetCircuitBreaker = getCircuitBreaker as jest.MockedFunction<typeof getCircuitBreaker>;
const mockedLogSecurityEvent = logSecurityEvent as jest.MockedFunction<typeof logSecurityEvent>;
const mockedGenerateInternalAuthHeaders = generateInternalAuthHeaders as jest.MockedFunction<typeof generateInternalAuthHeaders>;

describe('VenueServiceClient', () => {
  let client: VenueServiceClient;
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

    mockedGetCircuitBreaker.mockReturnValue(undefined);

    client = new VenueServiceClient(mockServer);
  });

  describe('constructor', () => {
    it('creates axios client with correct baseURL', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.stringContaining('venue-service'),
        })
      );
    });

    it('sets timeout to 3000ms', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 3000,
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

  describe('checkUserVenueAccess', () => {
    it('makes POST request to /internal/access-check', async () => {
      mockHttpClient.post.mockResolvedValue({ data: { hasAccess: true } });

      await client.checkUserVenueAccess('user-123', 'venue-456', 'read');

      expect(mockHttpClient.post).toHaveBeenCalledWith(
        '/internal/access-check',
        { userId: 'user-123', venueId: 'venue-456', permission: 'read' },
        expect.any(Object)
      );
    });

    it('includes internal auth headers', async () => {
      mockHttpClient.post.mockResolvedValue({ data: { hasAccess: true } });

      await client.checkUserVenueAccess('user-123', 'venue-456', 'read');

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

    it('returns true when access is granted', async () => {
      mockHttpClient.post.mockResolvedValue({ data: { hasAccess: true } });

      const result = await client.checkUserVenueAccess('user-123', 'venue-456', 'read');

      expect(result).toBe(true);
    });

    it('returns false when access is denied', async () => {
      mockHttpClient.post.mockResolvedValue({ data: { hasAccess: false } });

      const result = await client.checkUserVenueAccess('user-123', 'venue-456', 'write');

      expect(result).toBe(false);
    });

    it('logs security event when access is denied', async () => {
      mockHttpClient.post.mockResolvedValue({ data: { hasAccess: false } });

      await client.checkUserVenueAccess('user-123', 'venue-456', 'delete');

      expect(mockedLogSecurityEvent).toHaveBeenCalledWith(
        'venue_access_denied',
        expect.objectContaining({
          userId: 'user-123',
          venueId: 'venue-456',
          permission: 'delete',
        }),
        'medium'
      );
    });

    it('fails secure (returns false) on error', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Service error'));

      const result = await client.checkUserVenueAccess('user-123', 'venue-456', 'read');

      expect(result).toBe(false);
    });

    it('logs high severity security event on error', async () => {
      mockHttpClient.post.mockRejectedValue(new Error('Connection failed'));

      await client.checkUserVenueAccess('user-123', 'venue-456', 'read');

      expect(mockedLogSecurityEvent).toHaveBeenCalledWith(
        'venue_access_check_failed',
        expect.objectContaining({
          userId: 'user-123',
          venueId: 'venue-456',
          permission: 'read',
          error: 'Connection failed',
        }),
        'high'
      );
    });

    it('uses circuit breaker when available', async () => {
      const mockCircuitBreaker = { fire: jest.fn().mockResolvedValue({ hasAccess: true }) };
      mockedGetCircuitBreaker.mockReturnValue(mockCircuitBreaker as any);

      await client.checkUserVenueAccess('user-123', 'venue-456', 'read');

      expect(mockCircuitBreaker.fire).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('getUserVenues', () => {
    it('makes GET request to /internal/users/:userId/venues', async () => {
      mockHttpClient.get.mockResolvedValue({ data: [] });

      await client.getUserVenues('user-123');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/internal/users/user-123/venues',
        expect.any(Object)
      );
    });

    it('includes internal auth headers', async () => {
      mockHttpClient.get.mockResolvedValue({ data: [] });

      await client.getUserVenues('user-123');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-service': 'api-gateway',
          }),
        })
      );
    });

    it('returns venues array on success', async () => {
      const venues = [{ venueId: 'venue-1' }, { venueId: 'venue-2' }];
      mockHttpClient.get.mockResolvedValue({ data: venues });

      const result = await client.getUserVenues('user-123');

      expect(result).toEqual(venues);
    });

    it('returns empty array on error', async () => {
      mockHttpClient.get.mockRejectedValue(new Error('Service error'));

      const result = await client.getUserVenues('user-123');

      expect(result).toEqual([]);
    });

    it('uses circuit breaker when available', async () => {
      const mockCircuitBreaker = { fire: jest.fn().mockResolvedValue([]) };
      mockedGetCircuitBreaker.mockReturnValue(mockCircuitBreaker as any);

      await client.getUserVenues('user-123');

      expect(mockCircuitBreaker.fire).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('getVenueById', () => {
    it('makes GET request to /api/v1/venues/:venueId', async () => {
      mockHttpClient.get.mockResolvedValue({ data: { venueId: 'venue-123' } });

      await client.getVenueById('venue-123');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        '/api/v1/venues/venue-123',
        expect.any(Object)
      );
    });

    it('includes internal auth headers', async () => {
      mockHttpClient.get.mockResolvedValue({ data: { venueId: 'venue-123' } });

      await client.getVenueById('venue-123');

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-internal-service': 'api-gateway',
          }),
        })
      );
    });

    it('returns venue data on success', async () => {
      const venue = { venueId: 'venue-123', name: 'Test Venue' };
      mockHttpClient.get.mockResolvedValue({ data: venue });

      const result = await client.getVenueById('venue-123');

      expect(result).toEqual(venue);
    });

    it('returns null on 404 error', async () => {
      mockHttpClient.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 404 },
      });

      const result = await client.getVenueById('venue-123');

      expect(result).toBeNull();
    });

    it('returns null on connection error', async () => {
      mockHttpClient.get.mockRejectedValue({
        isAxiosError: true,
        code: 'ECONNREFUSED',
      });

      const result = await client.getVenueById('venue-123');

      expect(result).toBeNull();
    });

    it('uses circuit breaker when available', async () => {
      const mockCircuitBreaker = { fire: jest.fn().mockResolvedValue({ venueId: 'venue-123' }) };
      mockedGetCircuitBreaker.mockReturnValue(mockCircuitBreaker as any);

      await client.getVenueById('venue-123');

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
      mockHttpClient.get.mockResolvedValue({ status: 503 });

      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });
});
