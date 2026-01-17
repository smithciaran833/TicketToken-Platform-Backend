// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/services/DeviceManager.ts
 */

jest.mock('../../../src/config/database');
jest.mock('../../../src/utils/logger');
jest.mock('crypto');

describe('src/services/DeviceManager.ts - Comprehensive Unit Tests', () => {
  let DeviceManager: any;
  let getPool: any;
  let logger: any;
  let crypto: any;
  let mockPool: any;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Setup mocks
    mockQuery = jest.fn();
    mockPool = { query: mockQuery };

    // Import mocked modules
    ({ getPool } = require('../../../src/config/database'));
    logger = require('../../../src/utils/logger').default;
    crypto = require('crypto');

    getPool.mockReturnValue(mockPool);
    crypto.randomBytes = jest.fn().mockReturnValue({
      toString: jest.fn().mockReturnValue('abc123def456'),
    });

    // Import class under test
    DeviceManager = require('../../../src/services/DeviceManager').default;
  });

  // =============================================================================
  // registerDevice()
  // =============================================================================

  describe('registerDevice()', () => {
    const mockDeviceData = {
      deviceName: 'Test Scanner',
      deviceType: 'mobile',
      venueId: 'venue-123',
      registeredBy: 'user-456',
      ipAddress: '192.168.1.1',
      userAgent: 'TestAgent/1.0',
      appVersion: '1.0.0',
      canScanOffline: true,
      metadata: { key: 'value' },
    };

    const mockDevice = {
      device_id: 'SCANNER-ABC123DEF456',
      device_name: 'Test Scanner',
      device_type: 'mobile',
      venue_id: 'venue-123',
      registered_by: 'user-456',
      ip_address: '192.168.1.1',
      user_agent: 'TestAgent/1.0',
      app_version: '1.0.0',
      can_scan_offline: true,
      is_active: true,
      registered_at: new Date(),
      metadata: { key: 'value' },
    };

    it('should successfully register device with auto-generated ID', async () => {
      mockQuery.mockResolvedValue({ rows: [mockDevice] });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.registerDevice(mockDeviceData);

      expect(result.success).toBe(true);
      expect(result.device).toEqual(mockDevice);
      expect(crypto.randomBytes).toHaveBeenCalledWith(8);
      expect(logger.info).toHaveBeenCalledWith('Registered new device: SCANNER-ABC123DEF456');
    });

    it('should use provided deviceId instead of generating one', async () => {
      const dataWithId = { ...mockDeviceData, deviceId: 'CUSTOM-ID-123' };
      const deviceWithCustomId = { ...mockDevice, device_id: 'CUSTOM-ID-123' };

      mockQuery.mockResolvedValue({ rows: [deviceWithCustomId] });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.registerDevice(dataWithId);

      expect(result.success).toBe(true);
      expect(result.device.device_id).toBe('CUSTOM-ID-123');
      expect(crypto.randomBytes).not.toHaveBeenCalled();
    });

    it('should use default values when optional fields missing', async () => {
      const minimalData = {
        deviceName: 'Minimal Scanner',
        venueId: 'venue-123',
        registeredBy: 'user-456',
      };

      mockQuery.mockResolvedValue({ rows: [mockDevice] });

      const deviceManager = new DeviceManager();
      await deviceManager.registerDevice(minimalData);

      const params = mockQuery.mock.calls[0][1];
      expect(params[2]).toBe('mobile'); // default deviceType
      expect(params[8]).toBe(false); // default canScanOffline
      expect(params[9]).toBe('{}'); // default metadata
    });

    it('should throw error when device ID already exists', async () => {
      const error = new Error('Duplicate key');
      error.code = '23505';
      mockQuery.mockRejectedValue(error);

      const deviceManager = new DeviceManager();

      await expect(deviceManager.registerDevice(mockDeviceData)).rejects.toThrow('Device ID already exists');
      // Note: logger.error is NOT called for 23505 errors, only for other errors
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database connection failed');
      mockQuery.mockRejectedValue(dbError);

      const deviceManager = new DeviceManager();

      await expect(deviceManager.registerDevice(mockDeviceData)).rejects.toThrow('Database connection failed');
      expect(logger.error).toHaveBeenCalledWith('Error registering device:', dbError);
    });

    it('should properly stringify metadata object', async () => {
      const complexMetadata = {
        location: { lat: 40.7128, lng: -74.006 },
        tags: ['entrance', 'vip'],
        count: 42,
      };
      const dataWithComplexMetadata = { ...mockDeviceData, metadata: complexMetadata };

      mockQuery.mockResolvedValue({ rows: [mockDevice] });

      const deviceManager = new DeviceManager();
      await deviceManager.registerDevice(dataWithComplexMetadata);

      const params = mockQuery.mock.calls[0][1];
      expect(params[9]).toBe(JSON.stringify(complexMetadata));
    });

    it('should generate device ID with SCANNER- prefix and uppercase hex', async () => {
      crypto.randomBytes.mockReturnValue({
        toString: jest.fn().mockReturnValue('1a2b3c4d5e6f7890'),
      });

      mockQuery.mockResolvedValue({ rows: [mockDevice] });

      const deviceManager = new DeviceManager();
      await deviceManager.registerDevice(mockDeviceData);

      const calledDeviceId = mockQuery.mock.calls[0][1][0];
      expect(calledDeviceId).toMatch(/^SCANNER-[A-F0-9]{16}$/);
    });
  });

  // =============================================================================
  // revokeDevice()
  // =============================================================================

  describe('revokeDevice()', () => {
    const mockRevokedDevice = {
      device_id: 'SCANNER-123',
      device_name: 'Test Scanner',
      is_active: false,
      revoked_at: new Date(),
      revoked_by: 'admin-123',
      revoked_reason: 'Lost device',
    };

    it('should successfully revoke a device', async () => {
      mockQuery.mockResolvedValue({ rows: [mockRevokedDevice] });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.revokeDevice('SCANNER-123', 'admin-123', 'Lost device');

      expect(result.success).toBe(true);
      expect(result.device).toEqual(mockRevokedDevice);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scanner_devices'),
        ['SCANNER-123', 'admin-123', 'Lost device']
      );
      expect(logger.info).toHaveBeenCalledWith('Revoked device: SCANNER-123');
    });

    it('should throw error when device not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const deviceManager = new DeviceManager();

      await expect(deviceManager.revokeDevice('NON-EXISTENT', 'admin-123', 'Test')).rejects.toThrow('Device not found');
      expect(logger.error).toHaveBeenCalledWith('Error revoking device:', expect.any(Error));
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database error');
      mockQuery.mockRejectedValue(dbError);

      const deviceManager = new DeviceManager();

      await expect(deviceManager.revokeDevice('SCANNER-123', 'admin-123', 'Test')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error revoking device:', dbError);
    });
  });

  // =============================================================================
  // getDevice()
  // =============================================================================

  describe('getDevice()', () => {
    const mockDevice = {
      device_id: 'SCANNER-123',
      device_name: 'Test Scanner',
      device_type: 'mobile',
      venue_id: 'venue-123',
      is_active: true,
    };

    it('should successfully retrieve a device', async () => {
      mockQuery.mockResolvedValue({ rows: [mockDevice] });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.getDevice('SCANNER-123');

      expect(result).toEqual(mockDevice);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM scanner_devices WHERE device_id = $1',
        ['SCANNER-123']
      );
    });

    it('should return null when device not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.getDevice('NON-EXISTENT');

      expect(result).toBeNull();
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database error');
      mockQuery.mockRejectedValue(dbError);

      const deviceManager = new DeviceManager();

      await expect(deviceManager.getDevice('SCANNER-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error getting device:', dbError);
    });
  });

  // =============================================================================
  // listVenueDevices()
  // =============================================================================

  describe('listVenueDevices()', () => {
    const mockDevices = [
      {
        device_id: 'SCANNER-001',
        device_name: 'Scanner 1',
        venue_id: 'venue-123',
        is_active: true,
        registered_at: new Date('2024-01-01'),
      },
      {
        device_id: 'SCANNER-002',
        device_name: 'Scanner 2',
        venue_id: 'venue-123',
        is_active: true,
        registered_at: new Date('2024-01-02'),
      },
    ];

    it('should list active devices for venue by default', async () => {
      mockQuery.mockResolvedValue({ rows: mockDevices });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.listVenueDevices('venue-123');

      expect(result).toEqual(mockDevices);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE venue_id = $1 AND is_active = true'),
        ['venue-123']
      );
    });

    it('should list active devices when activeOnly is true', async () => {
      mockQuery.mockResolvedValue({ rows: mockDevices });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.listVenueDevices('venue-123', true);

      expect(result).toEqual(mockDevices);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        ['venue-123']
      );
    });

    it('should list all devices when activeOnly is false', async () => {
      const allDevices = [...mockDevices, {
        device_id: 'SCANNER-003',
        device_name: 'Revoked Scanner',
        venue_id: 'venue-123',
        is_active: false,
        registered_at: new Date('2024-01-03'),
      }];
      mockQuery.mockResolvedValue({ rows: allDevices });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.listVenueDevices('venue-123', false);

      expect(result).toEqual(allDevices);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('is_active = true'),
        ['venue-123']
      );
    });

    it('should return empty array when no devices found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.listVenueDevices('venue-999');

      expect(result).toEqual([]);
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database error');
      mockQuery.mockRejectedValue(dbError);

      const deviceManager = new DeviceManager();

      await expect(deviceManager.listVenueDevices('venue-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error listing venue devices:', dbError);
    });
  });

  // =============================================================================
  // updateDeviceSync()
  // =============================================================================

  describe('updateDeviceSync()', () => {
    it('should successfully update device sync timestamp', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const deviceManager = new DeviceManager();
      const result = await deviceManager.updateDeviceSync('SCANNER-123');

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
        ['SCANNER-123']
      );
    });

    it('should throw error when database query fails', async () => {
      const dbError = new Error('Database error');
      mockQuery.mockRejectedValue(dbError);

      const deviceManager = new DeviceManager();

      await expect(deviceManager.updateDeviceSync('SCANNER-123')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Error updating device sync:', dbError);
    });
  });
});
