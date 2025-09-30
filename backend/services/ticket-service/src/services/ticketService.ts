import { QueueService as queueService } from '../services/queueService';
import { QUEUES } from "@tickettoken/shared/src/mq/queues";
import { v4 as uuidv4 } from 'uuid';
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
        id, event_id, name, description, price,
        quantity, available_quantity, max_per_purchase,
        sale_start_date, sale_end_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    const values = [
      id,
      data.eventId,
      data.name,
      data.description || null,
      data.price,
      data.quantity,
      data.quantity, // available_quantity starts as total quantity
      data.maxPerPurchase,
      data.saleStartDate,
      data.saleEndDate,
      JSON.stringify(data.metadata || {})
    ];

    const result = await DatabaseService.query<TicketType>(query, values);
    return result.rows[0];
  }

  async getTicketTypes(eventId: string): Promise<TicketType[]> {
    const query = `
      SELECT * FROM ticket_types
      WHERE event_id = $1
      ORDER BY price ASC
    `;

    const result = await DatabaseService.query<TicketType>(query, [eventId]);
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
    return await DatabaseService.transaction(async (client) => {
      const reservationId = uuidv4();
      const expiresAt = new Date(Date.now() + config.limits.reservationTimeout * 1000);

      // Check availability and lock ticket types
      for (const ticketRequest of purchaseRequest.tickets) {
        const lockQuery = `
          SELECT * FROM ticket_types
          WHERE id = $1 AND event_id = $2
          FOR UPDATE
        `;

        const result = await client.query(lockQuery, [
          ticketRequest.ticketTypeId,
          purchaseRequest.eventId
        ]);

        if (result.rows.length === 0) {
          throw new NotFoundError('Ticket type');
        }

        const ticketType = result.rows[0];
        if (ticketType.available_quantity < ticketRequest.quantity) {
          throw new ConflictError(`Not enough tickets available for ${ticketType.name}`);
        }

        // Update available quantity
        await client.query(
          'UPDATE ticket_types SET available_quantity = available_quantity - $1 WHERE id = $2',
          [ticketRequest.quantity, ticketRequest.ticketTypeId]
        );
      }

      // Create reservation
      const totalQuantity = purchaseRequest.tickets.reduce((sum: number, t: any) => sum + t.quantity, 0);
      const firstTicketType = purchaseRequest.tickets[0];

      const reservationQuery = `
        INSERT INTO reservations (
          id, user_id, event_id, ticket_type_id, quantity, tickets, expires_at, status, type_name, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;

      // Get the first ticket type name for the trigger
      const firstTypeQuery = 'SELECT name FROM ticket_types WHERE id = $1';
      const firstTypeResult = await client.query(firstTypeQuery, [firstTicketType.ticketTypeId]);
      const typeName = firstTypeResult.rows[0]?.name || 'General';

      const reservationResult = await client.query(reservationQuery, [
        reservationId,
        purchaseRequest.userId,
        purchaseRequest.eventId,
        firstTicketType.ticketTypeId,
        totalQuantity,
        JSON.stringify(purchaseRequest.tickets),
        expiresAt,
        'ACTIVE',
        typeName,
        new Date()
      ]);

      // Also insert into ticket_reservations for compatibility
      await client.query(
        `INSERT INTO ticket_reservations (id, ticket_type_id, user_id, expires_at, created_at, status, tickets)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          reservationId,
          firstTicketType.ticketTypeId,
          purchaseRequest.userId,
          expiresAt,
          new Date(),
          'ACTIVE',
          JSON.stringify(purchaseRequest.tickets)
        ]
      ).catch(() => {}); // Ignore if table doesn't exist

      // Store in Redis
      await RedisService.set(
        `reservation:${reservationId}`,
        JSON.stringify(reservationResult.rows[0]),
        config.redis.ttl.reservation
      );

      return reservationResult.rows[0];
    });
  }

  async confirmPurchase(reservationId: string, paymentId: string): Promise<Ticket[]> {
    return await DatabaseService.transaction(async (client) => {
      // Get reservation - check both tables for compatibility
      let reservation = null;
      let eventId = null;

      // First try ticket_reservations table
      const ticketResQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
      const ticketResResult = await client.query(ticketResQuery, [reservationId]);

      if (ticketResResult.rows.length > 0) {
        reservation = ticketResResult.rows[0];
        // ticket_reservations doesn't have event_id, so get it from ticket_types
        const ticketTypeQuery = 'SELECT event_id FROM ticket_types WHERE id = $1';
        const ticketTypeResult = await client.query(ticketTypeQuery, [reservation.ticket_type_id]);
        if (ticketTypeResult.rows.length > 0) {
          eventId = ticketTypeResult.rows[0].event_id;
        }
      } else {
        // Fall back to reservations table
        const resQuery = 'SELECT * FROM reservations WHERE id = $1 FOR UPDATE';
        const resResult = await client.query(resQuery, [reservationId]);
        if (resResult.rows.length > 0) {
          reservation = resResult.rows[0];
          eventId = reservation.event_id;  // reservations table has event_id
        }
      }

      if (!reservation) {
        throw new NotFoundError('Reservation');
      }

      if (reservation.status !== 'ACTIVE') {
        throw new ConflictError('Reservation is no longer active');
      }

      // Create tickets
      const tickets: Ticket[] = [];
      const ticketData = reservation.tickets || [{ ticketTypeId: reservation.ticket_type_id, quantity: reservation.quantity || 1 }];

      for (const ticketRequest of ticketData) {
        // Get ticket type info
        const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
        const typeResult = await client.query(typeQuery, [ticketRequest.ticketTypeId || reservation.ticket_type_id]);

        if (typeResult.rows.length === 0) {
          throw new NotFoundError('Ticket type not found');
        }

        const ticketType = typeResult.rows[0];
        
        // Use the event_id from ticket_type if we still don't have it
        if (!eventId) {
          eventId = ticketType.event_id;
        }

        // Create individual tickets
        const quantity = ticketRequest.quantity || 1;
        for (let i = 0; i < quantity; i++) {
          const ticketId = uuidv4();

          // Insert ticket with all required fields for triggers
          const ticketQuery = `
            INSERT INTO tickets (
              id,
              event_id,
              ticket_type_id,
              owner_id,
              owner_user_id,
              user_id,
              status,
              price,
              payment_id,
              purchased_at,
              metadata,
              total_paid,
              blockchain_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
          `;

          const values = [
            ticketId,                                           // $1 id
            eventId,                                           // $2 event_id - FIXED: now using the correct eventId
            ticketRequest.ticketTypeId || reservation.ticket_type_id, // $3 ticket_type_id
            reservation.user_id,                                // $4 owner_id
            reservation.user_id,                                // $5 owner_user_id
            reservation.user_id,                                // $6 user_id
            'SOLD',                                            // $7 status
            ticketType.price || 0,                            // $8 price
            paymentId || reservation.user_id,                  // $9 payment_id
            new Date(),                                        // $10 purchased_at
            JSON.stringify({                                   // $11 metadata
              ticketTypeName: ticketType.name,
              reservationId: reservationId,
              purchaseDate: new Date().toISOString()
            }),
            ticketType.price || 0,                            // $12 total_paid
            'pending'                                          // $13 blockchain_status
          ];

          try {
            const ticketResult = await client.query(ticketQuery, values);
            tickets.push(ticketResult.rows[0]);
          } catch (error: any) {
            this.log.error('Failed to create ticket:', error);
            throw new Error(`Failed to create ticket: ${error.message}`);
          }

          // Queue NFT minting
          try {
            await queueService.publish(config.rabbitmq.queues.nftMinting, {
              ticketId,
              userId: reservation.user_id,
              eventId: eventId,
              ticketType: ticketType.name,
              price: ticketType.price
            });
          } catch (error) {
            this.log.warn('Failed to queue NFT minting:', error);
            // Don't fail the transaction if queuing fails
          }
        }
      }

      // Update reservation status in both tables - FIXED: correct status values
      await client.query(
        'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
        ['expired', reservationId]  // ticket_reservations uses lowercase 'expired'
      ).catch(() => {}); // Ignore if not in this table

      await client.query(
        'UPDATE reservations SET status = $1 WHERE id = $2',
        ['EXPIRED', reservationId]  // reservations uses uppercase 'EXPIRED'
      ).catch(() => {}); // Ignore if not in this table

      // Clear reservation from Redis
      await RedisService.del(`reservation:${reservationId}`);

      // Publish event
      try {
        await queueService.publish(config.rabbitmq.queues.ticketEvents, {
          type: 'tickets.purchased',
          userId: reservation.user_id,
          eventId: eventId,
          ticketIds: tickets.map((t: any) => t.id),
          timestamp: new Date()
        });
      } catch (error) {
        this.log.warn('Failed to publish ticket event:', error);
      }

      return tickets;
    });
  }

  async getTicket(ticketId: string): Promise<any> {
    // Check cache first
    const cached = await RedisService.get(`ticket:${ticketId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const query = `
      SELECT t.*, tt.name as ticket_type_name, tt.description as ticket_type_description
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      WHERE t.id = $1
    `;

    const result = await DatabaseService.query(query, [ticketId]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Ticket');
    }

    const ticket = result.rows[0];

    // Cache for future requests
    await RedisService.set(
      `ticket:${ticketId}`,
      JSON.stringify(ticket),
      config.redis.ttl.cache
    );

    return ticket;
  }

  async getUserTickets(userId: string, eventId?: string): Promise<Ticket[]> {
    let query = `
      SELECT t.*, tt.name as ticket_type_name, e.name as event_name
      FROM tickets t
      JOIN ticket_types tt ON t.ticket_type_id = tt.id
      JOIN events e ON t.event_id = e.id
      WHERE t.owner_id = $1
    `;

    const params: any[] = [userId];

    if (eventId) {
      query += ' AND t.event_id = $2';
      params.push(eventId);
    }

    query += ' ORDER BY t.created_at DESC';

    const result = await DatabaseService.query<Ticket>(query, params);
    return result.rows;
  }

  async updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
    const query = 'UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2';
    await DatabaseService.query(query, [status, ticketId]);

    // Clear cache
    await RedisService.del(`ticket:${ticketId}`);
  }

  async expireReservations(): Promise<void> {
    const query = `
      UPDATE reservations
      SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' AND expires_at < NOW()
      RETURNING *
    `;

    const result = await DatabaseService.query(query);

    // Release tickets for expired reservations
    for (const reservation of result.rows) {
      const tickets = reservation.tickets || [];

      for (const ticket of tickets) {
        await DatabaseService.query(
          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
          [ticket.quantity, ticket.ticketTypeId]
        );
      }

      // Clear from Redis
      await RedisService.del(`reservation:${reservation.id}`);
    }

    // Also expire in ticket_reservations table
    await DatabaseService.query(
      `UPDATE ticket_reservations SET status = 'expired' WHERE status = 'ACTIVE' AND expires_at < NOW()`
    );

    this.log.info(`Expired ${result.rowCount} reservations`);
  }

  // NEW METHOD: Release Reservation (L2.1-018) - FIXED to use EXPIRED status
  async releaseReservation(reservationId: string, userId: string): Promise<any> {
    return await DatabaseService.transaction(async (client) => {
      const resQuery = `
        SELECT * FROM reservations
        WHERE id = $1 AND user_id = $2 AND status = 'ACTIVE'
        FOR UPDATE
      `;
      const resResult = await client.query(resQuery, [reservationId, userId]);

      if (resResult.rows.length === 0) {
        throw new NotFoundError('Reservation not found or already processed');
      }

      const reservation = resResult.rows[0];

      // Update reservation status to EXPIRED (valid status)
      await client.query(
        `UPDATE reservations SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
        [reservationId]
      );

      // Release the ticket quantities
      const tickets = reservation.tickets || [];
      for (const ticket of tickets) {
        await client.query(
          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
          [ticket.quantity, ticket.ticketTypeId]
        );
      }

      // Clear from Redis
      await RedisService.del(`reservation:${reservationId}`);

      return { success: true, reservation: reservation };
    });
  }

  // NEW METHOD: Generate QR (L2.1-020)
  async generateQR(ticketId: string): Promise<any> {
    const ticket = await this.getTicket(ticketId);

    // The database returns snake_case, so use those field names
    const qrPayload = {
      ticketId: ticket.id,
      eventId: ticket.event_id,
      userId: ticket.owner_id || ticket.owner_user_id || ticket.user_id,
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

  // NEW METHOD: Validate QR (L2.1-019) - FIXED to handle both formats
  async validateQR(qrData: string): Promise<any> {
    try {
      let payload;
      
      // Check if it's encrypted format (has ':' separator) or base64 JSON
      if (qrData.includes(':')) {
        // It's our encrypted format
        const decrypted = this.decryptData(qrData);
        payload = JSON.parse(decrypted);
      } else {
        // It's base64 JSON from the database trigger
        const decoded = Buffer.from(qrData, 'base64').toString('utf-8');
        const parsedData = JSON.parse(decoded);
        
        // Map the database format to our expected format
        payload = {
          ticketId: parsedData.ticket_id,
          eventId: parsedData.event_id,
          userId: parsedData.owner_id
        };
      }

      const ticket = await this.getTicket(payload.ticketId);

      // Check if ticket is valid - database uses snake_case
      const isValid = ticket.status === 'SOLD' && !ticket.used_at && !ticket.validated_at;

      return {
        valid: isValid,
        data: {
          ticketId: payload.ticketId,
          eventId: payload.eventId,
          userId: payload.userId
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Invalid QR code'
      };
    }
  }

  // Helper: Encrypt data for QR codes
  private encryptData(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return iv.toString('base64') + ':' + encrypted;
  }

  // Helper: Decrypt data from QR codes
  private decryptData(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.QR_ENCRYPTION_KEY || 'defaultkeychangethisto32charlong');

    const parts = data.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  private generateQRCode(ticketId: string): string {
    // Generate a unique QR code
    // In production, this would include encryption
    return `TKT:${ticketId}:${Date.now()}`;
  }
}

export const ticketService = new TicketService();
