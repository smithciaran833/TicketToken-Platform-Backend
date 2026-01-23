// @ts-nocheck
/**
 * Internal Routes Unit Tests - scanning-service
 *
 * Tests for the internal routes endpoints:
 * - POST /internal/scan-results
 * - GET /internal/scan-results/:ticketId
 * - GET /internal/events/:eventId/scan-summary
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 */

import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Mock environment
process.env.INTERNAL_HMAC_SECRET = 'test-secret-key-must-be-32-chars-long';
process.env.USE_NEW_HMAC = 'false'; // Disable HMAC for route logic tests
process.env.NODE_ENV = 'test';

// Mock the database pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
};

jest.mock('../../../src/config/database', () => ({
  getPool: () => mockPool,
}));

// Mock internal auth middleware to skip HMAC validation
jest.mock('../../../src/middleware/internal-auth.middleware', () => ({
  internalAuthMiddleware: jest.fn(async (request, reply) => {
    // Pass through without validation for testing
    return;
  }),
}));

// Mock logger
const mockChildLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    child: jest.fn(() => mockChildLogger),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import internalRoutes from '../../../src/routes/internal.routes';

describe('Internal Routes - scanning-service', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(internalRoutes, { prefix: '/internal' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // POST /internal/scan-results
  // =========================================================================

  describe('POST /internal/scan-results', () => {
    const validScanPayload = {
      ticketId: 'ticket-123',
      eventId: 'event-456',
      deviceId: 'device-789',
      venueId: 'venue-abc',
      scanType: 'entry',
      result: 'valid',
      reason: null,
      metadata: { gate: 'A1' },
    };

    test('should record a new scan result', async () => {
      const mockScanResult = {
        id: 'scan-001',
        ticket_id: 'ticket-123',
        event_id: 'event-456',
        scan_type: 'entry',
        result: 'valid',
        scanned_at: new Date(),
        created_at: new Date(),
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockScanResult] }) // Insert
        .mockResolvedValueOnce({ rows: [] }); // Update ticket

      const response = await app.inject({
        method: 'POST',
        url: '/internal/scan-results',
        payload: validScanPayload,
        headers: {
          'x-internal-service': 'ticket-service',
          'x-trace-id': 'trace-123',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.scanResult).toBeDefined();
      expect(body.scanResult.ticketId).toBe('ticket-123');
      expect(body.scanResult.result).toBe('valid');
    });

    test('should return 400 for missing required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/scan-results',
        payload: { ticketId: 'ticket-123' }, // Missing eventId and result
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad Request');
    });

    test('should return 400 for invalid result value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/scan-results',
        payload: {
          ticketId: 'ticket-123',
          eventId: 'event-456',
          result: 'invalid_result_value',
        },
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('result must be one of');
    });

    test('should return 400 for invalid scanType value', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/internal/scan-results',
        payload: {
          ticketId: 'ticket-123',
          eventId: 'event-456',
          result: 'valid',
          scanType: 'invalid_scan_type',
        },
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('scanType must be one of');
    });
  });

  // =========================================================================
  // GET /internal/scan-results/:ticketId
  // =========================================================================

  describe('GET /internal/scan-results/:ticketId', () => {
    test('should return scan history for a ticket', async () => {
      const mockScans = [
        {
          id: 'scan-001',
          ticket_id: 'ticket-123',
          event_id: 'event-456',
          device_id: 'device-789',
          venue_id: 'venue-abc',
          scan_type: 'entry',
          result: 'valid',
          reason: null,
          metadata: null,
          scanned_at: new Date(),
          created_at: new Date(),
        },
        {
          id: 'scan-002',
          ticket_id: 'ticket-123',
          event_id: 'event-456',
          device_id: 'device-789',
          venue_id: 'venue-abc',
          scan_type: 'exit',
          result: 'valid',
          reason: null,
          metadata: null,
          scanned_at: new Date(),
          created_at: new Date(),
        },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockScans }) // Get scans
        .mockResolvedValueOnce({ rows: [{ total: '2' }] }); // Get count

      const response = await app.inject({
        method: 'GET',
        url: '/internal/scan-results/ticket-123',
        headers: {
          'x-internal-service': 'compliance-service',
          'x-trace-id': 'trace-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ticketId).toBe('ticket-123');
      expect(body.scans).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    test('should return empty scans for ticket with no history', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: '0' }] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/scan-results/new-ticket',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.scans).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
    });
  });

  // =========================================================================
  // GET /internal/events/:eventId/scan-summary
  // =========================================================================

  describe('GET /internal/events/:eventId/scan-summary', () => {
    test('should return scan summary for an event', async () => {
      const mockSummary = [
        { result: 'valid', scan_type: 'entry', count: '150' },
        { result: 'valid', scan_type: 'exit', count: '50' },
        { result: 'already_used', scan_type: 'entry', count: '5' },
        { result: 'invalid', scan_type: 'entry', count: '3' },
      ];

      const mockUnique = [{ unique_tickets: '155', total_scans: '208' }];

      const mockRecent = [
        { id: 'scan-recent-1', ticket_id: 'ticket-1', scan_type: 'entry', result: 'valid', scanned_at: new Date() },
        { id: 'scan-recent-2', ticket_id: 'ticket-2', scan_type: 'entry', result: 'valid', scanned_at: new Date() },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: mockSummary }) // Summary by result
        .mockResolvedValueOnce({ rows: mockUnique }) // Unique tickets
        .mockResolvedValueOnce({ rows: mockRecent }); // Recent scans

      const response = await app.inject({
        method: 'GET',
        url: '/internal/events/event-789/scan-summary',
        headers: {
          'x-internal-service': 'analytics-service',
          'x-trace-id': 'trace-789',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.eventId).toBe('event-789');
      expect(body.summary.uniqueTicketsScanned).toBe(155);
      expect(body.summary.totalScans).toBe(208);
      expect(body.summary.byResult).toBeDefined();
      expect(body.summary.byResult.valid).toBeDefined();
      expect(body.summary.byResult.valid.entry).toBe(150);
      expect(body.recentScans).toHaveLength(2);
    });

    test('should return empty summary for event with no scans', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ unique_tickets: '0', total_scans: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await app.inject({
        method: 'GET',
        url: '/internal/events/new-event/scan-summary',
        headers: {
          'x-internal-service': 'event-service',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.summary.uniqueTicketsScanned).toBe(0);
      expect(body.summary.totalScans).toBe(0);
      expect(body.summary.byResult).toEqual({});
      expect(body.recentScans).toHaveLength(0);
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    test('should handle database errors gracefully on scan recording', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/internal/scan-results',
        payload: {
          ticketId: 'ticket-error',
          eventId: 'event-error',
          result: 'valid',
        },
        headers: {
          'x-internal-service': 'ticket-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on history lookup', async () => {
      mockQuery.mockRejectedValue(new Error('Query timeout'));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/scan-results/ticket-timeout',
        headers: {
          'x-internal-service': 'compliance-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });

    test('should handle database errors gracefully on event summary', async () => {
      mockQuery.mockRejectedValue(new Error('Connection reset'));

      const response = await app.inject({
        method: 'GET',
        url: '/internal/events/event-error/scan-summary',
        headers: {
          'x-internal-service': 'analytics-service',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal error');
    });
  });
});
