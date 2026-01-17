// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/routes/devices.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');

describe('src/routes/devices.ts - Comprehensive Unit Tests', () => {
  let deviceRoutes: any;
  let getPool: any;
  let logger: any;
  let mockFastify: any;
  let mockRequest: any;
  let mockReply: any;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
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
      _routes: routes,
    };

    // Mock request
    mockRequest = {
      headers: {},
      body: {},
      params: {},
      query: {},
    };

    // Mock reply
    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    // Import module under test
    deviceRoutes = require('../../../src/routes/devices').default;
  });

  // =============================================================================
  // Route Registration
  // =============================================================================

  describe('Route Registration', () => {
    it('should register GET / route', async () => {
      await deviceRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith('/', expect.any(Function));
    });

    it('should register POST /register route', async () => {
      await deviceRoutes(mockFastify);

      expect(mockFastify.post).toHaveBeenCalledWith('/register', expect.any(Function));
    });

    it('should register exactly 2 routes', async () => {
      await deviceRoutes(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledTimes(1);
      expect(mockFastify.post).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // GET / - List Devices - Success Cases
  // =============================================================================

  describe('GET / - List Devices - Success Cases', () => {
    it('should return list of active devices', async () => {
      const mockDevices = [
        { id: 1, device_id: 'device-1', name: 'Scanner A', zone: 'GA', is_active: true },
        { id: 2, device_id: 'device-2', name: 'Scanner B', zone: 'VIP', is_active: true },
      ];
      mockPool.query.mockResolvedValue({ rows: mockDevices });

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        devices: mockDevices,
      });
    });

    it('should query for active devices only', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM devices WHERE is_active = true ORDER BY name'
      );
    });

    it('should return empty array when no devices', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        devices: [],
      });
    });

    it('should order devices by name', async () => {
      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY name')
      );
    });

    it('should return all device fields', async () => {
      const mockDevices = [
        {
          id: 1,
          device_id: 'device-1',
          name: 'Scanner A',
          zone: 'GA',
          is_active: true,
          created_at: '2024-01-01',
          updated_at: '2024-01-02',
        },
      ];
      mockPool.query.mockResolvedValue({ rows: mockDevices });

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        devices: mockDevices,
      });
    });
  });

  // =============================================================================
  // GET / - List Devices - Error Cases
  // =============================================================================

  describe('GET / - List Devices - Error Cases', () => {
    it('should return 500 on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'DEVICE_LIST_ERROR',
      });
    });

    it('should log error on failure', async () => {
      const dbError = new Error('Connection failed');
      mockPool.query.mockRejectedValue(dbError);

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Device list error:', dbError);
    });

    it('should handle query timeout', async () => {
      mockPool.query.mockRejectedValue(new Error('Query timeout'));

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('GET:/');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // POST /register - Success Cases (New Device)
  // =============================================================================

  describe('POST /register - Success Cases (New Device)', () => {
    it('should register new device with all fields', async () => {
      const newDevice = {
        id: 1,
        device_id: 'device-123',
        name: 'Scanner Alpha',
        zone: 'GA',
        is_active: true,
      };
      mockPool.query.mockResolvedValue({ rows: [newDevice] });
      mockRequest.body = {
        device_id: 'device-123',
        name: 'Scanner Alpha',
        zone: 'GA',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        device: newDevice,
      });
    });

    it('should use default zone GA when not provided', async () => {
      const newDevice = { id: 1, device_id: 'device-456', name: 'Scanner B', zone: 'GA' };
      mockPool.query.mockResolvedValue({ rows: [newDevice] });
      mockRequest.body = {
        device_id: 'device-456',
        name: 'Scanner B',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['device-456', 'Scanner B', 'GA']
      );
    });

    it('should insert with correct SQL', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-789',
        name: 'Scanner C',
        zone: 'VIP',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO devices'),
        ['device-789', 'Scanner C', 'VIP']
      );
    });

    it('should use UPSERT logic with ON CONFLICT', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-abc',
        name: 'Scanner D',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (device_id) DO UPDATE'),
        expect.any(Array)
      );
    });

    it('should return RETURNING * in query', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-xyz',
        name: 'Scanner E',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('RETURNING *'),
        expect.any(Array)
      );
    });
  });

  // =============================================================================
  // POST /register - Success Cases (Update Existing)
  // =============================================================================

  describe('POST /register - Success Cases (Update Existing)', () => {
    it('should update existing device on conflict', async () => {
      const updatedDevice = {
        id: 1,
        device_id: 'device-123',
        name: 'Scanner Updated',
        zone: 'VIP',
        is_active: true,
      };
      mockPool.query.mockResolvedValue({ rows: [updatedDevice] });
      mockRequest.body = {
        device_id: 'device-123',
        name: 'Scanner Updated',
        zone: 'VIP',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        device: updatedDevice,
      });
    });

    it('should update name and zone on conflict', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'existing-device',
        name: 'New Name',
        zone: 'New Zone',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SET name = EXCLUDED.name, zone = EXCLUDED.zone'),
        expect.any(Array)
      );
    });

    it('should update updated_at timestamp', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-update',
        name: 'Updated Scanner',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });
  });

  // =============================================================================
  // POST /register - Validation Errors
  // =============================================================================

  describe('POST /register - Validation Errors', () => {
    it('should return 400 when device_id missing', async () => {
      mockRequest.body = {
        name: 'Scanner X',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'MISSING_PARAMETERS',
      });
    });

    it('should return 400 when name missing', async () => {
      mockRequest.body = {
        device_id: 'device-999',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'MISSING_PARAMETERS',
      });
    });

    it('should return 400 when both device_id and name missing', async () => {
      mockRequest.body = {
        zone: 'GA',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when device_id is empty string', async () => {
      mockRequest.body = {
        device_id: '',
        name: 'Scanner',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when name is empty string', async () => {
      mockRequest.body = {
        device_id: 'device-123',
        name: '',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should not call database when validation fails', async () => {
      mockRequest.body = {
        name: 'Scanner',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // POST /register - Error Cases
  // =============================================================================

  describe('POST /register - Error Cases', () => {
    it('should return 500 on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));
      mockRequest.body = {
        device_id: 'device-error',
        name: 'Scanner Error',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'REGISTRATION_ERROR',
      });
    });

    it('should log error on database failure', async () => {
      const dbError = new Error('Connection failed');
      mockPool.query.mockRejectedValue(dbError);
      mockRequest.body = {
        device_id: 'device-fail',
        name: 'Scanner Fail',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith('Device registration error:', dbError);
    });

    it('should handle constraint violation', async () => {
      mockPool.query.mockRejectedValue(new Error('unique constraint violation'));
      mockRequest.body = {
        device_id: 'device-dup',
        name: 'Scanner Dup',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  // =============================================================================
  // Edge Cases
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle special characters in device_id', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-123-special_@#',
        name: 'Scanner Special',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['device-123-special_@#', 'Scanner Special', 'GA']
      );
    });

    it('should handle very long device names', async () => {
      const longName = 'A'.repeat(200);
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-long',
        name: longName,
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['device-long', longName, 'GA']
      );
    });

    it('should handle zone with special characters', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-zone',
        name: 'Scanner',
        zone: 'Section-A/B',
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['device-zone', 'Scanner', 'Section-A/B']
      );
    });

    it('should handle null zone by using default', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-null',
        name: 'Scanner',
        zone: null,
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['device-null', 'Scanner', 'GA']
      );
    });

    it('should handle undefined zone by using default', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });
      mockRequest.body = {
        device_id: 'device-undef',
        name: 'Scanner',
        zone: undefined,
      };

      await deviceRoutes(mockFastify);
      const handler = mockFastify._routes.get('POST:/register');

      await handler(mockRequest, mockReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['device-undef', 'Scanner', 'GA']
      );
    });
  });
});
