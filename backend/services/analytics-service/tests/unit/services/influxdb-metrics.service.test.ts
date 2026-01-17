/**
 * InfluxDB Metrics Service Unit Tests
 */

// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockWritePoint = jest.fn();
const mockFlush = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../src/config/influxdb', () => ({
  getWriteApi: jest.fn(() => ({
    writePoint: mockWritePoint,
    flush: mockFlush,
    close: mockClose,
  })),
  getQueryApi: jest.fn(() => ({
    queryRows: jest.fn(),
  })),
}));

const mockPointTag = jest.fn().mockReturnThis();
const mockPointIntField = jest.fn().mockReturnThis();
const mockPointFloatField = jest.fn().mockReturnThis();

jest.mock('@influxdata/influxdb-client', () => ({
  Point: jest.fn().mockImplementation(() => ({
    tag: mockPointTag,
    intField: mockPointIntField,
    floatField: mockPointFloatField,
  })),
}));

jest.mock('../../../src/errors', () => ({
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'BadRequestError';
    }
  },
}));

import { InfluxDBMetricsService, sanitizeId, sanitizeNumber, escapeFluxString } from '../../../src/services/influxdb-metrics.service';
import { Point } from '@influxdata/influxdb-client';

describe('InfluxDBMetricsService', () => {
  let service: InfluxDBMetricsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InfluxDBMetricsService();
  });

  describe('sanitizeId', () => {
    it('should accept valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(sanitizeId(uuid, 'testId')).toBe(uuid);
    });

    it('should accept alphanumeric with underscores', () => {
      expect(sanitizeId('user_123', 'userId')).toBe('user_123');
    });

    it('should accept alphanumeric with hyphens', () => {
      expect(sanitizeId('event-456', 'eventId')).toBe('event-456');
    });

    it('should throw for empty string', () => {
      expect(() => sanitizeId('', 'testId')).toThrow('Invalid testId');
    });

    it('should throw for null', () => {
      expect(() => sanitizeId(null as any, 'testId')).toThrow('Invalid testId');
    });

    it('should throw for special characters', () => {
      expect(() => sanitizeId('user; DROP TABLE', 'userId')).toThrow('Invalid userId');
    });

    it('should throw for flux injection attempt', () => {
      expect(() => sanitizeId('venue") |> drop()', 'venueId')).toThrow('Invalid venueId');
    });

    it('should throw for IDs exceeding 100 characters', () => {
      const longId = 'a'.repeat(101);
      expect(() => sanitizeId(longId, 'testId')).toThrow('exceeds maximum length');
    });
  });

  describe('sanitizeNumber', () => {
    it('should accept valid number', () => {
      expect(sanitizeNumber(100, 'count')).toBe(100);
    });

    it('should accept zero', () => {
      expect(sanitizeNumber(0, 'count', 0)).toBe(0);
    });

    it('should accept negative when no min', () => {
      expect(sanitizeNumber(-5, 'value')).toBe(-5);
    });

    it('should throw for NaN', () => {
      expect(() => sanitizeNumber(NaN, 'value')).toThrow('must be a number');
    });

    it('should throw for non-number', () => {
      expect(() => sanitizeNumber('100' as any, 'value')).toThrow('must be a number');
    });

    it('should throw when below min', () => {
      expect(() => sanitizeNumber(-1, 'count', 0)).toThrow('must be at least 0');
    });

    it('should throw when above max', () => {
      expect(() => sanitizeNumber(101, 'percent', 0, 100)).toThrow('must be at most 100');
    });
  });

  describe('escapeFluxString', () => {
    it('should escape backslashes', () => {
      expect(escapeFluxString('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should escape double quotes', () => {
      expect(escapeFluxString('say "hello"')).toBe('say \\"hello\\"');
    });

    it('should escape newlines', () => {
      expect(escapeFluxString('line1\nline2')).toBe('line1\\nline2');
    });

    it('should escape carriage returns', () => {
      expect(escapeFluxString('line1\rline2')).toBe('line1\\rline2');
    });

    it('should escape tabs', () => {
      expect(escapeFluxString('col1\tcol2')).toBe('col1\\tcol2');
    });

    it('should handle normal string', () => {
      expect(escapeFluxString('normal-string_123')).toBe('normal-string_123');
    });
  });

  describe('recordUserAction', () => {
    it('should create point with user action', async () => {
      await service.recordUserAction({
        userId: 'user-123',
        action: 'click',
      });

      expect(Point).toHaveBeenCalledWith('user_actions');
      expect(mockPointTag).toHaveBeenCalledWith('user_id', 'user-123');
      expect(mockPointTag).toHaveBeenCalledWith('action', 'click');
      expect(mockPointIntField).toHaveBeenCalledWith('count', 1);
      expect(mockWritePoint).toHaveBeenCalled();
    });

    it('should add optional eventId tag', async () => {
      await service.recordUserAction({
        userId: 'user-123',
        action: 'view',
        eventId: 'event-456',
      });

      expect(mockPointTag).toHaveBeenCalledWith('event_id', 'event-456');
    });

    it('should add optional venueId tag', async () => {
      await service.recordUserAction({
        userId: 'user-123',
        action: 'purchase',
        venueId: 'venue-789',
      });

      expect(mockPointTag).toHaveBeenCalledWith('venue_id', 'venue-789');
    });

    it('should add optional durationMs field', async () => {
      await service.recordUserAction({
        userId: 'user-123',
        action: 'watch',
        durationMs: 5000,
      });

      expect(mockPointIntField).toHaveBeenCalledWith('duration_ms', 5000);
    });

    it('should throw for invalid userId', async () => {
      await expect(
        service.recordUserAction({
          userId: 'invalid; injection',
          action: 'click',
        })
      ).rejects.toThrow('Invalid userId');
    });

    it('should throw for invalid action', async () => {
      await expect(
        service.recordUserAction({
          userId: 'user-123',
          action: 'click; DROP',
        })
      ).rejects.toThrow('Invalid action');
    });
  });

  describe('recordEventMetrics', () => {
    it('should create point with event metrics', async () => {
      await service.recordEventMetrics({
        eventId: 'event-123',
        venueId: 'venue-456',
        ticketsSold: 100,
        revenueCents: 10000,
        capacity: 500,
      });

      expect(Point).toHaveBeenCalledWith('event_metrics');
      expect(mockPointTag).toHaveBeenCalledWith('event_id', 'event-123');
      expect(mockPointTag).toHaveBeenCalledWith('venue_id', 'venue-456');
      expect(mockPointIntField).toHaveBeenCalledWith('tickets_sold', 100);
      expect(mockPointIntField).toHaveBeenCalledWith('revenue_cents', 10000);
      expect(mockPointIntField).toHaveBeenCalledWith('capacity', 500);
    });

    it('should calculate sell_through_rate', async () => {
      await service.recordEventMetrics({
        eventId: 'event-123',
        venueId: 'venue-456',
        ticketsSold: 200,
        revenueCents: 20000,
        capacity: 400,
      });

      expect(mockPointFloatField).toHaveBeenCalledWith('sell_through_rate', 0.5);
    });

    it('should throw for negative ticketsSold', async () => {
      await expect(
        service.recordEventMetrics({
          eventId: 'event-123',
          venueId: 'venue-456',
          ticketsSold: -10,
          revenueCents: 1000,
          capacity: 100,
        })
      ).rejects.toThrow('must be at least 0');
    });

    it('should throw for zero capacity', async () => {
      await expect(
        service.recordEventMetrics({
          eventId: 'event-123',
          venueId: 'venue-456',
          ticketsSold: 10,
          revenueCents: 1000,
          capacity: 0,
        })
      ).rejects.toThrow('must be at least 1');
    });
  });

  describe('recordSalesVelocity', () => {
    it('should create point with sales velocity', async () => {
      await service.recordSalesVelocity({
        eventId: 'event-123',
        venueId: 'venue-456',
        ticketsPerHour: 25.5,
      });

      expect(Point).toHaveBeenCalledWith('sales_velocity');
      expect(mockPointFloatField).toHaveBeenCalledWith('tickets_per_hour', 25.5);
    });

    it('should throw for negative velocity', async () => {
      await expect(
        service.recordSalesVelocity({
          eventId: 'event-123',
          venueId: 'venue-456',
          ticketsPerHour: -5,
        })
      ).rejects.toThrow('must be at least 0');
    });
  });

  describe('flush', () => {
    it('should flush write api', async () => {
      await service.flush();

      expect(mockFlush).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close write api', async () => {
      await service.close();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('getEventSalesTimeSeries', () => {
    it('should validate eventId', async () => {
      await expect(
        service.getEventSalesTimeSeries('invalid; DROP', 24)
      ).rejects.toThrow('Invalid eventId');
    });

    it('should validate hours range', async () => {
      await expect(
        service.getEventSalesTimeSeries('event-123', 0)
      ).rejects.toThrow('must be at least 1');
    });

    it('should validate max hours', async () => {
      await expect(
        service.getEventSalesTimeSeries('event-123', 10000)
      ).rejects.toThrow('must be at most 8760');
    });
  });

  describe('getSalesVelocity', () => {
    it('should validate eventId', async () => {
      await expect(
        service.getSalesVelocity('bad"id', 24)
      ).rejects.toThrow('Invalid eventId');
    });
  });

  describe('getVenuePerformance', () => {
    it('should validate venueId', async () => {
      await expect(
        service.getVenuePerformance('bad|venue', 30)
      ).rejects.toThrow('Invalid venueId');
    });

    it('should validate days range', async () => {
      await expect(
        service.getVenuePerformance('venue-123', 0)
      ).rejects.toThrow('must be at least 1');
    });

    it('should validate max days', async () => {
      await expect(
        service.getVenuePerformance('venue-123', 400)
      ).rejects.toThrow('must be at most 365');
    });
  });
});
