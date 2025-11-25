import DeviceManager from '../../src/services/DeviceManager';
import { getPool } from '../../src/config/database';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/utils/logger');

describe('DeviceManager', () => {
  let deviceManager: DeviceManager;
  let mockPool: any;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
    deviceManager = new DeviceManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerDevice', () => {
    it('should register a new device successfully', async () => {
      const deviceData = {
        deviceName: 'Scanner 1',
        deviceType: 'mobile',
        venueId: 'venue-123',
        registeredBy: 'staff-456',
        ipAddress: '192.168.1.1',
        userAgent: 'iOS/14.0',
        appVersion: '1.0.0',
        canScanOffline: true
      };

      const mockDevice = {
        device_id: 'SCANNER-ABC123',
        device_name: 'Scanner 1',
        device_type: 'mobile',
        venue_id: 'venue-123',
        registered_by: 'staff-456',
        is_active: true
      };

      mockPool.query.mockResolvedValue({ rows: [mockDevice] });

      const result = await deviceManager.registerDevice(deviceData);

      expect(result.success).toBe(true);
      expect(result.device).toEqual(mockDevice);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO scanner_devices'),
        expect.arrayContaining([
          expect.stringMatching(/^SCANNER-/),
          'Scanner 1',
          'mobile',
          'venue-123',
          'staff-456',
          '192.168.1.1',
          'iOS/14.0',
          '1.0.0',
          true,
          expect.any(String)
        ])
      );
    });

    it('should use provided device ID if given', async () => {
      const deviceData = {
        deviceId: 'CUSTOM-ID-123',
        deviceName: 'Scanner 2',
        venueId: 'venue-123',
        registeredBy: 'staff-456'
      };

      mockPool.query.mockResolvedValue({ 
        rows: [{ device_id: 'CUSTOM-ID-123' }] 
      });

      await deviceManager.registerDevice(deviceData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['CUSTOM-ID-123'])
      );
    });

    it('should use default device type if not provided', async () => {
      const deviceData = {
        deviceName: 'Scanner 3',
        venueId: 'venue-123',
        registeredBy: 'staff-456'
      };

      mockPool.query.mockResolvedValue({ rows: [{}] });

      await deviceManager.registerDevice(deviceData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['mobile'])
      );
    });

    it('should set canScanOffline to false by default', async () => {
      const deviceData = {
        deviceName: 'Scanner 4',
        venueId: 'venue-123',
        registeredBy: 'staff-456'
      };

      mockPool.query.mockResolvedValue({ rows: [{}] });

      await deviceManager.registerDevice(deviceData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([false])
      );
    });

    it('should throw error for duplicate device ID', async () => {
      const deviceData = {
        deviceId: 'DUPLICATE-ID',
        deviceName: 'Scanner 5',
        venueId: 'venue-123',
        registeredBy: 'staff-456'
      };

      mockPool.query.mockRejectedValue({ code: '23505' });

      await expect(deviceManager.registerDevice(deviceData))
        .rejects.toThrow('Device ID already exists');
    });

    it('should propagate other database errors', async () => {
      const deviceData = {
        deviceName: 'Scanner 6',
        venueId: 'venue-123',
        registeredBy: 'staff-456'
      };

      const dbError = new Error('Database connection failed');
      mockPool.query.mockRejectedValue(dbError);

      await expect(deviceManager.registerDevice(deviceData))
        .rejects.toThrow('Database connection failed');
    });
  });

  describe('revokeDevice', () => {
    it('should revoke device successfully', async () => {
      const deviceId = 'SCANNER-123';
      const revokedBy = 'admin-456';
      const reason = 'Device lost';

      const mockRevokedDevice = {
        device_id: deviceId,
        is_active: false,
        revoked_at: new Date(),
        revoked_by: revokedBy,
        revoked_reason: reason
      };

      mockPool.query.mockResolvedValue({ rows: [mockRevokedDevice] });

      const result = await deviceManager.revokeDevice(deviceId, revokedBy, reason);

      expect(result.success).toBe(true);
      expect(result.device).toEqual(mockRevokedDevice);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE scanner_devices'),
        [deviceId, revokedBy, reason]
      );
    });

    it('should throw error if device not found', async () => {
      const deviceId = 'NONEXISTENT';
      const revokedBy = 'admin-456';
      const reason = 'Test';

      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(deviceManager.revokeDevice(deviceId, revokedBy, reason))
        .rejects.toThrow('Device not found');
    });

    it('should handle database errors', async () => {
      const deviceId = 'SCANNER-123';
      const revokedBy = 'admin-456';
      const reason = 'Test';

      mockPool.query.mockRejectedValue(new Error('DB error'));

      await expect(deviceManager.revokeDevice(deviceId, revokedBy, reason))
        .rejects.toThrow('DB error');
    });
  });

  describe('getDevice', () => {
    it('should return device if found', async () => {
      const deviceId = 'SCANNER-123';
      const mockDevice = {
        device_id: deviceId,
        device_name: 'Scanner 1',
        is_active: true
      };

      mockPool.query.mockResolvedValue({ rows: [mockDevice] });

      const result = await deviceManager.getDevice(deviceId);

      expect(result).toEqual(mockDevice);
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM scanner_devices WHERE device_id = $1',
        [deviceId]
      );
    });

    it('should return null if device not found', async () => {
      const deviceId = 'NONEXISTENT';

      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await deviceManager.getDevice(deviceId);

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      const deviceId = 'SCANNER-123';

      mockPool.query.mockRejectedValue(new Error('DB error'));

      await expect(deviceManager.getDevice(deviceId))
        .rejects.toThrow('DB error');
    });
  });

  describe('listVenueDevices', () => {
    it('should list active devices for venue by default', async () => {
      const venueId = 'venue-123';
      const mockDevices = [
        { device_id: 'SCANNER-1', is_active: true },
        { device_id: 'SCANNER-2', is_active: true }
      ];

      mockPool.query.mockResolvedValue({ rows: mockDevices });

      const result = await deviceManager.listVenueDevices(venueId);

      expect(result).toEqual(mockDevices);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE venue_id = $1 AND is_active = true'),
        [venueId]
      );
    });

    it('should list all devices when activeOnly is false', async () => {
      const venueId = 'venue-123';
      const mockDevices = [
        { device_id: 'SCANNER-1', is_active: true },
        { device_id: 'SCANNER-2', is_active: false }
      ];

      mockPool.query.mockResolvedValue({ rows: mockDevices });

      const result = await deviceManager.listVenueDevices(venueId, false);

      expect(result).toEqual(mockDevices);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.not.stringContaining('AND is_active = true'),
        [venueId]
      );
    });

    it('should return empty array if no devices found', async () => {
      const venueId = 'venue-123';

      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await deviceManager.listVenueDevices(venueId);

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const venueId = 'venue-123';

      mockPool.query.mockRejectedValue(new Error('DB error'));

      await expect(deviceManager.listVenueDevices(venueId))
        .rejects.toThrow('DB error');
    });
  });

  describe('updateDeviceSync', () => {
    it('should update device sync successfully', async () => {
      const deviceId = 'SCANNER-123';

      mockPool.query.mockResolvedValue({});

      const result = await deviceManager.updateDeviceSync(deviceId);

      expect(result.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
        [deviceId]
      );
    });

    it('should handle database errors', async () => {
      const deviceId = 'SCANNER-123';

      mockPool.query.mockRejectedValue(new Error('DB error'));

      await expect(deviceManager.updateDeviceSync(deviceId))
        .rejects.toThrow('DB error');
    });
  });
});
