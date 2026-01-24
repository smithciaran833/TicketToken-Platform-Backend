import QRCode from 'qrcode';
import crypto from 'crypto';
import { RedisService } from './redisService';
import { DatabaseService } from './databaseService';
import { config } from '../config';
import { QRValidation, TicketStatus } from '../types';
import { ValidationError, NotFoundError } from '../utils/errors';
import { logger } from '../utils/logger';

export class QRService {
  private log = logger.child({ component: 'QRService' });
  private encryptionKey = Buffer.from(config.qr.encryptionKey, 'utf-8');

  async generateRotatingQR(ticketId: string): Promise<{ qrCode: string; qrImage: string }> {
    const ticket = await this.getTicketData(ticketId);

    // Create time-based QR data
    const timestamp = Math.floor(Date.now() / config.qr.rotationInterval);
    const qrData = {
      ticketId,
      eventId: ticket.event_id,
      timestamp,
      nonce: crypto.randomBytes(8).toString('hex')
    };

    // Encrypt QR data
    const encrypted = this.encrypt(JSON.stringify(qrData));
    const qrString = `TKT:${encrypted}`;

    // Generate QR image
    const qrImage = await QRCode.toDataURL(qrString, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Store validation data in Redis (optional - fail gracefully)
    try {
      const validationKey = `qr:${ticketId}:${timestamp}`;
      await RedisService.set(
        validationKey,
        JSON.stringify({
          ticketId,
          eventId: ticket.event_id,
          validUntil: new Date((timestamp + 1) * config.qr.rotationInterval)
        }),
        config.qr.rotationInterval * 2
      );
    } catch (error) {
      this.log.warn('Redis storage failed for QR validation data, QR will still work', { ticketId });
    }

    return { qrCode: qrString, qrImage };
  }

  async validateQR(qrCode: string, validationData: {
    eventId: string;
    entrance?: string;
    deviceId?: string;
    validatorId?: string;
  }): Promise<QRValidation> {
    try {
      // Extract and decrypt QR data
      if (!qrCode.startsWith('TKT:')) {
        throw new ValidationError('Invalid QR format');
      }

      const encrypted = qrCode.substring(4);
      const decrypted = this.decrypt(encrypted);
      const qrData = JSON.parse(decrypted);

      // Validate timestamp
      const currentTimestamp = Math.floor(Date.now() / config.qr.rotationInterval);
      const timeDiff = currentTimestamp - qrData.timestamp;

      if (timeDiff < 0 || timeDiff > 2) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: 'QR code expired'
        };
      }

      // Validate event match
      if (qrData.eventId !== validationData.eventId) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: 'Wrong event'
        };
      }

      // Check if ticket already used
      const ticket = await this.getTicketData(qrData.ticketId);

      if (ticket.status === TicketStatus.USED) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          validatedAt: ticket.validated_at,
          reason: 'Ticket already used'
        };
      }

      if (ticket.status !== TicketStatus.SOLD) {
        return {
          ticketId: qrData.ticketId,
          eventId: qrData.eventId,
          isValid: false,
          reason: `Invalid ticket status: ${ticket.status}`
        };
      }

      // Mark ticket as used
      await DatabaseService.transaction(async (client) => {
        // Lock ticket for update
        const lockQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
        const lockResult = await client.query(lockQuery, [qrData.ticketId]);

        if (lockResult.rows[0].status === TicketStatus.USED) {
          throw new ValidationError('Ticket was just used');
        }

        // Update ticket status
        const updateQuery = `
          UPDATE tickets
          SET status = $1, validated_at = $2, validator_id = $3, entrance = $4
          WHERE id = $5
        `;

        await client.query(updateQuery, [
          TicketStatus.USED,
          new Date(),
          validationData.validatorId || null,
          validationData.entrance || null,
          qrData.ticketId
        ]);

        // Log validation
        const logQuery = `
          INSERT INTO ticket_validations
          (ticket_id, event_id, validated_at, validator_id, entrance, device_id)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await client.query(logQuery, [
          qrData.ticketId,
          qrData.eventId,
          new Date(),
          validationData.validatorId || null,
          validationData.entrance || null,
          validationData.deviceId || null
        ]);
      });

      // Clear ticket cache - fail gracefully if Redis is down
      try {
        await RedisService.del(`ticket:${qrData.ticketId}`);
      } catch (error) {
        this.log.warn('Redis delete failed after validation', { ticketId: qrData.ticketId });
      }

      return {
        ticketId: qrData.ticketId,
        eventId: qrData.eventId,
        isValid: true,
        validatedAt: new Date()
      };

    } catch (error) {
      this.log.error('QR validation error:', error);

      if (error instanceof ValidationError) {
        return {
          ticketId: '',
          eventId: validationData.eventId,
          isValid: false,
          reason: 'Ticket was just validated'
        };
      }

      return {
        ticketId: '',
        eventId: validationData.eventId,
        isValid: false,
        reason: 'Invalid QR code'
      };
    }
  }

  private async getTicketData(ticketId: string): Promise<any> {
    // SECURITY: Select only fields needed for QR validation - no sensitive data
    const query = `
      SELECT id, event_id, status, validated_at
      FROM tickets
      WHERE id = $1
    `;
    const result = await DatabaseService.query(query, [ticketId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    return result.rows[0];
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey.slice(0, 32), iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export const qrService = new QRService();
