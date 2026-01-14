import crypto from 'crypto';
import QRCode from 'qrcode';
import { getPool } from '../config/database';
import logger from '../utils/logger';

/**
 * QR CODE GENERATOR SERVICE
 * 
 * Generates rotating QR codes for tickets and offline scanning manifests.
 * 
 * PHASE 5c BYPASS EXCEPTION:
 * This service reads from tickets/events tables. This is intentional because:
 * 
 * 1. QR generation is latency-critical (<100ms for smooth UX)
 * 2. The JOIN query retrieves ticket + event info in a single DB call
 * 3. Breaking into service calls would double/triple latency
 * 4. QR codes must be generated frequently (every 30s rotation)
 * 5. These are READ-ONLY operations - no ticket modifications
 * 
 * Future: Consider ticketServiceClient.getTicketForQR() that returns
 * all required fields optimized for QR generation.
 */

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

      // Phase 2.8: Generate time-based QR data with nonce for replay attack prevention
      const timestamp = Date.now();
      const nonce = crypto.randomBytes(8).toString('hex'); // 16-character nonce
      const data = `${ticketId}:${timestamp}:${nonce}`;
      const hmac = crypto
        .createHmac('sha256', this.hmacSecret)
        .update(data)
        .digest('hex');

      const qrData = `${ticketId}:${timestamp}:${nonce}:${hmac}`;

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
