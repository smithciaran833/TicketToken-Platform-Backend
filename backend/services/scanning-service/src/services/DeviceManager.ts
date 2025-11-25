import { getPool } from '../config/database';
import crypto from 'crypto';
import logger from '../utils/logger';
import { Pool } from 'pg';

interface DeviceData {
  deviceId?: string;
  deviceName: string;
  deviceType?: string;
  venueId: string;
  registeredBy: string;
  ipAddress?: string;
  userAgent?: string;
  appVersion?: string;
  canScanOffline?: boolean;
  metadata?: Record<string, any>;
}

interface Device {
  device_id: string;
  device_name: string;
  device_type: string;
  venue_id: string;
  registered_by: string;
  ip_address: string;
  user_agent: string;
  app_version: string;
  can_scan_offline: boolean;
  is_active: boolean;
  registered_at: Date;
  last_sync_at?: Date;
  revoked_at?: Date;
  revoked_by?: string;
  revoked_reason?: string;
  metadata: any;
}

export default class DeviceManager {
  /**
   * Register a new scanner device
   */
  async registerDevice(deviceData: DeviceData): Promise<{ success: boolean; device: Device }> {
    const pool = getPool();

    try {
      const deviceId = deviceData.deviceId || `SCANNER-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

      const result = await pool.query(`
        INSERT INTO scanner_devices (
          device_id, device_name, device_type, venue_id,
          registered_by, ip_address, user_agent, app_version,
          can_scan_offline, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        deviceId,
        deviceData.deviceName,
        deviceData.deviceType || 'mobile',
        deviceData.venueId,
        deviceData.registeredBy,
        deviceData.ipAddress,
        deviceData.userAgent,
        deviceData.appVersion,
        deviceData.canScanOffline || false,
        JSON.stringify(deviceData.metadata || {})
      ]);

      logger.info(`Registered new device: ${deviceId}`);

      return {
        success: true,
        device: result.rows[0]
      };

    } catch (error: any) {
      if (error.code === '23505') {
        throw new Error('Device ID already exists');
      }
      logger.error('Error registering device:', error);
      throw error;
    }
  }

  /**
   * Revoke a device's access
   */
  async revokeDevice(deviceId: string, revokedBy: string, reason: string): Promise<{ success: boolean; device: Device }> {
    const pool = getPool();

    try {
      const result = await pool.query(`
        UPDATE scanner_devices
        SET is_active = false,
            revoked_at = NOW(),
            revoked_by = $2,
            revoked_reason = $3,
            updated_at = NOW()
        WHERE device_id = $1
        RETURNING *
      `, [deviceId, revokedBy, reason]);

      if (result.rows.length === 0) {
        throw new Error('Device not found');
      }

      logger.info(`Revoked device: ${deviceId}`);

      return {
        success: true,
        device: result.rows[0]
      };

    } catch (error) {
      logger.error('Error revoking device:', error);
      throw error;
    }
  }

  /**
   * Get device information
   */
  async getDevice(deviceId: string): Promise<Device | null> {
    const pool = getPool();

    try {
      const result = await pool.query(
        'SELECT * FROM scanner_devices WHERE device_id = $1',
        [deviceId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      logger.error('Error getting device:', error);
      throw error;
    }
  }

  /**
   * List devices for a venue
   */
  async listVenueDevices(venueId: string, activeOnly: boolean = true): Promise<Device[]> {
    const pool = getPool();

    try {
      let query = 'SELECT * FROM scanner_devices WHERE venue_id = $1';
      const params: any[] = [venueId];

      if (activeOnly) {
        query += ' AND is_active = true';
      }

      query += ' ORDER BY registered_at DESC';

      const result = await pool.query(query, params);

      return result.rows;

    } catch (error) {
      logger.error('Error listing venue devices:', error);
      throw error;
    }
  }

  /**
   * Update device sync status
   */
  async updateDeviceSync(deviceId: string): Promise<{ success: boolean }> {
    const pool = getPool();

    try {
      await pool.query(
        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
        [deviceId]
      );

      return { success: true };

    } catch (error) {
      logger.error('Error updating device sync:', error);
      throw error;
    }
  }
}
