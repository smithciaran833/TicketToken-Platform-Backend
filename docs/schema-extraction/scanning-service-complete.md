# COMPLETE DATABASE ANALYSIS: scanning-service
Generated: Thu Oct  2 15:07:55 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/policies.ts
```typescript
import express, { Request, Response, Router } from 'express';
import { getPool } from '../config/database';
import logger from '../utils/logger';

const router: Router = express.Router();

// GET /api/policies/templates - List available policy templates
router.get('/templates', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();

  try {
    const result = await pool.query(`
      SELECT id, name, description, policy_set, is_default
      FROM scan_policy_templates
      ORDER BY is_default DESC, name
    `);

    return res.json({
      success: true,
      templates: result.rows
    });

  } catch (error) {
    logger.error('Error fetching templates:', error);
    return res.status(500).json({
      success: false,
      error: 'FETCH_ERROR'
    });
  }
});

// GET /api/policies/event/:eventId - Get current policies for an event
router.get('/event/:eventId', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const { eventId } = req.params;

  try {
    const result = await pool.query(`
      SELECT
        sp.*,
        e.name as event_name,
        v.name as venue_name
      FROM scan_policies sp
      JOIN events e ON sp.event_id = e.id
      LEFT JOIN venues v ON sp.venue_id = v.id
      WHERE sp.event_id = $1
      ORDER BY sp.policy_type
    `, [eventId]);

    return res.json({
      success: true,
      policies: result.rows
    });

  } catch (error) {
    logger.error('Error fetching event policies:', error);
    return res.status(500).json({
      success: false,
      error: 'FETCH_ERROR'
    });
  }
});

// POST /api/policies/event/:eventId/apply-template - Apply a template to an event
router.post('/event/:eventId/apply-template', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const { eventId } = req.params;
  const { template_id } = req.body;

  if (!template_id) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_TEMPLATE_ID'
    });
  }

  try {
    await pool.query('SELECT apply_scan_policy_template($1, $2)', [eventId, template_id]);

    // Fetch the updated policies
    const result = await pool.query(`
      SELECT * FROM scan_policies
      WHERE event_id = $1
      ORDER BY policy_type
    `, [eventId]);

    return res.json({
      success: true,
      message: 'Policy template applied successfully',
      policies: result.rows
    });

  } catch (error: any) {
    logger.error('Error applying template:', error);
    return res.status(500).json({
      success: false,
      error: 'APPLY_ERROR',
      message: error.message
    });
  }
});

// PUT /api/policies/event/:eventId/custom - Set custom policies for an event
router.put('/event/:eventId/custom', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const client = await pool.connect();
  const { eventId } = req.params;
  const {
    duplicate_window_minutes,
    reentry_enabled,
    reentry_cooldown_minutes,
    max_reentries,
    strict_zones,
    vip_all_access
  } = req.body;

  try {
    await client.query('BEGIN');

    // Get venue_id
    const venueResult = await client.query(
      'SELECT venue_id FROM events WHERE id = $1',
      [eventId]
    );

    if (venueResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({
        success: false,
        error: 'EVENT_NOT_FOUND',
        message: 'Event not found'
      });
    }

    const venueId = venueResult.rows[0].venue_id;

    // Update or insert duplicate window policy
    if (duplicate_window_minutes !== undefined) {
      await client.query(`
        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
        VALUES ($1, $2, 'DUPLICATE_WINDOW', $3, 'Custom - Duplicate Window')
        ON CONFLICT (event_id, policy_type)
        DO UPDATE SET config = $3, updated_at = NOW()
      `, [eventId, venueId, JSON.stringify({ window_minutes: duplicate_window_minutes })]);
    }

    // Update or insert re-entry policy
    if (reentry_enabled !== undefined) {
      const reentryConfig = {
        enabled: reentry_enabled,
        cooldown_minutes: reentry_cooldown_minutes || 15,
        max_reentries: max_reentries || 2
      };

      await client.query(`
        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
        VALUES ($1, $2, 'REENTRY', $3, 'Custom - Re-entry')
        ON CONFLICT (event_id, policy_type)
        DO UPDATE SET config = $3, updated_at = NOW()
      `, [eventId, venueId, JSON.stringify(reentryConfig)]);
    }

    // Update or insert zone enforcement policy
    if (strict_zones !== undefined || vip_all_access !== undefined) {
      const zoneConfig = {
        strict: strict_zones !== false,
        vip_all_access: vip_all_access || false
      };

      await client.query(`
        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
        VALUES ($1, $2, 'ZONE_ENFORCEMENT', $3, 'Custom - Zone Access')
        ON CONFLICT (event_id, policy_type)
        DO UPDATE SET config = $3, updated_at = NOW()
      `, [eventId, venueId, JSON.stringify(zoneConfig)]);
    }

    await client.query('COMMIT');
    client.release();

    // Fetch updated policies
    const result = await pool.query(`
      SELECT * FROM scan_policies
      WHERE event_id = $1
      ORDER BY policy_type
    `, [eventId]);

    return res.json({
      success: true,
      message: 'Custom policies applied successfully',
      policies: result.rows
    });

  } catch (error: any) {
    await client.query('ROLLBACK');
    client.release();
    logger.error('Error setting custom policies:', error);
    return res.status(500).json({
      success: false,
      error: 'UPDATE_ERROR',
      message: error.message
    });
  }
});

export default router;
```

