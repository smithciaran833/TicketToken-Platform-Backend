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
