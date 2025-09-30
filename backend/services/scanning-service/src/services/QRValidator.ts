import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { getRedis } from '../config/redis';
import QRGenerator from './QRGenerator';
import logger from '../utils/logger';
import crypto from 'crypto';

interface TokenValidation {
  valid: boolean;
  reason?: string;
}

interface DuplicateCheck {
  isDuplicate: boolean;
  lastScan?: string;
}

interface PolicyCheck {
  allowed: boolean;
  reason?: string;
  minutesRemaining?: number;
  required?: string;
  deviceZone?: string;
}

interface ScanResult {
  valid: boolean;
  result: 'ALLOW' | 'DENY' | 'ERROR';
  reason?: string;
  message: string;
  ticket?: {
    id: string;
    event_name: string;
    ticket_number: string;
    access_level: string;
  };
  scan_count?: number;
}

class QRValidator {
  private qrGenerator: QRGenerator;
  private hmacSecret: string;
  private timeWindowSeconds: number;

  constructor() {
    this.qrGenerator = new QRGenerator();
    this.hmacSecret = process.env.HMAC_SECRET || 'default-secret-change-in-production';
    this.timeWindowSeconds = 30; // QR code valid for 30 seconds
  }

  /**
   * Validate QR token with HMAC and time window
   */
  validateQRToken(ticketId: string, timestamp: string, providedHmac: string): TokenValidation {
    const now = Date.now();
    const tokenAge = now - parseInt(timestamp);

    // Check if token is within valid time window
    if (tokenAge > this.timeWindowSeconds * 1000) {
      return { valid: false, reason: 'QR_EXPIRED' };
    }

    // Verify HMAC
    const data = `${ticketId}:${timestamp}`;
    const expectedHmac = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(data)
      .digest('hex');

    if (providedHmac !== expectedHmac) {
      return { valid: false, reason: 'INVALID_QR' };
    }

    return { valid: true };
  }

  /**
   * Check duplicate scan within window
   */
  async checkDuplicate(ticketId: string, windowMinutes: number): Promise<DuplicateCheck> {
    const pool = getPool();
    const redis = getRedis();

    // Quick check in Redis first
    const redisKey = `scan:duplicate:${ticketId}`;
    const cached = await redis.get(redisKey);
    if (cached) {
      return { isDuplicate: true, lastScan: cached };
    }

    // Check database for recent scans
    const result = await pool.query(`
      SELECT scanned_at
      FROM scans
      WHERE ticket_id = $1
        AND result = 'ALLOW'
        AND scanned_at > NOW() - INTERVAL '${windowMinutes} minutes'
      ORDER BY scanned_at DESC
      LIMIT 1
    `, [ticketId]);

    if (result.rows.length > 0) {
      // Cache in Redis for quick lookup
      await redis.setex(redisKey, windowMinutes * 60, result.rows[0].scanned_at);
      return { isDuplicate: true, lastScan: result.rows[0].scanned_at };
    }

    return { isDuplicate: false };
  }