### FILE: src/routes/devices.ts
```typescript
import express, { Request, Response, Router } from 'express';
import { getPool } from '../config/database';
import logger from '../utils/logger';

const router: Router = express.Router();

// GET /api/devices - List all devices
router.get('/', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();

  try {
    const result = await pool.query(
      'SELECT * FROM devices WHERE is_active = true ORDER BY name'
    );

    return res.json({
      success: true,
      devices: result.rows
    });

  } catch (error) {
    logger.error('Device list error:', error);
    return res.status(500).json({
      success: false,
      error: 'DEVICE_LIST_ERROR'
    });
  }
});

// POST /api/devices/register - Register a new device
router.post('/register', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const { device_id, name, zone = 'GA' } = req.body;

  if (!device_id || !name) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_PARAMETERS'
    });
  }

  try {
    const result = await pool.query(`
      INSERT INTO devices (device_id, name, zone, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (device_id) DO UPDATE
      SET name = EXCLUDED.name, zone = EXCLUDED.zone, updated_at = NOW()
      RETURNING *
    `, [device_id, name, zone]);

    return res.json({
      success: true,
      device: result.rows[0]
    });

  } catch (error) {
    logger.error('Device registration error:', error);
    return res.status(500).json({
      success: false,
      error: 'REGISTRATION_ERROR'
    });
  }
});

export default router;
```

### FILE: src/routes/offline.ts
```typescript
import express, { Request, Response, Router } from 'express';
import QRGenerator from '../services/QRGenerator';
import { getPool } from '../config/database';
import logger from '../utils/logger';

const router: Router = express.Router();
const qrGenerator = new QRGenerator();

// GET /api/offline/manifest/:eventId - Get offline manifest for device
router.get('/manifest/:eventId', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { eventId } = req.params;
    const { device_id } = req.query;

    if (!device_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DEVICE_ID'
      });
    }

    const manifest = await qrGenerator.generateOfflineManifest(eventId, device_id as string);

    return res.json({
      success: true,
      manifest
    });

  } catch (error) {
    logger.error('Manifest generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'MANIFEST_ERROR'
    });
  }
});

// POST /api/offline/reconcile - Reconcile offline scans
router.post('/reconcile', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { device_id, scans } = req.body;

    if (!device_id || !scans || !Array.isArray(scans)) {
      client.release();
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST'
      });
    }

    await client.query('BEGIN');

    const results: any[] = [];

    for (const scan of scans) {
      try {
        // Check if this scan was already processed
        const existing = await client.query(`
          SELECT id FROM scans
          WHERE ticket_id = $1
            AND scanned_at = $2
          LIMIT 1
        `, [scan.ticket_id, scan.scanned_at]);

        if (existing.rows.length > 0) {
          results.push({
            ticket_id: scan.ticket_id,
            status: 'DUPLICATE',
            message: 'Already processed'
          });
          continue;
        }

        // Get device
        const deviceResult = await client.query(
          'SELECT id FROM devices WHERE device_id = $1',
          [device_id]
        );

        if (deviceResult.rows.length === 0) {
          results.push({
            ticket_id: scan.ticket_id,
            status: 'ERROR',
            message: 'Device not found'
          });
          continue;
        }

        // Insert scan record
        await client.query(`
          INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          scan.ticket_id,
          deviceResult.rows[0].id,
          scan.result,
          scan.reason,
          scan.scanned_at
        ]);

        // Update ticket if it was allowed
        if (scan.result === 'ALLOW') {
          await client.query(`
            UPDATE tickets
            SET
              scan_count = GREATEST(COALESCE(scan_count, 0), $1),
              last_scanned_at = GREATEST(COALESCE(last_scanned_at, $2), $2),
              first_scanned_at = LEAST(COALESCE(first_scanned_at, $2), $2)
            WHERE id = $3
          `, [scan.scan_count || 1, scan.scanned_at, scan.ticket_id]);
        }

        results.push({
          ticket_id: scan.ticket_id,
          status: 'SUCCESS',
          message: 'Scan reconciled'
        });

      } catch (error: any) {
        logger.error('Error reconciling scan:', error);
        results.push({
          ticket_id: scan.ticket_id,
          status: 'ERROR',
          message: error.message
        });
      }
    }

    await client.query('COMMIT');
    client.release();

    return res.json({
      success: true,
      reconciled: results.filter(r => r.status === 'SUCCESS').length,
      failed: results.filter(r => r.status !== 'SUCCESS').length,
      results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    logger.error('Reconciliation error:', error);
    return res.status(500).json({
      success: false,
      error: 'RECONCILIATION_ERROR'
    });
  }
});

