import { QueueService as queueService } from '../services/queueService';
import { QUEUES } from '@tickettoken/shared';
import { v4 as uuidv4 } from 'uuid';
import { withLock, LockKeys } from '@tickettoken/shared';
import { LockTimeoutError, LockContentionError, LockSystemError } from '@tickettoken/shared';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import {
  Ticket,
  TicketStatus,
  TicketType,
  PurchaseRequest,
  TicketReservation,
} from '../types';
import {
  NotFoundError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

export class TicketService {
  private log = logger.child({ component: 'TicketService' });

  async createTicketType(data: Partial<TicketType>): Promise<TicketType> {
    const id = uuidv4();
    const query = `
      INSERT INTO ticket_types (
        id, tenant_id, event_id, name, description, price,
        quantity, available_quantity, max_purchase,
        sale_start, sale_end, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    // Convert cents to dollars for DB (DB uses price as decimal)
    const priceValue = data.priceCents ? data.priceCents / 100 : 0;

    const values = [
      id,
      data.tenant_id,
      data.eventId,
      data.name,
      data.description || null,
      priceValue,
      data.quantity,
      data.quantity,
      data.maxPerPurchase,
      data.saleStartDate,
      data.saleEndDate,
      JSON.stringify(data.metadata || {})
    ];

    const result = await DatabaseService.query<TicketType>(query, values);
    return result.rows[0];
  }

  async getTicketTypes(eventId: string, tenantId: string): Promise<TicketType[]> {
    const query = `
      SELECT * FROM ticket_types
      WHERE event_id = $1 AND tenant_id = $2
      ORDER BY price ASC
    `;

    const result = await DatabaseService.query<TicketType>(query, [eventId, tenantId]);
    return result.rows;
  }

  async checkAvailability(eventId: string, ticketTypeId: string, quantity: number): Promise<boolean> {
    const query = `
      SELECT available_quantity
      FROM ticket_types
      WHERE id = $1 AND event_id = $2
    `;

    const result = await DatabaseService.query<{ available_quantity: number }>(
      query,
      [ticketTypeId, eventId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket type');
    }

    return result.rows[0].available_quantity >= quantity;
  }

  async createReservation(purchaseRequest: PurchaseRequest): Promise<TicketReservation> {
    const firstTicketType = purchaseRequest.tickets[0];
    const lockKey = LockKeys.inventory(purchaseRequest.eventId, firstTicketType.ticketTypeId);

    try {
      return await withLock(
        lockKey,
        10000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            const reservationId = uuidv4();
            const expiresAt = new Date(Date.now() + config.limits.reservationTimeout * 1000);

            // Use tenant_id from request for security
            const tenantId = purchaseRequest.tenantId;

            for (const ticketRequest of purchaseRequest.tickets) {
              // SECURITY FIX: Include tenant_id in query to enforce tenant isolation
              const lockQuery = `
                SELECT * FROM ticket_types
                WHERE id = $1 AND event_id = $2 AND tenant_id = $3
                FOR UPDATE
              `;

              const result = await client.query(lockQuery, [
                ticketRequest.ticketTypeId,
                purchaseRequest.eventId,
                tenantId
              ]);

              if (result.rows.length === 0) {
                throw new NotFoundError('Ticket type');
              }

              const ticketType = result.rows[0];

              if (ticketType.available_quantity < ticketRequest.quantity) {
                throw new ConflictError(`Not enough tickets available for ${ticketType.name}`);
              }

              await client.query(
                'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
                [ticketRequest.quantity, ticketRequest.ticketTypeId]
              );
            }

            const totalQuantity = purchaseRequest.tickets.reduce((sum: number, t: any) => sum + t.quantity, 0);

            const reservationQuery = `
              INSERT INTO reservations (
                id, tenant_id, user_id, event_id, ticket_type_id, quantity, total_quantity, tickets, expires_at, status, type_name, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              RETURNING *
            `;

            const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
            const firstTypeResult = await client.query(firstTypeQuery, [firstTicketType.ticketTypeId]);
            const typeName = firstTypeResult.rows[0]?.name || 'General';

            const reservationResult = await client.query(reservationQuery, [
              reservationId,
              tenantId,
              purchaseRequest.userId,
              purchaseRequest.eventId,
              firstTicketType.ticketTypeId,
              firstTicketType.quantity,
              totalQuantity,
              JSON.stringify(purchaseRequest.tickets),
              expiresAt,
              'pending',
              typeName,
              new Date()
            ]);

            // Try to cache reservation, but don't fail if Redis is down
            try {
              await RedisService.set(
                `reservation:${reservationId}`,
                JSON.stringify(reservationResult.rows[0]),
                config.redis.ttl.reservation
              );
            } catch (error) {
              this.log.warn('Redis cache failed for reservation, continuing anyway', { reservationId });
            }

            return reservationResult.rows[0];
          });
        },
        { service: 'ticket-service', lockType: 'inventory' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - createReservation', {
          eventId: purchaseRequest.eventId,
          userId: purchaseRequest.userId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to reserve tickets due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - createReservation', {
          eventId: purchaseRequest.eventId,
          userId: purchaseRequest.userId
        });
        throw new ConflictError('These tickets are currently being reserved. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - createReservation', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async confirmPurchase(reservationId: string, paymentId: string): Promise<Ticket[]> {
    const lockKey = LockKeys.reservation(reservationId);

    try {
      return await withLock(
        lockKey,
        5000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
            const resResult = await client.query(resQuery, [reservationId]);

            if (resResult.rows.length === 0) {
              throw new NotFoundError('Reservation');
            }

            const reservation = resResult.rows[0];
            const eventId = reservation.event_id;
            const tenantId = reservation.tenant_id;

            if (reservation.status !== 'pending') {
              throw new ConflictError('Reservation is no longer active');
            }

            const tickets: Ticket[] = [];
            const ticketData = reservation.tickets || [{ ticketTypeId: reservation.ticket_type_id, quantity: reservation.total_quantity || 1 }];

            for (const ticketRequest of ticketData) {
              const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
              const typeResult = await client.query(typeQuery, [ticketRequest.ticketTypeId || reservation.ticket_type_id]);

              if (typeResult.rows.length === 0) {
                throw new NotFoundError('Ticket type not found');
              }

              const ticketType = typeResult.rows[0];
              const quantity = ticketRequest.quantity || 1;

              for (let i = 0; i < quantity; i++) {
                const ticketId = uuidv4();
                const ticketNumber = `TKT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

                const insertQuery = `
                  INSERT INTO tickets (
                    id, tenant_id, event_id, ticket_type_id, user_id, ticket_number, qr_code, status, price, price_cents,
                    is_transferable, transfer_count, payment_id, purchased_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, $12, NOW())
                  RETURNING *
                `;

                const ticketResult = await client.query(insertQuery, [
                  ticketId,
                  tenantId,
                  eventId,
                  ticketType.id,
                  reservation.user_id,
                  ticketNumber,
                  `QR-${ticketNumber}`,
                  'active',
                  ticketType.price,
                  ticketType.price ? Math.round(ticketType.price * 100) : null,
                  true,
                  paymentId
                ]);

                tickets.push(ticketResult.rows[0]);
              }

              await client.query(
                'UPDATE ticket_types SET sold_quantity = sold_quantity + $1, reserved_quantity = reserved_quantity - $1 WHERE id = $2',
                [quantity, ticketType.id]
              );
            }

            await client.query(
              `UPDATE reservations SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
              [reservationId]
            );

            // Queue NFT minting jobs
            for (const ticket of tickets) {
              try {
                await queueService.publish(QUEUES.TICKET_MINT, {
                  ticketId: ticket.id,
                  userId: reservation.user_id,
                  eventId: eventId
                });
              } catch (error) {
                this.log.warn('Failed to queue NFT mint job', { ticketId: ticket.id, error });
              }
            }

            // Try to clear Redis cache, but don't fail if Redis is down
            try {
              await RedisService.del(`reservation:${reservationId}`);
            } catch (error) {
              this.log.warn('Redis delete failed, continuing anyway', { reservationId });
            }

            return tickets;
          });
        },
        { service: 'ticket-service', lockType: 'reservation' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - confirmPurchase', {
          reservationId,
          paymentId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to confirm purchase due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - confirmPurchase', {
          reservationId,
          paymentId
        });
        throw new ConflictError('This reservation is currently being processed. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - confirmPurchase', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async getTicket(ticketId: string, tenantId?: string): Promise<any> {
    const cacheKey = `ticket:${ticketId}`;

    try {
      const cached = await RedisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      this.log.warn('Redis cache read failed, continuing with DB query', { ticketId });
    }

    let query = `
      SELECT t.*, tt.name as ticket_type_name, tt.description as ticket_type_description
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = $1
    `;

    const params: any[] = [ticketId];

    if (tenantId) {
      query += ' AND t.tenant_id = $2';
      params.push(tenantId);
    }

    const result = await DatabaseService.query(query, params);

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    const ticket = result.rows[0];

    try {
      await RedisService.set(
        `ticket:${ticketId}`,
        JSON.stringify(ticket),
        config.redis.ttl.cache
      );
    } catch (error) {
      this.log.warn('Redis cache write failed, returning ticket anyway', { ticketId });
    }

    return ticket;
  }

  async getUserTickets(userId: string, tenantId: string, eventId?: string): Promise<Ticket[]> {
    let query = `
      SELECT t.*, tt.name as ticket_type_name, e.name as event_name
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON t.event_id = e.id
      WHERE t.user_id = $1 AND t.tenant_id = $2
    `;

    const params: any[] = [userId, tenantId];

    if (eventId) {
      query += ' AND t.event_id = $3';
      params.push(eventId);
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await DatabaseService.query<Ticket>(query, params);
    return result.rows;
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
    await DatabaseService.query(query, [status, ticketId]);

    try {
      await RedisService.del(`ticket:${ticketId}`);
    } catch (error) {
      this.log.warn('Redis delete failed', { ticketId });
    }
  }

  async expireReservations(): Promise<void> {
    const result = await DatabaseService.query('SELECT release_expired_reservations() as count', []);

    if (!result.rows[0]?.count) {
      this.log.info('No expired reservations to release');
      return;
    }

    this.log.info(`Expired ${result.rowCount} reservations`);
  }

  async releaseReservation(reservationId: string, userId: string): Promise<any> {
    const lockKey = LockKeys.reservation(reservationId);

    try {
      return await withLock(
        lockKey,
        5000,
        async () => {
          return await DatabaseService.transaction(async (client) => {
            const resQuery = `
              SELECT * FROM reservations
              WHERE id = $1 AND user_id = $2 AND status = 'pending'
              FOR UPDATE
            `;
            const resResult = await client.query(resQuery, [reservationId, userId]);

            if (resResult.rows.length === 0) {
              throw new NotFoundError('Reservation not found or already processed');
            }

            const reservation = resResult.rows[0];

            await client.query(
              `UPDATE reservations SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
              [reservationId]
            );

            const tickets = reservation.tickets || [];
            for (const ticket of tickets) {
              await client.query(
                'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
                [ticket.quantity, ticket.ticketTypeId]
              );
            }

            // Try to clear Redis cache, but don't fail if Redis is down
            try {
              await RedisService.del(`reservation:${reservationId}`);
            } catch (error) {
              this.log.warn('Redis delete failed, continuing anyway', { reservationId });
            }

            return { success: true, reservation: reservation };
          });
        },
        { service: 'ticket-service', lockType: 'reservation' }
      );
    } catch (error: any) {
      if (error instanceof LockTimeoutError) {
        this.log.error('Lock timeout - releaseReservation', {
          reservationId,
          userId,
          timeoutMs: error.timeoutMs
        });
        throw new ConflictError('Unable to release reservation due to high demand. Please try again.');
      }
      if (error instanceof LockContentionError) {
        this.log.error('Lock contention - releaseReservation', {
          reservationId,
          userId
        });
        throw new ConflictError('This reservation is currently being processed. Please try again.');
      }
      if (error instanceof LockSystemError) {
        this.log.error('Lock system error - releaseReservation', {
          originalError: error.originalError?.message
        });
        throw new ConflictError('System temporarily unavailable. Please try again.');
      }
      throw error;
    }
  }

  async generateQR(ticketId: string): Promise<any> {
    const ticket = await this.getTicket(ticketId);

    const qrPayload = {
      ticketId: ticket.id,
      eventId: ticket.event_id,
      userId: ticket.user_id,
      timestamp: Date.now()
    };

    const encrypted = this.encryptData(JSON.stringify(qrPayload));
    const qrImage = await QRCode.toDataURL(encrypted);

    return {
      qrCode: encrypted,
      qrImage: qrImage,
      ticketId: ticketId
    };
  }

  async validateQR(qrData: string): Promise<any> {
    try {
      let payload;

      if (qrData.includes(':')) {
        const decrypted = this.decryptData(qrData);
        payload = JSON.parse(decrypted);
      } else {
        const decoded = Buffer.from(qrData, 'base64').toString('utf-8');
        const parsedData = JSON.parse(decoded);

        payload = {
          ticketId: parsedData.ticket_id,
          eventId: parsedData.event_id,
          userId: parsedData.user_id
        };
      }

      const ticket = await this.getTicket(payload.ticketId);

      const isValid = ticket.status === 'active' && !ticket.used_at && !ticket.validated_at;

      return {
        valid: isValid,
        data: {
          ticketId: payload.ticketId,
          eventId: payload.eventId,
          userId: payload.userId
        }
      };
    } catch (error) {
      this.log.warn('QR validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.name : typeof error,
        qrDataLength: qrData?.length || 0
      });

      return {
        valid: false,
        error: 'Invalid QR code'
      };
    }
  }

  async getTicketType(id: string, tenantId: string): Promise<TicketType | null> {
    const query = `
      SELECT * FROM ticket_types
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await DatabaseService.query<TicketType>(query, [id, tenantId]);
    return result.rows[0] || null;
  }

  async updateTicketType(id: string, data: Partial<TicketType>, tenantId: string): Promise<TicketType> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.priceCents !== undefined) {
      updates.push(`price = $${paramCount++}`);
      values.push(data.priceCents / 100);
    }
    if (data.quantity !== undefined) {
      updates.push(`quantity = $${paramCount++}`);
      values.push(data.quantity);
    }
    if (data.maxPerPurchase !== undefined) {
      updates.push(`max_purchase = $${paramCount++}`);
      values.push(data.maxPerPurchase);
    }
    if (data.saleStartDate !== undefined) {
      updates.push(`sale_start = $${paramCount++}`);
      values.push(data.saleStartDate);
    }
    if (data.saleEndDate !== undefined) {
      updates.push(`sale_end = $${paramCount++}`);
      values.push(data.saleEndDate);
    }

    updates.push(`updated_at = NOW()`);

    values.push(id);
    values.push(tenantId);

    const query = `
      UPDATE ticket_types
      SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await DatabaseService.query<TicketType>(query, values);

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket type');
    }

    return result.rows[0];
  }

  private encryptData(data: string): string {
    const algorithm = 'aes-256-cbc';

    if (!process.env.QR_ENCRYPTION_KEY) {
      throw new Error('QR_ENCRYPTION_KEY environment variable is required but not set');
    }

    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return iv.toString('base64') + ':' + encrypted;
  }

  private decryptData(data: string): string {
    const algorithm = 'aes-256-cbc';

    if (!process.env.QR_ENCRYPTION_KEY) {
      throw new Error('QR_ENCRYPTION_KEY environment variable is required but not set');
    }

    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY);

    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private generateQRCode(ticketId: string): string {
    return `TKT:${ticketId}:${Date.now()}`;
  }
}

export const ticketService = new TicketService();