  /**
   * Check re-entry policy
   */
  async checkReentryPolicy(
    ticketId: string,
    eventId: string,
    scanCount: number,
    lastScannedAt: Date | null
  ): Promise<PolicyCheck> {
    const pool = getPool();

    // Get re-entry policy for event
    const policyResult = await pool.query(`
      SELECT config
      FROM scan_policies
      WHERE event_id = $1
        AND policy_type = 'REENTRY'
        AND is_active = true
      LIMIT 1
    `, [eventId]);

    if (policyResult.rows.length === 0) {
      // No re-entry allowed by default
      return { allowed: false, reason: 'NO_REENTRY' };
    }

    const policy = policyResult.rows[0].config;

    if (!policy.enabled) {
      return { allowed: false, reason: 'REENTRY_DISABLED' };
    }

    // Check max re-entries
    if (scanCount >= policy.max_reentries) {
      return { allowed: false, reason: 'MAX_REENTRIES_REACHED' };
    }

    // Check cooldown period
    if (lastScannedAt) {
      const minutesSinceLastScan =
        (Date.now() - new Date(lastScannedAt).getTime()) / (1000 * 60);

      if (minutesSinceLastScan < policy.cooldown_minutes) {
        return {
          allowed: false,
          reason: 'COOLDOWN_ACTIVE',
          minutesRemaining: Math.ceil(policy.cooldown_minutes - minutesSinceLastScan)
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check access zone permissions
   */
  async checkAccessZone(ticketAccessLevel: string, deviceZone: string): Promise<PolicyCheck> {
    const zoneHierarchy: Record<string, string[]> = {
      'BACKSTAGE': ['BACKSTAGE'],
      'VIP': ['VIP', 'GA'],
      'GA': ['GA'],
      'ALL': ['BACKSTAGE', 'VIP', 'GA']
    };

    const allowedZones = zoneHierarchy[ticketAccessLevel] || ['GA'];

    if (!allowedZones.includes(deviceZone)) {
      return {
        allowed: false,
        reason: 'WRONG_ZONE',
        required: ticketAccessLevel,
        deviceZone: deviceZone
      };
    }

    return { allowed: true };
  }

  /**
   * Main validation method with full policy enforcement
   */
  async validateScan(
    qrData: string | any,
    deviceId: string,
    location: string | null = null,
    staffUserId: string | null = null
  ): Promise<ScanResult> {
    const pool = getPool();
    const redis = getRedis();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Parse QR data
      let ticketId: string, timestamp: string, hmac: string;

      if (typeof qrData === 'string') {
        // Format: ticketId:timestamp:hmac
        const parts = qrData.split(':');
        if (parts.length !== 3) {
          throw new Error('Invalid QR format');
        }
        [ticketId, timestamp, hmac] = parts;
      } else {
        ticketId = qrData.ticketId;
        timestamp = qrData.timestamp;
        hmac = qrData.hmac;
      }

      // Validate QR token
      const tokenValidation = this.validateQRToken(ticketId, timestamp, hmac);
      if (!tokenValidation.valid) {
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: tokenValidation.reason,
          message: tokenValidation.reason === 'QR_EXPIRED'
            ? 'QR code expired. Please refresh.'
            : 'Invalid QR code'
        };
      }

      // Get device details
      const deviceResult = await client.query(
        'SELECT * FROM devices WHERE device_id = $1 AND is_active = true',
        [deviceId]
      );

      if (deviceResult.rows.length === 0) {
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'UNAUTHORIZED_DEVICE',
          message: 'Device not authorized'
        };
      }

      const device = deviceResult.rows[0];

      // Get ticket details
      const ticketResult = await client.query(`
        SELECT
          t.*,
          e.id as event_id,
          e.name as event_name
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = $1
      `, [ticketId]);

      if (ticketResult.rows.length === 0) {
        await this.logScan(client, ticketId, device.id, 'DENY', 'TICKET_NOT_FOUND');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'TICKET_NOT_FOUND',
          message: 'Ticket not found'
        };
      }

      const ticket = ticketResult.rows[0];

      // Check ticket status
      if (ticket.status !== 'SOLD' && ticket.status !== 'MINTED') {
        await this.logScan(client, ticketId, device.id, 'DENY', 'INVALID_STATUS');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'INVALID_STATUS',
          message: `Ticket status: ${ticket.status}`
        };
      }

      // Check access zone
      const zoneCheck = await this.checkAccessZone(
        ticket.access_level || 'GA',
        device.zone
      );

      if (!zoneCheck.allowed) {
        await this.logScan(client, ticketId, device.id, 'DENY', zoneCheck.reason!);
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: zoneCheck.reason,
          message: `This ticket requires ${zoneCheck.required} access. Device is in ${zoneCheck.deviceZone} zone.`
        };
      }

      // Get duplicate window policy
      const dupPolicyResult = await client.query(`
        SELECT config
        FROM scan_policies
        WHERE event_id = $1
          AND policy_type = 'DUPLICATE_WINDOW'
          AND is_active = true
        LIMIT 1
      `, [ticket.event_id]);

      const windowMinutes = dupPolicyResult.rows.length > 0
        ? dupPolicyResult.rows[0].config.window_minutes
        : 10;