export default router;
```

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';

const router = Router();

// Basic health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'scanning-service' });
});

// Database health check
router.get('/health/db', async (req, res) => {
  try {
    // Import the appropriate database connection for this service
    const { pool } = require('../config/database');
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'scanning-service' 
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: (error as any).message,
      service: 'scanning-service'
    });
  }
});

export default router;
```

### FILE: src/config/database.ts
```typescript
import { Pool, PoolClient } from 'pg';
import logger from '../utils/logger';

let pool: Pool | undefined;

export async function initializeDatabase(): Promise<Pool> {
  pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  try {
    const client: PoolClient = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connected:', result.rows[0].now);
    return pool;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}
```

### FILE: src/services/QRGenerator.ts
```typescript
import crypto from 'crypto';
import QRCode from 'qrcode';
import { getPool } from '../config/database';
import logger from '../utils/logger';

interface Ticket {
  id: string;
  ticket_number: string;
  event_id: string;
  status: string;
  access_level: string;
  event_name: string;
  event_date: Date;
  scan_count?: number;
  last_scanned_at?: Date;
}

interface QRResult {
  success: boolean;
  qr_data: string;
  qr_image: string;
  expires_at: Date;
  ticket: {
    id: string;
    ticket_number: string;
    event_name: string;
    event_date: Date;
    access_level: string;
  };
}

interface OfflineManifest {
  event_id: string;
  device_id: string;
  generated_at: Date;
  expires_at: Date;
  tickets: Record<string, {
    ticket_number: string;
    access_level: string;
    scan_count: number;
    last_scanned_at: Date | null;
    offline_token: string;
  }>;
}

class QRGenerator {
  private hmacSecret: string;
  private rotationSeconds: number;

  constructor() {
    this.hmacSecret = process.env.HMAC_SECRET || 'default-secret-change-in-production';
    this.rotationSeconds = parseInt(process.env.QR_ROTATION_SECONDS || '30');
  }

  async generateRotatingQR(ticketId: string): Promise<QRResult> {
    const pool = getPool();

    try {
      // DEBUG: Log the ticket ID we're looking for
      logger.info(`Looking for ticket: ${ticketId}`);

      // DEBUG: Test basic connection
      const testResult = await pool.query('SELECT COUNT(*) as count FROM tickets');
      logger.info(`Total tickets in database: ${testResult.rows[0].count}`);

      // DEBUG: Check if ticket exists at all
      const existsResult = await pool.query(
        'SELECT id, status, event_id FROM tickets WHERE id = $1',
        [ticketId]
      );
      logger.info(`Ticket exists check: ${JSON.stringify(existsResult.rows)}`);

      // Now do the actual query
      const ticketResult = await pool.query(`
        SELECT
          t.id,
          t.ticket_number,
          t.event_id,
          t.status,
          t.access_level,
          COALESCE(e.name, e.title) as event_name,
          COALESCE(e.starts_at, e.start_date) as event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = $1
      `, [ticketId]);

      logger.info(`Query result rows: ${ticketResult.rows.length}`);

      if (ticketResult.rows.length === 0) {
        throw new Error('Ticket not found');
      }

      const ticket = ticketResult.rows[0];

      // Generate time-based QR data
      const timestamp = Date.now();
      const data = `${ticketId}:${timestamp}`;
      const hmac = crypto
        .createHmac('sha256', this.hmacSecret)
        .update(data)
        .digest('hex');

      const qrData = `${ticketId}:${timestamp}:${hmac}`;

      const qrOptions = {
        errorCorrectionLevel: 'M' as const,
        type: 'image/png' as const,
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 300
      };

      const qrImage = await QRCode.toDataURL(qrData, qrOptions);

      return {
        success: true,
        qr_data: qrData,
        qr_image: qrImage,
        expires_at: new Date(timestamp + (this.rotationSeconds * 1000)),
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          event_name: ticket.event_name,
          event_date: ticket.event_date,
          access_level: ticket.access_level || 'GA'
        }
      };

    } catch (error) {
      logger.error('QR generation error:', error);
      throw error;
    }
  }

  async generateOfflineManifest(eventId: string, deviceId: string): Promise<OfflineManifest> {
    const pool = getPool();

    try {
      const ticketsResult = await pool.query(`
        SELECT
          t.id,
          t.ticket_number,
          t.status,
          t.access_level,
          t.scan_count,
          t.last_scanned_at
        FROM tickets t
        WHERE t.event_id = $1
          AND t.status IN ('SOLD', 'MINTED')
      `, [eventId]);

      const manifest: OfflineManifest = {
        event_id: eventId,
        device_id: deviceId,
        generated_at: new Date(),
        expires_at: new Date(Date.now() + (4 * 60 * 60 * 1000)),
        tickets: {}
      };

      for (const ticket of ticketsResult.rows) {
        const offlineToken = crypto
          .createHmac('sha256', this.hmacSecret)
          .update(`${ticket.id}:${eventId}:offline`)
          .digest('hex');

        manifest.tickets[ticket.id] = {
          ticket_number: ticket.ticket_number,
          access_level: ticket.access_level,
          scan_count: ticket.scan_count,
          last_scanned_at: ticket.last_scanned_at,
          offline_token: offlineToken
        };
      }

      return manifest;

    } catch (error) {
      logger.error('Offline manifest generation error:', error);
      throw error;
    }
  }

  validateOfflineScan(ticketId: string, offlineToken: string, eventId: string): boolean {
    const expectedToken = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`${ticketId}:${eventId}:offline`)
      .digest('hex');

    return offlineToken === expectedToken;
  }
}

export default QRGenerator;
```

