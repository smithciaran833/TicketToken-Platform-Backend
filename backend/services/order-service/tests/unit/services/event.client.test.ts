/**
 * Unit Tests: Event Client
 * Tests event service client including circuit breaker, fallbacks, and error handling
 */

// Mock dependencies before imports
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
  getServiceUrl: jest.fn(() => 'http://localhost:3003'),
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  createCircuitBreaker: jest.fn((fn, options) => ({
    fire: jest.fn((...args) => fn(...args)),
    getState: jest.fn(() => 'CLOSED'),
    isOpen: jest.fn(() => false),
    reset: jest.fn(),
  })),
}));

import { EventClient } from '../../../src/services/event.client';
import { executeWithRetry } from '../../../src/utils/http-client.util';
import { logger } from '../../../src/utils/logger';

describe('EventClient', () => {
  let client: EventClient;
  let mockExecuteWithRetry: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteWithRetry = executeWithRetry as jest.Mock;
    client = new EventClient();
  });

  // ============================================
  // Constructor
  // ============================================
  describe('constructor', () => {
    it('should create secure service client', () => {
      const { createSecureServiceClient } = require('../../../src/utils/http-client.util');
      expect(createSecureServiceClient).toHaveBeenCalledWith({
        baseUrl: expect.any(String),
        serviceName: 'event-service',
        timeout: 5000,
      });
    });

    it('should create circuit breakers for operations', () => {
      const { createCircuitBreaker } = require('../../../src/utils/circuit-breaker');
      expect(createCircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ name: 'event-service-get-event' })
      );
      expect(createCircuitBreaker).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ name: 'event-service-get-status' })
      );
    });
  });

  // ============================================
  // getEvent
  // ============================================
  describe('getEvent', () => {
    it('should return event data on success', async () => {
      const eventData = {
        id: 'event-123',
        name: 'Summer Concert',
        date: '2024-07-15',
        venue: 'MSG',
      };
      mockExecuteWithRetry.mockResolvedValue({ data: eventData });

      const result = await client.getEvent('event-123');

      expect(result).toEqual(eventData);
    });

    it('should pass request context', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: {} });
      const context = { requestId: 'req-123', tenantId: 'tenant-456' };

      await client.getEvent('event-123', context);

      expect(mockExecuteWithRetry).toHaveBeenCalled();
    });

    it('should return null on error', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      const result = await client.getEvent('event-123');

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching event',
        expect.objectContaining({ eventId: 'event-123' })
      );
    });

    it('should use retry with correct parameters', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: {} });

      await client.getEvent('event-123');

      expect(mockExecuteWithRetry).toHaveBeenCalledWith(
        expect.any(Function),
        2,
        'event-service'
      );
    });
  });

  // ============================================
  // getEventStatus
  // ============================================
  describe('getEventStatus', () => {
    it('should return event status on success', async () => {
      const statusData = {
        status: 'active',
        isCancelled: false,
        isPostponed: false,
        isRescheduled: false,
      };
      mockExecuteWithRetry.mockResolvedValue({ data: statusData });

      const result = await client.getEventStatus('event-123');

      expect(result).toEqual(statusData);
    });

    it('should return cancelled status', async () => {
      const statusData = {
        status: 'cancelled',
        isCancelled: true,
        isPostponed: false,
        isRescheduled: false,
      };
      mockExecuteWithRetry.mockResolvedValue({ data: statusData });

      const result = await client.getEventStatus('event-123');

      expect(result.isCancelled).toBe(true);
    });

    it('should return postponed status with dates', async () => {
      const statusData = {
        status: 'postponed',
        isCancelled: false,
        isPostponed: true,
        isRescheduled: false,
        originalDate: '2024-07-15',
        newDate: '2024-08-15',
      };
      mockExecuteWithRetry.mockResolvedValue({ data: statusData });

      const result = await client.getEventStatus('event-123');

      expect(result.isPostponed).toBe(true);
      expect(result.originalDate).toBe('2024-07-15');
      expect(result.newDate).toBe('2024-08-15');
    });

    it('should return rescheduled status', async () => {
      const statusData = {
        status: 'rescheduled',
        isCancelled: false,
        isPostponed: false,
        isRescheduled: true,
        newDate: '2024-09-01',
      };
      mockExecuteWithRetry.mockResolvedValue({ data: statusData });

      const result = await client.getEventStatus('event-123');

      expect(result.isRescheduled).toBe(true);
    });

    it('should return default status on error', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Service unavailable'));

      const result = await client.getEventStatus('event-123');

      expect(result).toEqual({
        status: 'unknown',
        isCancelled: false,
        isPostponed: false,
        isRescheduled: false,
        originalDate: undefined,
        newDate: undefined,
      });
    });

    it('should log error when service fails', async () => {
      mockExecuteWithRetry.mockRejectedValue(new Error('Connection timeout'));

      await client.getEventStatus('event-123');

      expect(logger.error).toHaveBeenCalledWith(
        'Error fetching event status',
        expect.objectContaining({ eventId: 'event-123' })
      );
    });

    it('should pass context to request', async () => {
      mockExecuteWithRetry.mockResolvedValue({ data: { status: 'active' } });
      const context = { traceId: 'trace-789', spanId: 'span-012' };

      await client.getEventStatus('event-123', context);

      expect(mockExecuteWithRetry).toHaveBeenCalled();
    });
  });
});
