import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database';
import { getRedis } from '../config/redis';
import QRGenerator from './QRGenerator';
import logger from '../utils/logger';
import crypto from 'crypto';

/**
 * QR VALIDATOR SERVICE
 * 
 * Core ticket scanning validation with policy enforcement.
 * 
 * PHASE 5c BYPASS EXCEPTION:
 * This is the most performance-critical service in scanning-service.
 * It reads from tickets/events and WRITES scan_count updates to tickets.
 * This is intentional because:
 * 
 * 1. LATENCY: Scanning must complete in <500ms for real-time entry validation
 * 2. ATOMICITY: The validation + scan_count update must be transactional
 * 3. VOLUME: Events can have thousands of scans per minute at entry
 * 4. AVAILABILITY: Scanning must work even if ticket-service is degraded
 * 5. The scans table (primary data) is scanning-service owned
 * 
 * The ticket writes (scan_count, last_scanned_at, first_scanned_at) are
 * metadata updates that should eventually be refactored to use:
 * - ticketServiceClient.recordScan() for async scan counting
 * - Event-driven updates via message queue
 * 
 * Current approach maintains data consistency within acceptable latency.
 */

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
    
    // SECURITY FIX: No default secret - fail fast if not configured
    if (!process.env.HMAC_SECRET) {
      throw new Error('FATAL: HMAC_SECRET environment variable is required for QR code security');
    }
    
    this.hmacSecret = process.env.HMAC_SECRET;
    this.timeWindowSeconds = 30; // QR code valid for 30 seconds
  }

  /**
   * Validate QR token with HMAC and time window
   * Phase 2.8: Added nonce validation to prevent replay attacks
   */
  async validateQRToken(ticketId: string, timestamp: string, nonce: string, providedHmac: string): Promise<TokenValidation> {
    const redis = getRedis();
    const now = Date.now();
    const tokenAge = now - parseInt(timestamp);

    // Check if token is within valid time window
    if (tokenAge > this.timeWindowSeconds * 1000) {
      return { valid: false, reason: 'QR_EXPIRED' };
    }

    // Phase 2.8: Check if nonce has already been used (replay attack prevention)
    const nonceKey = `qr-nonce:${nonce}`;
    const alreadyUsed = await redis.get(nonceKey);
    
    if (alreadyUsed) {
      logger.warn('Replay attack detected - nonce already used', { nonce, ticketId });
      return { valid: false, reason: 'QR_ALREADY_USED' };
    }

    // Verify HMAC using timing-safe comparison
    const data = `${ticketId}:${timestamp}:${nonce}`;
    const expectedHmac = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(data)
      .digest('hex');

    // SECURITY FIX: Use constant-time comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedHmac, 'hex');
    const providedBuffer = Buffer.from(providedHmac, 'hex');
    
    if (expectedBuffer.length !== providedBuffer.length || 
        !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      return { valid: false, reason: 'INVALID_QR' };
    }

    // Mark nonce as used (expire after QR expiration window + buffer)
    await redis.setex(nonceKey, 60, '1');

    return { valid: true };
  }

  /**
   * Check duplicate scan within window
   */
  async checkDuplicate(ticketId: string, windowMinutes: number): Promise<DuplicateCheck> {
    const pool = getPool();
    const redis = getRedis();

    // Input validation - SECURITY FIX
    const minutes = Number.parseInt(String(windowMinutes), 10);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) { // Max 24 hours
      throw new Error('Invalid window: must be 0-1440 minutes');
    }

    // Quick check in Redis first
    const redisKey = `scan:duplicate:${ticketId}`;
    const cached = await redis.get(redisKey);
    if (cached) {
      return { isDuplicate: true, lastScan: cached };
    }

    // Check database for recent scans - FIXED SQL INJECTION
    const result = await pool.query(`
      SELECT scanned_at
      FROM scans
      WHERE ticket_id = $1
        AND result = 'ALLOW'
        AND scanned_at > NOW() - make_interval(mins => $2)
      ORDER BY scanned_at DESC
      LIMIT 1
    `, [ticketId, minutes]);

    if (result.rows.length > 0) {
      // Cache in Redis for quick lookup
      await redis.setex(redisKey, minutes * 60, result.rows[0].scanned_at);
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
   * SECURITY: Enforces venue isolation - staff can only scan tickets for their assigned venue
   */
  async validateScan(
    qrData: string | any,
    deviceId: string,
    location: string | null = null,
    staffUserId: string | null = null,
    authenticatedUser?: { userId: string; tenantId: string; venueId?: string; role: string }
  ): Promise<ScanResult> {
    const pool = getPool();
    const redis = getRedis();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Parse QR data
      let ticketId: string, timestamp: string, nonce: string, hmac: string;

      if (typeof qrData === 'string') {
        // Format: ticketId:timestamp:nonce:hmac (Phase 2.8: Added nonce)
        const parts = qrData.split(':');
        if (parts.length !== 4) {
          throw new Error('Invalid QR format');
        }
        [ticketId, timestamp, nonce, hmac] = parts;
      } else {
        ticketId = qrData.ticketId;
        timestamp = qrData.timestamp;
        nonce = qrData.nonce;
        hmac = qrData.hmac;
      }

      // Validate QR token (Phase 2.8: Now includes nonce validation)
      const tokenValidation = await this.validateQRToken(ticketId, timestamp, nonce, hmac);
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

      // SECURITY FIX (Phase 1.3): Enforce venue staff isolation
      // Staff can only scan tickets using devices in their assigned venue
      if (authenticatedUser && authenticatedUser.venueId) {
        // Check if device belongs to staff's venue
        if (device.venue_id !== authenticatedUser.venueId) {
          logger.warn('Venue isolation violation - staff attempted to use device from different venue', {
            staffUserId: authenticatedUser.userId,
            staffVenueId: authenticatedUser.venueId,
            deviceVenueId: device.venue_id,
            deviceId: deviceId
          });

          await this.logScan(client, ticketId, device.id, 'DENY', 'VENUE_MISMATCH');
          await client.query('COMMIT');

          return {
            valid: false,
            result: 'DENY',
            reason: 'VENUE_MISMATCH',
            message: 'You can only scan tickets at your assigned venue'
          };
        }
      }

      // SECURITY FIX (Phase 1.3): Enforce tenant isolation
      // All operations must be scoped to the authenticated user's tenant
      if (authenticatedUser && device.tenant_id !== authenticatedUser.tenantId) {
        logger.error('CRITICAL: Tenant isolation violation detected', {
          staffUserId: authenticatedUser.userId,
          staffTenantId: authenticatedUser.tenantId,
          deviceTenantId: device.tenant_id,
          deviceId: deviceId
        });

        await this.logScan(client, ticketId, device.id, 'DENY', 'TENANT_MISMATCH');
        await client.query('COMMIT');

        return {
          valid: false,
          result: 'DENY',
          reason: 'UNAUTHORIZED',
          message: 'Authorization error'
        };
      }

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

      // SECURITY FIX (Phase 1.3): Verify ticket belongs to same tenant
      if (authenticatedUser && ticket.tenant_id !== authenticatedUser.tenantId) {
        logger.error('CRITICAL: Cross-tenant ticket scan attempt', {
          staffUserId: authenticatedUser.userId,
          staffTenantId: authenticatedUser.tenantId,
          ticketTenantId: ticket.tenant_id,
          ticketId: ticketId
        });

        await this.logScan(client, ticketId, device.id, 'DENY', 'TENANT_MISMATCH');
        await client.query('COMMIT');

        return {
          valid: false,
          result: 'DENY',
          reason: 'TICKET_NOT_FOUND',
          message: 'Ticket not found' // Don't reveal tenant mismatch to attacker
        };
      }

      // SECURITY FIX (Phase 1.3): Verify event belongs to device's venue (optional based on policy)
      if (device.venue_id && ticket.venue_id && device.venue_id !== ticket.venue_id) {
        logger.warn('Venue mismatch - ticket for different venue', {
          ticketId: ticketId,
          ticketVenueId: ticket.venue_id,
          deviceVenueId: device.venue_id,
          eventId: ticket.event_id
        });

        await this.logScan(client, ticketId, device.id, 'DENY', 'WRONG_VENUE');
        await client.query('COMMIT');

        return {
          valid: false,
          result: 'DENY',
          reason: 'WRONG_VENUE',
          message: 'This ticket is for a different venue'
        };
      }

      // PHASE 5.1: Check ticket expiration
      const now = new Date();
      
      // Check if event has started
      if (ticket.event_start_time && now < new Date(ticket.event_start_time)) {
        await this.logScan(client, ticketId, device.id, 'DENY', 'EVENT_NOT_STARTED');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'EVENT_NOT_STARTED',
          message: `Event starts at ${new Date(ticket.event_start_time).toLocaleString()}`
        };
      }

      // Check if event has ended
      if (ticket.event_end_time && now > new Date(ticket.event_end_time)) {
        await this.logScan(client, ticketId, device.id, 'DENY', 'EVENT_ENDED');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'EVENT_ENDED',
          message: 'Event has ended'
        };
      }

      // Check ticket validity period
      if (ticket.valid_from && now < new Date(ticket.valid_from)) {
        await this.logScan(client, ticketId, device.id, 'DENY', 'TICKET_NOT_YET_VALID');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'TICKET_NOT_YET_VALID',
          message: `Ticket valid from ${new Date(ticket.valid_from).toLocaleString()}`
        };
      }

      if (ticket.valid_until && now > new Date(ticket.valid_until)) {
        await this.logScan(client, ticketId, device.id, 'DENY', 'TICKET_EXPIRED');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'TICKET_EXPIRED',
          message: 'Ticket has expired'
        };
      }

      // PHASE 5.2: Check for refunded tickets
      if (ticket.status === 'REFUNDED') {
        await this.logScan(client, ticketId, device.id, 'DENY', 'TICKET_REFUNDED');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'TICKET_REFUNDED',
          message: 'This ticket has been refunded and is no longer valid'
        };
      }

      if (ticket.status === 'CANCELLED') {
        await this.logScan(client, ticketId, device.id, 'DENY', 'TICKET_CANCELLED');
        await client.query('COMMIT');
        return {
          valid: false,
          result: 'DENY',
          reason: 'TICKET_CANCELLED',
          message: 'This ticket has been cancelled'
        };
      }

      // PHASE 5.3: Handle transferred tickets
      if (ticket.status === 'TRANSFERRED') {
        // Get the new ticket ID from transfer record
        const transferResult = await client.query(`
          SELECT new_ticket_id 
          FROM ticket_transfers 
          WHERE old_ticket_id = $1 
          ORDER BY transferred_at DESC 
          LIMIT 1
        `, [ticketId]);

        if (transferResult.rows.length > 0) {
          const newTicketId = transferResult.rows[0].new_ticket_id;
          await this.logScan(client, ticketId, device.id, 'DENY', 'TICKET_TRANSFERRED');
          await client.query('COMMIT');
          return {
            valid: false,
            result: 'DENY',
            reason: 'TICKET_TRANSFERRED',
            message: `This ticket has been transferred. New ticket ID: ${newTicketId}`
          };
        }
      }

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

    // SECURITY FIX: Validate and whitelist time range values
    const validRanges: Record<string, number> = {
      '1 hour': 1,
      '6 hours': 6,
      '12 hours': 12,
      '24 hours': 24,
      '1 day': 24,
      '7 days': 168,
      '1 week': 168,
      '30 days': 720,
      '1 month': 720
    };

    const hours = validRanges[timeRange];
    if (!hours) {
      throw new Error('Invalid time range. Valid options: 1 hour, 6 hours, 12 hours, 24 hours, 7 days, 30 days');
    }

    // FIXED SQL INJECTION using parameterized query
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
        AND s.scanned_at > NOW() - make_interval(hours => $2)
    `, [eventId, hours]);

    return result.rows[0];
  }
}

export default QRValidator;