### FILE: src/services/OfflineCache.js
```typescript
const { getPool } = require('../config/database');
const crypto = require('crypto');
const logger = require('../utils/logger');

class OfflineCache {
  constructor() {
    this.cacheWindowMinutes = parseInt(process.env.OFFLINE_CACHE_DURATION_MINUTES) || 30;
  }

  /**
   * Generate offline validation cache for an event
   */
  async generateEventCache(eventId) {
    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get all valid tickets for the event - using CORRECT column names
      const ticketsResult = await client.query(`
        SELECT 
          t.id,
          t.ticket_number,
          t.status,
          t.qr_hmac_secret,
          t.section,
          t.row_number,
          t.seat_number,
          e.name as event_name,
          e.starts_at as event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.event_id = $1
        AND t.status IN ('SOLD', 'TRANSFERRED')
      `, [eventId]);

      const tickets = ticketsResult.rows;
      const cacheEntries = [];
      const validFrom = new Date();
      const validUntil = new Date(validFrom.getTime() + (this.cacheWindowMinutes * 60 * 1000));

      // Generate validation hashes for each ticket
      for (const ticket of tickets) {
        if (!ticket.qr_hmac_secret) {
          // Generate HMAC secret if missing
          const hmacSecret = crypto.randomBytes(32).toString('hex');
          await client.query(
            'UPDATE tickets SET qr_hmac_secret = $1 WHERE id = $2',
            [hmacSecret, ticket.id]
          );
          ticket.qr_hmac_secret = hmacSecret;
        }

        // Generate validation hash for offline verification
        const validationData = `${ticket.id}:${ticket.ticket_number}:${validFrom.getTime()}`;
        const validationHash = crypto
          .createHmac('sha256', ticket.qr_hmac_secret)
          .update(validationData)
          .digest('hex');

        // Prepare cache entry
        cacheEntries.push({
          ticketId: ticket.id,
          eventId: eventId,
          validationHash: validationHash,
          validFrom: validFrom,
          validUntil: validUntil,
          ticketData: {
            ticketNumber: ticket.ticket_number,
            status: ticket.status,
            section: ticket.section,
            row: ticket.row_number,
            seat: ticket.seat_number,
            eventName: ticket.event_name
          }
        });
      }

      // Clear old cache entries for this event
      await client.query(
        'DELETE FROM offline_validation_cache WHERE event_id = $1 AND valid_until < NOW()',
        [eventId]
      );

      // Insert new cache entries
      for (const entry of cacheEntries) {
        await client.query(`
          INSERT INTO offline_validation_cache (
            ticket_id, event_id, validation_hash,
            valid_from, valid_until, ticket_data
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (ticket_id, valid_from) DO UPDATE
          SET validation_hash = EXCLUDED.validation_hash,
              valid_until = EXCLUDED.valid_until,
              ticket_data = EXCLUDED.ticket_data
        `, [
          entry.ticketId,
          entry.eventId,
          entry.validationHash,
          entry.validFrom,
          entry.validUntil,
          JSON.stringify(entry.ticketData)
        ]);
      }

      await client.query('COMMIT');

      logger.info(`Generated offline cache for event ${eventId}: ${cacheEntries.length} tickets`);

      return {
        success: true,
        eventId: eventId,
        ticketCount: cacheEntries.length,
        validFrom: validFrom,
        validUntil: validUntil,
        cacheSize: JSON.stringify(cacheEntries).length
      };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error generating offline cache:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get offline cache for a device
   */
  async getDeviceCache(deviceId, eventId) {
    const pool = getPool();

    try {
      // Verify device can scan offline
      const deviceResult = await pool.query(
        'SELECT * FROM scanner_devices WHERE device_id = $1 AND is_active = true AND can_scan_offline = true',
        [deviceId]
      );

      if (deviceResult.rows.length === 0) {
        throw new Error('Device not authorized for offline scanning');
      }

      // Get current valid cache entries
      const cacheResult = await pool.query(`
        SELECT 
          ticket_id,
          validation_hash,
          ticket_data,
          valid_until
        FROM offline_validation_cache
        WHERE event_id = $1
        AND valid_from <= NOW()
        AND valid_until > NOW()
      `, [eventId]);

      // Update device sync time
      await pool.query(
        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
        [deviceId]
      );

      logger.info(`Retrieved offline cache for device ${deviceId}: ${cacheResult.rows.length} entries`);

      return {
        success: true,
        deviceId: deviceId,
        eventId: eventId,
        entries: cacheResult.rows,
        syncedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error getting device cache:', error);
      throw error;
    }
  }

  /**
   * Validate offline scan
   */
  async validateOfflineScan(ticketId, validationHash, eventId) {
    const pool = getPool();

    try {
      const result = await pool.query(`
        SELECT * FROM offline_validation_cache
        WHERE ticket_id = $1
        AND event_id = $2
        AND validation_hash = $3
        AND valid_from <= NOW()
        AND valid_until > NOW()
      `, [ticketId, eventId, validationHash]);

      if (result.rows.length > 0) {
        const cache = result.rows[0];
        return {
          valid: true,
          ticketData: cache.ticket_data,
          validUntil: cache.valid_until
        };
      }

      return {
        valid: false,
        error: 'INVALID_OFFLINE_HASH',
        message: 'Offline validation failed'
      };

    } catch (error) {
      logger.error('Error validating offline scan:', error);
      return {
        valid: false,
        error: 'VALIDATION_ERROR',
        message: 'Failed to validate offline scan'
      };
    }
  }
}

module.exports = OfflineCache;
```

### FILE: src/services/QRValidator.ts
```typescript
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
```

### FILE: src/services/DeviceManager.js
```typescript
const { getPool } = require('../config/database');
const crypto = require('crypto');
const logger = require('../utils/logger');

class DeviceManager {
  /**
   * Register a new scanner device
   */
  async registerDevice(deviceData) {
    const pool = getPool();
    
    try {
      // Generate unique device ID if not provided
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

    } catch (error) {
      if (error.code === '23505') { // Unique violation
        throw new Error('Device ID already exists');
      }
      logger.error('Error registering device:', error);
      throw error;
    }
  }

  /**
   * Revoke a device's access
   */
  async revokeDevice(deviceId, revokedBy, reason) {
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
  async getDevice(deviceId) {
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
  async listVenueDevices(venueId, activeOnly = true) {
    const pool = getPool();
    
    try {
      let query = 'SELECT * FROM scanner_devices WHERE venue_id = $1';
      const params = [venueId];

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
  async updateDeviceSync(deviceId) {
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

module.exports = DeviceManager;
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/services/QRGenerator.ts
```typescript
import crypto from 'crypto';
import QRCode from 'qrcode';
import { getPool } from '../config/database';
import logger from '../utils/logger';

interface Ticket {
  id: string;
  ticket_number: string;
  event_id: string;
  status: string;
  access_level: string;
  event_name: string;
  event_date: Date;
  scan_count?: number;
  last_scanned_at?: Date;
}

interface QRResult {
  success: boolean;
  qr_data: string;
  qr_image: string;
  expires_at: Date;
  ticket: {
    id: string;
    ticket_number: string;
    event_name: string;
    event_date: Date;
    access_level: string;
  };
}

interface OfflineManifest {
  event_id: string;
  device_id: string;
  generated_at: Date;
  expires_at: Date;
  tickets: Record<string, {
    ticket_number: string;
    access_level: string;
    scan_count: number;
    last_scanned_at: Date | null;
    offline_token: string;
  }>;
}

class QRGenerator {
  private hmacSecret: string;
  private rotationSeconds: number;

  constructor() {
    this.hmacSecret = process.env.HMAC_SECRET || 'default-secret-change-in-production';
    this.rotationSeconds = parseInt(process.env.QR_ROTATION_SECONDS || '30');
  }

  async generateRotatingQR(ticketId: string): Promise<QRResult> {
    const pool = getPool();

    try {
      // DEBUG: Log the ticket ID we're looking for
      logger.info(`Looking for ticket: ${ticketId}`);

      // DEBUG: Test basic connection
      const testResult = await pool.query('SELECT COUNT(*) as count FROM tickets');
      logger.info(`Total tickets in database: ${testResult.rows[0].count}`);

      // DEBUG: Check if ticket exists at all
      const existsResult = await pool.query(
        'SELECT id, status, event_id FROM tickets WHERE id = $1',
        [ticketId]
      );
      logger.info(`Ticket exists check: ${JSON.stringify(existsResult.rows)}`);

      // Now do the actual query
      const ticketResult = await pool.query(`
        SELECT
          t.id,
          t.ticket_number,
          t.event_id,
          t.status,
          t.access_level,
          COALESCE(e.name, e.title) as event_name,
          COALESCE(e.starts_at, e.start_date) as event_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = $1
      `, [ticketId]);

      logger.info(`Query result rows: ${ticketResult.rows.length}`);

      if (ticketResult.rows.length === 0) {
        throw new Error('Ticket not found');
      }

      const ticket = ticketResult.rows[0];

      // Generate time-based QR data
      const timestamp = Date.now();
      const data = `${ticketId}:${timestamp}`;
      const hmac = crypto
        .createHmac('sha256', this.hmacSecret)
        .update(data)
        .digest('hex');

      const qrData = `${ticketId}:${timestamp}:${hmac}`;

      const qrOptions = {
        errorCorrectionLevel: 'M' as const,
        type: 'image/png' as const,
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 300
      };

      const qrImage = await QRCode.toDataURL(qrData, qrOptions);

      return {
        success: true,
        qr_data: qrData,
        qr_image: qrImage,
        expires_at: new Date(timestamp + (this.rotationSeconds * 1000)),
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          event_name: ticket.event_name,
          event_date: ticket.event_date,
          access_level: ticket.access_level || 'GA'
        }
      };

    } catch (error) {
      logger.error('QR generation error:', error);
      throw error;
    }
  }

  async generateOfflineManifest(eventId: string, deviceId: string): Promise<OfflineManifest> {
    const pool = getPool();

    try {
      const ticketsResult = await pool.query(`
        SELECT
          t.id,
          t.ticket_number,
          t.status,
          t.access_level,
          t.scan_count,
          t.last_scanned_at
        FROM tickets t
        WHERE t.event_id = $1
          AND t.status IN ('SOLD', 'MINTED')
      `, [eventId]);

      const manifest: OfflineManifest = {
        event_id: eventId,
        device_id: deviceId,
        generated_at: new Date(),
        expires_at: new Date(Date.now() + (4 * 60 * 60 * 1000)),
        tickets: {}
      };

      for (const ticket of ticketsResult.rows) {
        const offlineToken = crypto
          .createHmac('sha256', this.hmacSecret)
          .update(`${ticket.id}:${eventId}:offline`)
          .digest('hex');

        manifest.tickets[ticket.id] = {
          ticket_number: ticket.ticket_number,
          access_level: ticket.access_level,
          scan_count: ticket.scan_count,
          last_scanned_at: ticket.last_scanned_at,
          offline_token: offlineToken
        };
      }

      return manifest;

    } catch (error) {
      logger.error('Offline manifest generation error:', error);
      throw error;
    }
  }

  validateOfflineScan(ticketId: string, offlineToken: string, eventId: string): boolean {
    const expectedToken = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(`${ticketId}:${eventId}:offline`)
      .digest('hex');

    return offlineToken === expectedToken;
  }
}

