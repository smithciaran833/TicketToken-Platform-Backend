// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/routes/policies.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');

describe('src/routes/policies.ts - Comprehensive Unit Tests', () => {
  let policyRoutes: any;
  let getPool: any;
  let logger: any;
  let mockFastify: any;
  let mockRequest: any;
  let mockReply: any;
  let mockPool: any;
  let mockClient: any;

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

    // Import mocked modules
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
      put: jest.fn((path, handler) => {
        routes.set(`PUT:${path}`, handler);
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
    policyRoutes = require('../../../src/routes/policies').default;
  });

  // =============================================================================
  // Route Registration
  // =============================================================================

  describe('Route Registration', () => {
    it('should register GET /templates route', async () => {
      await policyRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/templates', expect.any(Function));
    });

    it('should register GET /event/:eventId route', async () => {
      await policyRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/event/:eventId', expect.any(Function));
    });

    it('should register POST /event/:eventId/apply-template route', async () => {
      await policyRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/event/:eventId/apply-template', expect.any(Function));
    });

    it('should register PUT /event/:eventId/custom route', async () => {
      await policyRoutes(mockFastify);

      expect(mockFastify.put).toHaveBeenCalledWith('/event/:eventId/custom', expect.any(Function));
    });

    it('should register exactly 4 routes', async () => {
      await policyRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledTimes(2);
      expect(mockFastify.post).toHaveBeenCalledTimes(1);
      expect(mockFastify.put).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // GET /templates - Success Cases
  // =============================================================================

  describe('GET /templates - Success Cases', () => {
    it('should return list of policy templates', async () => {
      const templates = [
        { id: 1, name: 'Standard', description: 'Standard policy', policy_set: {}, is_default: true },
        { id: 2, name: 'Strict', description: 'Strict policy', policy_set: {}, is_default: false },
      ];
      mockPool.query.mockResolvedValue({ rows: templates });

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/templates');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        templates,
      });
    });

    it('should query with correct SQL', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/templates');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, description, policy_set, is_default')
      );
    });

    it('should order by is_default DESC, name', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/templates');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY is_default DESC, name')
      );
    });

    it('should return empty array when no templates', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/templates');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        templates: [],
      });
    });
  });

  // =============================================================================
  // GET /templates - Error Cases
  // =============================================================================

  describe('GET /templates - Error Cases', () => {
    it('should return 500 on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/templates');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'FETCH_ERROR',
      });
    });

    it('should log error on failure', async () => {
      const dbError = new Error('Query failed');
      mockPool.query.mockRejectedValue(dbError);

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/templates');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Error fetching templates:', dbError);
    });
  });

  // =============================================================================
  // GET /event/:eventId - Success Cases
  // =============================================================================

  describe('GET /event/:eventId - Success Cases', () => {
    it('should return policies for event', async () => {
      const policies = [
        { id: 1, event_id: 'event-123', policy_type: 'DUPLICATE_WINDOW', event_name: 'Concert', venue_name: 'Arena' },
        { id: 2, event_id: 'event-123', policy_type: 'REENTRY', event_name: 'Concert', venue_name: 'Arena' },
      ];
      mockPool.query.mockResolvedValue({ rows: policies });
      mockRequest.params = { eventId: 'event-123' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/event/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        policies,
      });
    });

    it('should query with event ID parameter', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      mockRequest.params = { eventId: 'event-456' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/event/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['event-456']
      );
    });

    it('should join with events and venues tables', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      mockRequest.params = { eventId: 'event-123' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/event/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN events e ON sp.event_id = e.id'),
        expect.any(Array)
      );
    });

    it('should order by policy_type', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      mockRequest.params = { eventId: 'event-123' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/event/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY sp.policy_type'),
        expect.any(Array)
      );
    });
  });

  // =============================================================================
  // GET /event/:eventId - Error Cases
  // =============================================================================

  describe('GET /event/:eventId - Error Cases', () => {
    it('should return 500 on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));
      mockRequest.params = { eventId: 'event-123' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/event/:eventId');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'FETCH_ERROR',
      });
    });

    it('should log error on failure', async () => {
      const dbError = new Error('Query failed');
      mockPool.query.mockRejectedValue(dbError);
      mockRequest.params = { eventId: 'event-123' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/event/:eventId');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Error fetching event policies:', dbError);
    });
  });

  // =============================================================================
  // POST /event/:eventId/apply-template - Success Cases
  // =============================================================================

  describe('POST /event/:eventId/apply-template - Success Cases', () => {
    it('should apply template and return updated policies', async () => {
      const updatedPolicies = [
        { id: 1, event_id: 'event-123', policy_type: 'DUPLICATE_WINDOW' },
      ];
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // apply_scan_policy_template
        .mockResolvedValueOnce({ rows: updatedPolicies }); // fetch updated

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { template_id: 'template-1' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/event/:eventId/apply-template');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Policy template applied successfully',
        policies: updatedPolicies,
      });
    });

    it('should call apply_scan_policy_template function', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-456' };
      mockRequest.body = { template_id: 'template-2' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/event/:eventId/apply-template');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT apply_scan_policy_template($1, $2)',
        ['event-456', 'template-2']
      );
    });

    it('should fetch updated policies after applying', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-789' };
      mockRequest.body = { template_id: 'template-3' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/event/:eventId/apply-template');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM scan_policies'),
        ['event-789']
      );
    });
  });

  // =============================================================================
  // POST /event/:eventId/apply-template - Validation Errors
  // =============================================================================

  describe('POST /event/:eventId/apply-template - Validation Errors', () => {
    it('should return 400 when template_id missing', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = {};

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/event/:eventId/apply-template');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'MISSING_TEMPLATE_ID',
      });
    });

    it('should not call database when template_id missing', async () => {
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = {};

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/event/:eventId/apply-template');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST /event/:eventId/apply-template - Error Cases
  // =============================================================================

  describe('POST /event/:eventId/apply-template - Error Cases', () => {
    it('should return 500 on database error', async () => {
      const dbError = new Error('Template not found');
      mockPool.query.mockRejectedValue(dbError);
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { template_id: 'invalid-template' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/event/:eventId/apply-template');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'APPLY_ERROR',
        message: 'Template not found',
      });
    });

    it('should log error on failure', async () => {
      const dbError = new Error('Apply failed');
      mockPool.query.mockRejectedValue(dbError);
      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { template_id: 'template-1' };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/event/:eventId/apply-template');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Error applying template:', dbError);
    });
  });

  // =============================================================================
  // PUT /event/:eventId/custom - Success Cases
  // =============================================================================

  describe('PUT /event/:eventId/custom - Success Cases', () => {
    it('should set duplicate window policy', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] }) // Get venue
        .mockResolvedValueOnce({ rows: [] }) // Insert duplicate policy
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] }); // Fetch updated policies

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DUPLICATE_WINDOW'),
        expect.arrayContaining([
          'event-123',
          'venue-1',
          JSON.stringify({ window_minutes: 30 }),
        ])
      );
    });

    it('should set reentry policy', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = {
        reentry_enabled: true,
        reentry_cooldown_minutes: 20,
        max_reentries: 3,
      };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('REENTRY'),
        expect.arrayContaining([
          'event-123',
          'venue-1',
          JSON.stringify({
            enabled: true,
            cooldown_minutes: 20,
            max_reentries: 3,
          }),
        ])
      );
    });

    it('should use default cooldown and max_reentries', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { reentry_enabled: true };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('REENTRY'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          JSON.stringify({
            enabled: true,
            cooldown_minutes: 15,
            max_reentries: 2,
          }),
        ])
      );
    });

    it('should set zone enforcement policy', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = {
        strict_zones: true,
        vip_all_access: true,
      };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ZONE_ENFORCEMENT'),
        expect.arrayContaining([
          'event-123',
          'venue-1',
          JSON.stringify({
            strict: true,
            vip_all_access: true,
          }),
        ])
      );
    });

    it('should use default strict_zones and vip_all_access', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { strict_zones: false };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ZONE_ENFORCEMENT'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          JSON.stringify({
            strict: false,
            vip_all_access: false,
          }),
        ])
      );
    });

    it('should set multiple policies in one request', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] }) // duplicate
        .mockResolvedValueOnce({ rows: [] }) // reentry
        .mockResolvedValueOnce({ rows: [] }) // zone
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = {
        duplicate_window_minutes: 30,
        reentry_enabled: true,
        strict_zones: true,
      };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DUPLICATE_WINDOW'),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('REENTRY'),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('ZONE_ENFORCEMENT'),
        expect.any(Array)
      );
    });

    it('should commit transaction on success', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should release client on success', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should fetch updated policies after setting', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const updatedPolicies = [{ id: 1, event_id: 'event-123' }];
      mockPool.query.mockResolvedValueOnce({ rows: updatedPolicies });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Custom policies applied successfully',
        policies: updatedPolicies,
      });
    });
  });

  // =============================================================================
  // PUT /event/:eventId/custom - Error Cases
  // =============================================================================

  describe('PUT /event/:eventId/custom - Error Cases', () => {
    it('should return 404 when event not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // Venue query returns empty

      mockRequest.params = { eventId: 'invalid-event' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found',
      });
    });

    it('should rollback when event not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'invalid-event' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should release client when event not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'invalid-event' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return 500 on database error', async () => {
      const dbError = new Error('Database error');
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(dbError);

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'UPDATE_ERROR',
        message: 'Database error',
      });
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Error'));

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should release client on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('Error'));

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should log error on failure', async () => {
      const dbError = new Error('Update failed');
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(dbError);

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 30 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Error setting custom policies:', dbError);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle empty body gracefully', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = {};

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      // Should commit without setting any policies
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('should handle zero duplicate_window_minutes', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = { duplicate_window_minutes: 0 };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DUPLICATE_WINDOW'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          JSON.stringify({ window_minutes: 0 }),
        ])
      );
    });

    it('should handle false values for booleans', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ venue_id: 'venue-1' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      mockRequest.params = { eventId: 'event-123' };
      mockRequest.body = {
        reentry_enabled: false,
        strict_zones: false,
      };

      await policyRoutes(mockFastify);
      const handler = mockFastify._routes.get('PUT:/event/:eventId/custom');

      await handler(mockRequest, mockReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('REENTRY'),
        expect.arrayContaining([
          expect.any(String),
          expect.any(String),
          expect.stringContaining('"enabled":false'),
        ])
      );
    });
  });
});
