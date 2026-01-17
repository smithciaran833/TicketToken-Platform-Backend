// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/routes/offline.ts
 */

jest.mock('../../../src/services/QRGenerator');
jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');

describe('src/routes/offline.ts - Comprehensive Unit Tests', () => {
  let offlineRoutes: any;
  let QRGenerator: any;
  let getPool: any;
  let logger: any;
  let mockFastify: any;
  let mockRequest: any;
  let mockReply: any;
  let mockPool: any;
  let mockClient: any;
  let mockQRGenerator: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock client
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    // Mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    // Mock QRGenerator
    mockQRGenerator = {
      generateOfflineManifest: jest.fn().mockResolvedValue({
        eventId: 'event-123',
        tickets: [],
        generatedAt: new Date().toISOString(),
      }),
    };

    // Import mocked modules
    QRGenerator = require('../../../src/services/QRGenerator').default;
    QRGenerator.mockImplementation(() => mockQRGenerator);
    ({ getPool } = require('../../../src/config/database'));
    logger = require('../../../src/utils/logger').default;
    getPool.mockReturnValue(mockPool);

    // Mock Fastify instance
    const routes: Map<string, any> = new Map();
    mockFastify = {
      get: jest.fn((path, handler) => {
        routes.set(`GET:${path}`, handler);
      }),
      post: jest.fn((path, handler) => {
        routes.set(`POST:${path}`, handler);
      }),
      _routes: routes,
    };

    // Mock request
    mockRequest = {
      params: {},
      query: {},
      body: {},
    };

    // Mock reply
    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    // Import module under test
    offlineRoutes = require('../../../src/routes/offline').default;
  });

  // =============================================================================
  // Route Registration
  // =============================================================================

  describe('Route Registration', () => {
    it('should register GET /manifest/:eventId route', async () => {
      await offlineRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/manifest/:eventId', expect.any(Function));
    });

    it('should register POST /reconcile route', async () => {
      await offlineRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/reconcile', expect.any(Function));
    });

    it('should register exactly 2 routes', async () => {
      await offlineRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledTimes(1);
      expect(mockFastify.post).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // GET /manifest/:eventId - Success Cases
  // =============================================================================

  describe('GET /manifest/:eventId - Success Cases', () => {
    it('should generate manifest with valid eventId and device_id', async () => {
      const manifest = {
        eventId: 'event-123',
        tickets: [{ id: 'ticket-1' }, { id: 'ticket-2' }],
        generatedAt: '2024-01-01T00:00:00Z',
      };
      mockQRGenerator.generateOfflineManifest.mockResolvedValue(manifest);
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.query = { device_id: 'device-456' };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/manifest/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockQRGenerator.generateOfflineManifest).toHaveBeenCalledWith('event-123', 'device-456');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        manifest,
      });
    });

    it('should pass eventId from params', async () => {
      mockRequest.params = { eventId: 'event-789' };
      mockRequest.query = { device_id: 'device-abc' };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/manifest/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockQRGenerator.generateOfflineManifest).toHaveBeenCalledWith('event-789', 'device-abc');
    });

    it('should return manifest with tickets', async () => {
      const manifest = {
        eventId: 'event-123',
        tickets: [
          { id: 'ticket-1', hash: 'hash1' },
          { id: 'ticket-2', hash: 'hash2' },
        ],
      };
      mockQRGenerator.generateOfflineManifest.mockResolvedValue(manifest);
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.query = { device_id: 'device-1' };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/manifest/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        manifest: expect.objectContaining({ tickets: expect.any(Array) }),
      });
    });
  });

  // =============================================================================
  // GET /manifest/:eventId - Validation Errors
  // =============================================================================

  describe('GET /manifest/:eventId - Validation Errors', () => {
    it('should return 400 when device_id missing', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.query = {};

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/manifest/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'MISSING_DEVICE_ID',
      });
    });

    it('should not call generateOfflineManifest when device_id missing', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.query = {};

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/manifest/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockQRGenerator.generateOfflineManifest).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GET /manifest/:eventId - Error Cases
  // =============================================================================

  describe('GET /manifest/:eventId - Error Cases', () => {
    it('should return 500 on manifest generation error', async () => {
      mockQRGenerator.generateOfflineManifest.mockRejectedValue(new Error('Generation failed'));
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.query = { device_id: 'device-1' };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/manifest/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'MANIFEST_ERROR',
      });
    });

    it('should log error on manifest failure', async () => {
      const error = new Error('QR generation error');
      mockQRGenerator.generateOfflineManifest.mockRejectedValue(error);
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.query = { device_id: 'device-1' };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/manifest/:eventId');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Manifest generation error:', error);
    });
  });

  // =============================================================================
  // POST /reconcile - Success Cases
  // =============================================================================

  describe('POST /reconcile - Success Cases', () => {
    it('should reconcile new scans successfully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing scan
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Get device
        .mockResolvedValueOnce({ rows: [] }) // Insert scan
        .mockResolvedValueOnce({ rows: [] }) // Update ticket
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          {
            ticket_id: 'ticket-1',
            scanned_at: '2024-01-01T10:00:00Z',
            result: 'ALLOW',
            scan_count: 1,
          },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        reconciled: 1,
        failed: 0,
        results: [
          {
            ticket_id: 'ticket-1',
            status: 'SUCCESS',
            message: 'Scan reconciled',
          },
        ],
      });
    });

    it('should handle multiple scans', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check scan 1
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Device for scan 1
        .mockResolvedValueOnce({ rows: [] }) // Insert scan 1
        .mockResolvedValueOnce({ rows: [] }) // Update ticket 1
        .mockResolvedValueOnce({ rows: [] }) // Check scan 2
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Device for scan 2
        .mockResolvedValueOnce({ rows: [] }) // Insert scan 2
        .mockResolvedValueOnce({ rows: [] }) // Update ticket 2
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
          { ticket_id: 'ticket-2', scanned_at: '2024-01-01T10:05:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          reconciled: 2,
          failed: 0,
        })
      );
    });

    it('should skip duplicate scans', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Existing scan found
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-dup', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              ticket_id: 'ticket-dup',
              status: 'DUPLICATE',
              message: 'Already processed',
            },
          ],
        })
      );
    });

    it('should handle device not found error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // No existing scan
        .mockResolvedValueOnce({ rows: [] }) // Device not found
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRequest.body = {
        device_id: 'invalid-device',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              ticket_id: 'ticket-1',
              status: 'ERROR',
              message: 'Device not found',
            },
          ],
        })
      );
    });

    it('should not update ticket when result is DENY', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check existing
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Get device
        .mockResolvedValueOnce({ rows: [] }) // Insert scan
        .mockResolvedValueOnce({ rows: [] }); // COMMIT (no ticket update)

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'DENY', reason: 'Invalid' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      // Should have 5 query calls (BEGIN, check, device, insert, COMMIT) - no ticket update
      expect(mockClient.query).toHaveBeenCalledTimes(5);
    });

    it('should insert scan with reason', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          {
            ticket_id: 'ticket-1',
            scanned_at: '2024-01-01T10:00:00Z',
            result: 'DENY',
            reason: 'Ticket expired',
          },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scans'),
        expect.arrayContaining(['Ticket expired'])
      );
    });

    it('should release client on success', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should commit transaction on success', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  // =============================================================================
  // POST /reconcile - Validation Errors
  // =============================================================================

  describe('POST /reconcile - Validation Errors', () => {
    it('should return 400 when device_id missing', async () => {
      mockRequest.body = {
        scans: [],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'INVALID_REQUEST',
      });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 400 when scans missing', async () => {
      mockRequest.body = {
        device_id: 'device-123',
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when scans is not an array', async () => {
      mockRequest.body = {
        device_id: 'device-123',
        scans: 'not-an-array',
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should release client on validation error', async () => {
      mockRequest.body = {
        device_id: 'device-123',
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST /reconcile - Error Cases
  // =============================================================================

  describe('POST /reconcile - Error Cases', () => {
    it('should rollback and return 500 on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // Fail on check

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'RECONCILIATION_ERROR',
      });
    });

    it('should release client after rollback', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Error'));

      mockRequest.body = {
        device_id: 'device-123',
        scans: [{ ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' }],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should log reconciliation error', async () => {
      const dbError = new Error('Transaction failed');
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(dbError);

      mockRequest.body = {
        device_id: 'device-123',
        scans: [{ ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' }],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Reconciliation error:', dbError);
    });

    it('should handle individual scan errors gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check scan 1
        .mockRejectedValueOnce(new Error('Device query failed')) // Error getting device
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          results: [
            {
              ticket_id: 'ticket-1',
              status: 'ERROR',
              message: 'Device query failed',
            },
          ],
        })
      );
    });

    it('should log individual scan errors', async () => {
      const scanError = new Error('Scan insert failed');
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(scanError)
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Error reconciling scan:', scanError);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty scans array', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRequest.body = {
        device_id: 'device-123',
        scans: [],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        reconciled: 0,
        failed: 0,
        results: [],
      });
    });

    it('should handle scan without reason', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scans'),
        expect.arrayContaining([undefined]) // reason is undefined
      );
    });

    it('should handle scan without scan_count', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tickets'),
        expect.arrayContaining([1]) // Defaults to 1
      );
    });

    it('should handle mixed success and failure results', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // Check scan 1
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Device for scan 1
        .mockResolvedValueOnce({ rows: [] }) // Insert scan 1
        .mockResolvedValueOnce({ rows: [] }) // Update ticket 1
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Check scan 2 - duplicate
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRequest.body = {
        device_id: 'device-123',
        scans: [
          { ticket_id: 'ticket-1', scanned_at: '2024-01-01T10:00:00Z', result: 'ALLOW' },
          { ticket_id: 'ticket-2', scanned_at: '2024-01-01T10:05:00Z', result: 'ALLOW' },
        ],
      };

      await offlineRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/reconcile');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          reconciled: 1,
          failed: 1,
        })
      );
    });
  });
});