export default QRGenerator;
```

### FILE: src/services/QRValidator.ts
```typescript
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
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/scanning-service//src/routes/policies.ts:13:      SELECT id, name, description, policy_set, is_default
backend/services/scanning-service//src/routes/policies.ts:39:      SELECT
backend/services/scanning-service//src/routes/policies.ts:78:    await pool.query('SELECT apply_scan_policy_template($1, $2)', [eventId, template_id]);
backend/services/scanning-service//src/routes/policies.ts:80:    // Fetch the updated policies
backend/services/scanning-service//src/routes/policies.ts:82:      SELECT * FROM scan_policies
backend/services/scanning-service//src/routes/policies.ts:122:      'SELECT venue_id FROM events WHERE id = $1',
backend/services/scanning-service//src/routes/policies.ts:138:    // Update or insert duplicate window policy
backend/services/scanning-service//src/routes/policies.ts:141:        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
backend/services/scanning-service//src/routes/policies.ts:144:        DO UPDATE SET config = $3, updated_at = NOW()
backend/services/scanning-service//src/routes/policies.ts:148:    // Update or insert re-entry policy
backend/services/scanning-service//src/routes/policies.ts:157:        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
backend/services/scanning-service//src/routes/policies.ts:160:        DO UPDATE SET config = $3, updated_at = NOW()
backend/services/scanning-service//src/routes/policies.ts:164:    // Update or insert zone enforcement policy
backend/services/scanning-service//src/routes/policies.ts:172:        INSERT INTO scan_policies (event_id, venue_id, policy_type, config, name)
backend/services/scanning-service//src/routes/policies.ts:175:        DO UPDATE SET config = $3, updated_at = NOW()
backend/services/scanning-service//src/routes/policies.ts:182:    // Fetch updated policies
backend/services/scanning-service//src/routes/policies.ts:184:      SELECT * FROM scan_policies
backend/services/scanning-service//src/routes/policies.ts:201:      error: 'UPDATE_ERROR',
backend/services/scanning-service//src/routes/devices.ts:13:      'SELECT * FROM devices WHERE is_active = true ORDER BY name'
backend/services/scanning-service//src/routes/devices.ts:44:      INSERT INTO devices (device_id, name, zone, is_active)
backend/services/scanning-service//src/routes/devices.ts:46:      ON CONFLICT (device_id) DO UPDATE
backend/services/scanning-service//src/routes/devices.ts:47:      SET name = EXCLUDED.name, zone = EXCLUDED.zone, updated_at = NOW()
backend/services/scanning-service//src/routes/offline.ts:62:          SELECT id FROM scans
backend/services/scanning-service//src/routes/offline.ts:79:          'SELECT id FROM devices WHERE device_id = $1',
backend/services/scanning-service//src/routes/offline.ts:94:          INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
backend/services/scanning-service//src/routes/offline.ts:104:        // Update ticket if it was allowed
backend/services/scanning-service//src/routes/offline.ts:107:            UPDATE tickets
backend/services/scanning-service//src/routes/health.routes.ts:15:    await pool.query('SELECT 1');
backend/services/scanning-service//src/config/database.ts:21:    const result = await client.query('SELECT NOW()');
backend/services/scanning-service//src/services/QRGenerator.ts:63:      const testResult = await pool.query('SELECT COUNT(*) as count FROM tickets');
backend/services/scanning-service//src/services/QRGenerator.ts:68:        'SELECT id, status, event_id FROM tickets WHERE id = $1',
backend/services/scanning-service//src/services/QRGenerator.ts:75:        SELECT
backend/services/scanning-service//src/services/QRGenerator.ts:101:        .update(data)
backend/services/scanning-service//src/services/QRGenerator.ts:145:        SELECT
backend/services/scanning-service//src/services/QRGenerator.ts:168:          .update(`${ticket.id}:${eventId}:offline`)
backend/services/scanning-service//src/services/QRGenerator.ts:191:      .update(`${ticketId}:${eventId}:offline`)
backend/services/scanning-service//src/services/OfflineCache.js:22:        SELECT 
backend/services/scanning-service//src/services/OfflineCache.js:49:            'UPDATE tickets SET qr_hmac_secret = $1 WHERE id = $2',
backend/services/scanning-service//src/services/OfflineCache.js:59:          .update(validationData)
backend/services/scanning-service//src/services/OfflineCache.js:82:        'DELETE FROM offline_validation_cache WHERE event_id = $1 AND valid_until < NOW()',
backend/services/scanning-service//src/services/OfflineCache.js:89:          INSERT INTO offline_validation_cache (
backend/services/scanning-service//src/services/OfflineCache.js:93:          ON CONFLICT (ticket_id, valid_from) DO UPDATE
backend/services/scanning-service//src/services/OfflineCache.js:138:        'SELECT * FROM scanner_devices WHERE device_id = $1 AND is_active = true AND can_scan_offline = true',
backend/services/scanning-service//src/services/OfflineCache.js:148:        SELECT 
backend/services/scanning-service//src/services/OfflineCache.js:159:      // Update device sync time
backend/services/scanning-service//src/services/OfflineCache.js:161:        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
backend/services/scanning-service//src/services/OfflineCache.js:189:        SELECT * FROM offline_validation_cache
backend/services/scanning-service//src/services/QRValidator.ts:67:      .update(data)
backend/services/scanning-service//src/services/QRValidator.ts:99:      SELECT scanned_at
backend/services/scanning-service//src/services/QRValidator.ts:130:      SELECT config
backend/services/scanning-service//src/services/QRValidator.ts:244:        'SELECT * FROM devices WHERE device_id = $1 AND is_active = true',
backend/services/scanning-service//src/services/QRValidator.ts:262:        SELECT
backend/services/scanning-service//src/services/QRValidator.ts:315:        SELECT config
backend/services/scanning-service//src/services/QRValidator.ts:374:        UPDATE tickets
backend/services/scanning-service//src/services/QRValidator.ts:431:      INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
backend/services/scanning-service//src/services/QRValidator.ts:437:   * Emit scan event for real-time updates
backend/services/scanning-service//src/services/QRValidator.ts:474:      SELECT
backend/services/scanning-service//src/services/DeviceManager.js:17:        INSERT INTO scanner_devices (
backend/services/scanning-service//src/services/DeviceManager.js:60:        UPDATE scanner_devices
backend/services/scanning-service//src/services/DeviceManager.js:65:            updated_at = NOW()
backend/services/scanning-service//src/services/DeviceManager.js:95:        'SELECT * FROM scanner_devices WHERE device_id = $1',
backend/services/scanning-service//src/services/DeviceManager.js:118:      let query = 'SELECT * FROM scanner_devices WHERE venue_id = $1';
backend/services/scanning-service//src/services/DeviceManager.js:138:   * Update device sync status
backend/services/scanning-service//src/services/DeviceManager.js:140:  async updateDeviceSync(deviceId) {
backend/services/scanning-service//src/services/DeviceManager.js:145:        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',