      // Check for duplicate scan
      const duplicateCheck = await this.checkDuplicate(ticketId, windowMinutes);

      if (duplicateCheck.isDuplicate) {
        // Check if re-entry is allowed
        const reentryCheck = await this.checkReentryPolicy(
          ticketId,
          ticket.event_id,
          ticket.scan_count || 0,
          ticket.last_scanned_at
        );

        if (!reentryCheck.allowed) {
          const reason = reentryCheck.reason!;
          
          if (reason === 'NO_REENTRY' || reason === 'REENTRY_DISABLED') {
            await this.logScan(client, ticketId, device.id, 'DENY', 'DUPLICATE');
            await client.query('COMMIT');
            return {
              valid: false,
              result: 'DENY',
              reason: 'DUPLICATE',
              message: 'Ticket already scanned'
            };
          }

          await this.logScan(client, ticketId, device.id, 'DENY', reason);
          await client.query('COMMIT');

          let message = 'Re-entry not allowed';
          if (reason === 'COOLDOWN_ACTIVE') {
            message = `Please wait ${reentryCheck.minutesRemaining} minutes before re-entry`;
          } else if (reason === 'MAX_REENTRIES_REACHED') {
            message = 'Maximum re-entries reached';
          }

          return {
            valid: false,
            result: 'DENY',
            reason: reason,
            message: message
          };
        }
      }

      // All checks passed - allow entry
      await client.query(`
        UPDATE tickets
        SET
          scan_count = COALESCE(scan_count, 0) + 1,
          last_scanned_at = NOW(),
          first_scanned_at = COALESCE(first_scanned_at, NOW())
        WHERE id = $1
      `, [ticketId]);

      await this.logScan(client, ticketId, device.id, 'ALLOW', 'VALID_ENTRY');

      // Clear and set cache
      await redis.del(`scan:duplicate:${ticketId}`);
      await redis.setex(`scan:duplicate:${ticketId}`, windowMinutes * 60, new Date().toISOString());

      await this.emitScanEvent(ticket, device, 'ALLOW');

      await client.query('COMMIT');

      return {
        valid: true,
        result: 'ALLOW',
        ticket: {
          id: ticket.id,
          event_name: ticket.event_name,
          ticket_number: ticket.ticket_number,
          access_level: ticket.access_level || 'GA'
        },
        scan_count: (ticket.scan_count || 0) + 1,
        message: 'Entry allowed'
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Scan validation error:', error);

      return {
        valid: false,
        result: 'ERROR',
        reason: 'SYSTEM_ERROR',
        message: 'System error during scan validation'
      };
    } finally {
      client.release();
    }
  }

  /**
   * Log scan attempt
   */
  async logScan(
    client: PoolClient,
    ticketId: string,
    deviceId: string,
    result: string,
    reason: string
  ): Promise<void> {
    await client.query(`
      INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [ticketId, deviceId, result, reason]);
  }

  /**
   * Emit scan event for real-time updates
   */
  async emitScanEvent(ticket: any, device: any, result: string): Promise<void> {
    logger.info('Scan event:', {
      ticketId: ticket.id,
      deviceId: device.id,
      result: result,
      timestamp: new Date()
    });
  }

  /**
   * Get scan statistics
   */
  async getScanStats(eventId: string, timeRange: string = '1 hour'): Promise<any> {
    const pool = getPool();

    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE result = 'ALLOW') as allowed,
        COUNT(*) FILTER (WHERE result = 'DENY') as denied,
        COUNT(*) FILTER (WHERE reason = 'DUPLICATE') as duplicates,
        COUNT(*) FILTER (WHERE reason = 'WRONG_ZONE') as wrong_zone,
        COUNT(*) FILTER (WHERE reason = 'REENTRY_DENIED') as reentry_denied,
        COUNT(*) as total
      FROM scans s
      JOIN tickets t ON s.ticket_id = t.id
      WHERE t.event_id = $1
        AND s.scanned_at > NOW() - INTERVAL '${timeRange}'
    `, [eventId]);

    return result.rows[0];
  }
}

export default QRValidator;