### All JOIN operations:
backend/services/scanning-service//src/routes/policies.ts:44:      JOIN events e ON sp.event_id = e.id
backend/services/scanning-service//src/routes/policies.ts:45:      LEFT JOIN venues v ON sp.venue_id = v.id
backend/services/scanning-service//src/utils/logger.ts:20:      filename: path.join(__dirname, '../../', process.env.LOG_FILE || 'scanning-service.log'),
backend/services/scanning-service//src/services/QRGenerator.ts:84:        JOIN events e ON t.event_id = e.id
backend/services/scanning-service//src/services/OfflineCache.js:33:        JOIN events e ON t.event_id = e.id
backend/services/scanning-service//src/services/QRValidator.ts:267:        JOIN events e ON t.event_id = e.id
backend/services/scanning-service//src/services/QRValidator.ts:482:      JOIN tickets t ON s.ticket_id = t.id

### All WHERE clauses:
backend/services/scanning-service//src/routes/policies.ts:46:      WHERE sp.event_id = $1
backend/services/scanning-service//src/routes/policies.ts:83:      WHERE event_id = $1
backend/services/scanning-service//src/routes/policies.ts:122:      'SELECT venue_id FROM events WHERE id = $1',
backend/services/scanning-service//src/routes/policies.ts:185:      WHERE event_id = $1
backend/services/scanning-service//src/routes/devices.ts:13:      'SELECT * FROM devices WHERE is_active = true ORDER BY name'
backend/services/scanning-service//src/routes/offline.ts:63:          WHERE ticket_id = $1
backend/services/scanning-service//src/routes/offline.ts:79:          'SELECT id FROM devices WHERE device_id = $1',
backend/services/scanning-service//src/routes/offline.ts:112:            WHERE id = $3
backend/services/scanning-service//src/services/QRGenerator.ts:68:        'SELECT id, status, event_id FROM tickets WHERE id = $1',
backend/services/scanning-service//src/services/QRGenerator.ts:85:        WHERE t.id = $1
backend/services/scanning-service//src/services/QRGenerator.ts:153:        WHERE t.event_id = $1
backend/services/scanning-service//src/services/OfflineCache.js:34:        WHERE t.event_id = $1
backend/services/scanning-service//src/services/OfflineCache.js:49:            'UPDATE tickets SET qr_hmac_secret = $1 WHERE id = $2',
backend/services/scanning-service//src/services/OfflineCache.js:82:        'DELETE FROM offline_validation_cache WHERE event_id = $1 AND valid_until < NOW()',
backend/services/scanning-service//src/services/OfflineCache.js:138:        'SELECT * FROM scanner_devices WHERE device_id = $1 AND is_active = true AND can_scan_offline = true',
backend/services/scanning-service//src/services/OfflineCache.js:154:        WHERE event_id = $1
backend/services/scanning-service//src/services/OfflineCache.js:161:        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',
backend/services/scanning-service//src/services/OfflineCache.js:190:        WHERE ticket_id = $1
backend/services/scanning-service//src/services/QRValidator.ts:101:      WHERE ticket_id = $1
backend/services/scanning-service//src/services/QRValidator.ts:132:      WHERE event_id = $1
backend/services/scanning-service//src/services/QRValidator.ts:244:        'SELECT * FROM devices WHERE device_id = $1 AND is_active = true',
backend/services/scanning-service//src/services/QRValidator.ts:268:        WHERE t.id = $1
backend/services/scanning-service//src/services/QRValidator.ts:317:        WHERE event_id = $1
backend/services/scanning-service//src/services/QRValidator.ts:379:        WHERE id = $1
backend/services/scanning-service//src/services/QRValidator.ts:475:        COUNT(*) FILTER (WHERE result = 'ALLOW') as allowed,
backend/services/scanning-service//src/services/QRValidator.ts:476:        COUNT(*) FILTER (WHERE result = 'DENY') as denied,
backend/services/scanning-service//src/services/QRValidator.ts:477:        COUNT(*) FILTER (WHERE reason = 'DUPLICATE') as duplicates,
backend/services/scanning-service//src/services/QRValidator.ts:478:        COUNT(*) FILTER (WHERE reason = 'WRONG_ZONE') as wrong_zone,
backend/services/scanning-service//src/services/QRValidator.ts:479:        COUNT(*) FILTER (WHERE reason = 'REENTRY_DENIED') as reentry_denied,
backend/services/scanning-service//src/services/QRValidator.ts:483:      WHERE t.event_id = $1
backend/services/scanning-service//src/services/DeviceManager.js:66:        WHERE device_id = $1
backend/services/scanning-service//src/services/DeviceManager.js:95:        'SELECT * FROM scanner_devices WHERE device_id = $1',
backend/services/scanning-service//src/services/DeviceManager.js:118:      let query = 'SELECT * FROM scanner_devices WHERE venue_id = $1';
backend/services/scanning-service//src/services/DeviceManager.js:145:        'UPDATE scanner_devices SET last_sync_at = NOW() WHERE device_id = $1',

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### database.ts
```typescript
import { Pool, PoolClient } from 'pg';
import logger from '../utils/logger';

let pool: Pool | undefined;

export async function initializeDatabase(): Promise<Pool> {
  pool = new Pool({
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test connection
  try {
    const client: PoolClient = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('✅ Database connected:', result.rows[0].now);
    return pool;
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}
```
### .env.example
```
# Service Configuration
NODE_ENV=development
PORT=3000
SERVICE_NAME=service-name

# Database
DATABASE_URL=postgresql://tickettoken:CHANGE_ME@localhost:5432/tickettoken_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tickettoken_db
DB_USER=tickettoken
DB_PASSWORD=CHANGE_ME

# Redis
REDIS_URL=redis://:CHANGE_ME@localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME

# RabbitMQ
RABBITMQ_URL=amqp://tickettoken:CHANGE_ME@localhost:5672

# JWT
JWT_SECRET=CHANGE_ME

# Monitoring
PROMETHEUS_PORT=9090
METRICS_ENABLED=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

