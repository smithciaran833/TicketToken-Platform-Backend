# Complete Marketplace Service Context

This document contains all the patterns and code needed to implement the marketplace service.

## 1. Database Configuration
```javascript
const knex = require('knex');

const connection = knex({
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 6432, // PgBouncer port
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
  },
  pool: {
    min: 2,
    max: 10,
    createTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100
  },
  acquireConnectionTimeout: 30000
});

// Set tenant context for each query
connection.on('query', (query) => {
  if (global.currentTenant) {
    query.on('query', (q) => {
      connection.raw(`SET app.current_tenant = '${global.currentTenant}'`);
    });
  }
});

module.exports = connection;
```

## 2. Redis Configuration
```javascript
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true
});

redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

module.exports = redis;
```

## 3. Authentication Middleware
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
    venueId?: string;
    permissions?: string[];
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('Auth header:', authHeader); // DEBUG
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    console.log('Token length:', token.length); // DEBUG
    console.log('JWT_SECRET:', process.env.JWT_SECRET || "this-is-a-very-long-secret-key-that-is-at-least-32-characters"?.substring(0, 10) + '...'); // DEBUG

    if (!token) {
      throw new UnauthorizedError('No token provided');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "this-is-a-very-long-secret-key-that-is-at-least-32-characters"!) as any;
    console.log('Decoded token:', decoded); // DEBUG

    req.user = {
      id: decoded.sub,
      permissions: decoded.permissions || [],
      email: decoded.email,
      role: decoded.role,
      venueId: decoded.venueId
    };

    next();
  } catch (error) {
    console.error('Auth error:', error); // DEBUG
    if (error instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (error instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else {
      next(new UnauthorizedError('Invalid token'));
    }
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Unauthorized'));
    }
    
    if (req.user.role && roles.includes(req.user.role)) {
      return next();
    }
    
    if (req.user.permissions?.includes('admin:all')) {
      return next();
    }
    
    if (roles.includes('venue_manager') && req.user.permissions?.some(p => p.startsWith('venue:'))) {
      return next();
    }
    
    return next(new UnauthorizedError('Insufficient permissions'));
  };
};
```

## 4. Error Handling
```typescript
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'TOO_MANY_REQUESTS');
  }
}

```

## 5. Logger Pattern
```typescript
import winston from 'winston';
import { config } from '../config';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: config.env === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'ticket-service' },
  transports: [
    new winston.transports.Console({
      format: config.env === 'production' 
        ? logFormat 
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
    })
  ]
});

// Create child loggers for specific components
export const createLogger = (component: string) => {
  return logger.child({ component });
};
```

## 6. Ticket Controller Pattern
```typescript
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { ticketService } from '../services/ticketService';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export class TicketController {
  private log = logger.child({ component: 'TicketController' });

  async createTicketType(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const ticketType = await ticketService.createTicketType(req.body);
      res.status(201).json({
        success: true,
        data: ticketType
      });
    } catch (error) {
      next(error);
    }
  }

  async getTicketTypes(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { eventId } = req.params;
      const ticketTypes = await ticketService.getTicketTypes(eventId);
      
      res.json({
        success: true,
        data: ticketTypes
      });
    } catch (error) {
      next(error);
    }
  }

  async purchaseTickets(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const purchaseRequest = {
        ...req.body,
        userId: req.user!.id
      };

      // Create reservation
      const reservation = await ticketService.createReservation(purchaseRequest);
      
      res.json({
        success: true,
        data: {
          reservationId: reservation.id,
          expiresAt: reservation.expiresAt,
          tickets: reservation.tickets
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmPurchase(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { reservationId } = req.params;
      const { paymentId } = req.body;

      if (!paymentId) {
        throw new ValidationError('Payment ID is required');
      }

      const tickets = await ticketService.confirmPurchase(reservationId, paymentId);
      
      res.json({
        success: true,
        data: tickets
      });
    } catch (error) {
      next(error);
    }
  }

  async getTicket(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { ticketId } = req.params;
      const ticket = await ticketService.getTicket(ticketId);
      
      // Check ownership or admin role
      if (ticket.userId !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      res.json({
        success: true,
        data: ticket
      });
    } catch (error) {
      next(error);
    }
  }

  async getUserTickets(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.params.userId || req.user!.id;
      const { eventId } = req.query;

      // Check if user is requesting their own tickets or is admin
      if (userId !== req.user!.id && req.user!.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const tickets = await ticketService.getUserTickets(
        userId,
        eventId as string | undefined
      );
      
      res.json({
        success: true,
        data: tickets
      });
    } catch (error) {
      next(error);
    }
  }
```

## 7. Ticket Service Pattern
```typescript
import { queueService } from '../services/queueService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import { QueueService } from './queueService';
import { SolanaService } from './solanaService';
import { 
  Ticket, 
  TicketStatus, 
  TicketType, 
  PurchaseRequest, 
  TicketReservation,
  ServiceResponse 
} from '../types';
import { 
  NotFoundError, 
  ConflictError, 
  ValidationError 
} from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';

export class TicketService {
  private log = logger.child({ component: 'TicketService' });

  async createTicketType(data: Partial<TicketType>): Promise<TicketType> {
    const id = uuidv4();
    const query = `
      INSERT INTO ticket_types (
        id, event_id, name, description, price, 
        quantity, available_quantity, max_per_purchase,
        sale_start_date, sale_end_date, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, $8, $9, $10, $11)
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
      // Calculate total quantity from tickets array
      const totalQuantity = purchaseRequest.tickets.reduce((sum: number, t: any) => sum + t.quantity, 0);
      const firstTicketType = purchaseRequest.tickets[0];
      const reservationQuery = `
        INSERT INTO ticket_reservations (
          id, user_id, event_id, ticket_type_id, quantity, tickets, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const reservationResult = await client.query(reservationQuery, [
        reservationId,
        purchaseRequest.userId,
        purchaseRequest.eventId,
        firstTicketType.ticketTypeId,
        totalQuantity,
        JSON.stringify(purchaseRequest.tickets),
        expiresAt,
        'active'
      ]);

      // Store in Redis for quick lookup
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
      // Get reservation
      const reservationQuery = 'SELECT * FROM ticket_reservations WHERE id = $1 FOR UPDATE';
      const reservationResult = await client.query(reservationQuery, [reservationId]);

      if (reservationResult.rows.length === 0) {
        throw new NotFoundError('Reservation');
      }

      const reservation = reservationResult.rows[0];
      if (reservation.status !== 'active') {
        throw new ConflictError('Reservation is no longer active');
      }

      // Create tickets
      const tickets: Ticket[] = [];
      const ticketData = reservation.tickets;

      for (const ticketRequest of ticketData) {
        // Get ticket type info
        const typeQuery = 'SELECT * FROM ticket_types WHERE id = $1';
        const typeResult = await client.query(typeQuery, [ticketRequest.ticketTypeId]);
        const ticketType = typeResult.rows[0];

        // Create individual tickets
        for (let i = 0; i < ticketRequest.quantity; i++) {
          const ticketId = uuidv4();
          const qrCode = this.generateQRCode(ticketId);
          const qrCodeSecret = uuidv4();

          const ticketQuery = `
            INSERT INTO tickets (
              id, event_id, ticket_type_id, user_id, status,
              price, seat_number, qr_code, qr_code_secret,
              payment_id, purchased_at, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7, $8, $9, $10, $11, $12)
            RETURNING *
          `;

          const values = [
            ticketId,
            reservation.event_id,
            ticketRequest.ticketTypeId,
            reservation.user_id,
            TicketStatus.SOLD,
            ticketType.price,
            ticketRequest.seatNumbers?.[i] || null,
            qrCode,
            qrCodeSecret,
            paymentId,
            new Date(),
            JSON.stringify({
              ticketTypeName: ticketType.name,
              reservationId
            })
          ];

          const ticketResult = await client.query(ticketQuery, values);
          tickets.push(ticketResult.rows[0]);

          // Queue NFT minting
          await queueService.publishToQueue(config.rabbitmq.queues.nftMinting, {
            ticketId,
            userId: reservation.user_id,
            eventId: reservation.event_id,
            ticketType: ticketType.name,
            price: ticketType.price
          });
        }
      }

      // Update reservation status
      await client.query(
        'UPDATE ticket_reservations SET status = $1 WHERE id = $2',
        ['completed', reservationId]
      );

      // Clear reservation from Redis
      await RedisService.del(`reservation:${reservationId}`);

      // Publish event
      await queueService.publishToQueue(config.rabbitmq.queues.ticketEvents, {
        type: 'tickets.purchased',
        userId: reservation.user_id,
        eventId: reservation.event_id,
        ticketIds: tickets.map(t => t.id),
        timestamp: new Date()
      });

      return tickets;
    });
  }

  async getTicket(ticketId: string): Promise<Ticket> {
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

    const result = await DatabaseService.query<Ticket>(query, [ticketId]);
    
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
      WHERE t.user_id = $1
    `;

    const params: any[] = [userId];

    if (eventId) {
      query += ' AND t.event_id = $2';
      params.push(eventId);
    }

    query += ' ORDER BY t.purchased_at DESC';

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
      UPDATE ticket_reservations 
      SET status = 'expired' 
      WHERE status = 'active' AND expires_at < NOW()
      RETURNING *
    `;

    const result = await DatabaseService.query(query);

    // Release tickets for expired reservations
    for (const reservation of result.rows) {
      const tickets = reservation.tickets;
      
      for (const ticket of tickets) {
        await DatabaseService.query(
          'UPDATE ticket_types SET available_quantity = available_quantity + $1 WHERE id = $2',
          [ticket.quantity, ticket.ticketTypeId]
        );
      }

      // Clear from Redis
      await RedisService.del(`reservation:${reservation.id}`);
    }

    this.log.info(`Expired ${result.rowCount} reservations`);
  }

  private generateQRCode(ticketId: string): string {
    // Generate a unique QR code
    // In production, this would include encryption
    return `TKT:${ticketId}:${Date.now()}`;
  }
}

export const ticketService = new TicketService();
```

## 8. Transfer Service
```typescript
import { queueService } from '../services/queueService';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './databaseService';
import { RedisService } from './redisService';
import { QueueService } from './queueService';
import { SolanaService } from './solanaService';
import { Ticket, TicketStatus, TransferRecord } from '../types';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { config } from '../config';
import { logger } from '../utils/logger';

export class TransferService {
  private log = logger.child({ component: 'TransferService' });

  async transferTicket(
    ticketId: string, 
    fromUserId: string, 
    toUserId: string, 
    reason?: string
  ): Promise<TransferRecord> {
    return await DatabaseService.transaction(async (client) => {
      // Lock ticket for update
      const ticketQuery = 'SELECT * FROM tickets WHERE id = $1 FOR UPDATE';
      const ticketResult = await client.query(ticketQuery, [ticketId]);

      if (ticketResult.rows.length === 0) {
        throw new NotFoundError('Ticket');
      }

      const ticket = ticketResult.rows[0];

      // Validate ownership
      if (ticket.user_id !== fromUserId) {
        throw new ForbiddenError('You do not own this ticket');
      }

      // Validate ticket status
      if (ticket.status !== TicketStatus.SOLD) {
        throw new ValidationError(`Cannot transfer ticket with status: ${ticket.status}`);
      }

      // Check transfer restrictions
      const eventQuery = `
        SELECT e.*, v.transfer_deadline_hours 
        FROM events e 
        JOIN venues v ON e.venue_id = v.id 
        WHERE e.id = $1
      `;
      const eventResult = await client.query(eventQuery, [ticket.event_id]);
      const event = eventResult.rows[0];

      // Check transfer deadline
      const hoursUntilEvent = (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilEvent < event.transfer_deadline_hours) {
        throw new ValidationError('Transfer deadline has passed for this event');
      }

      // Update ticket ownership
      const updateQuery = `
        UPDATE tickets 
        SET user_id = $1, status = $2, updated_at = NOW() 
        WHERE id = $3
      `;
      await client.query(updateQuery, [toUserId, TicketStatus.TRANSFERRED, ticketId]);

      // Record transfer
      const transferRecord: TransferRecord = {
        fromUserId,
        toUserId,
        transferredAt: new Date(),
        reason
      };

      const transferQuery = `
        INSERT INTO ticket_transfers 
        (id, ticket_id, from_user_id, to_user_id, reason, transferred_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      await client.query(transferQuery, [
        uuidv4(),
        ticketId,
        fromUserId,
        toUserId,
        reason || null,
        new Date()
      ]);

      // Update transfer history
      const historyQuery = `
        UPDATE tickets 
        SET transfer_history = transfer_history || $1::jsonb 
        WHERE id = $2
      `;
      await client.query(historyQuery, [
        JSON.stringify([transferRecord]),
        ticketId
      ]);

      // Transfer NFT if minted
      if (ticket.nft_token_id) {
        try {
          const txHash = await SolanaService.transferNFT(
            ticket.nft_token_id,
            fromUserId,
            toUserId
          );
          
          transferRecord.transactionHash = txHash;
          
          // Update transfer record with blockchain transaction
          await client.query(
            'UPDATE ticket_transfers SET transaction_hash = $1 WHERE ticket_id = $2 AND transferred_at = $3',
            [txHash, ticketId, transferRecord.transferredAt]
          );
        } catch (error) {
          this.log.error('NFT transfer failed:', error);
          // Continue with database transfer even if blockchain fails
        }
      }

      // Clear cache
      await RedisService.del(`ticket:${ticketId}`);

      // Publish transfer event
      await queueService.publishToQueue(config.rabbitmq.queues.ticketEvents, {
        type: 'ticket.transferred',
        ticketId,
        fromUserId,
        toUserId,
        timestamp: new Date()
      });

      // Send notifications
      await queueService.publishToQueue(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.sender',
        userId: fromUserId,
        ticketId,
        toUserId
      });

      await queueService.publishToQueue(config.rabbitmq.queues.notifications, {
        type: 'ticket.transfer.receiver',
        userId: toUserId,
        ticketId,
        fromUserId
      });

      return transferRecord;
    });
  }

  async getTransferHistory(ticketId: string): Promise<TransferRecord[]> {
    const query = `
      SELECT * FROM ticket_transfers 
      WHERE ticket_id = $1 
      ORDER BY transferred_at DESC
    `;
    
    const result = await DatabaseService.query<TransferRecord>(query, [ticketId]);
    return result.rows;
  }

  async validateTransferRequest(
    ticketId: string,
    fromUserId: string,
    toUserId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // Check if users exist
      // This would normally call the auth service
      
      // Check if target user can receive tickets
      // Check for any restrictions or bans
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

export const transferService = new TransferService();
```

## 9. Solana Integration
```typescript
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { NFTMintRequest } from '../types';

class SolanaServiceClass {
  private connection: Connection | null = null;
  private wallet: Keypair | null = null;
  private log = logger.child({ component: 'SolanaService' });

  async initialize(): Promise<void> {
    try {
      this.connection = new Connection(config.solana.rpcUrl, config.solana.commitment);
      
      // Make wallet optional for development
      if (config.solana.walletPrivateKey && config.solana.walletPrivateKey !== 'your-wallet-private-key') {
        try {
          const privateKey = Uint8Array.from(
            Buffer.from(config.solana.walletPrivateKey, 'base64')
          );
          this.wallet = Keypair.fromSecretKey(privateKey);
          this.log.info('Solana wallet loaded', {
            publicKey: this.wallet.publicKey.toBase58()
          });
        } catch (walletError) {
          this.log.warn('Solana wallet not configured - NFT minting will be simulated', walletError);
        }
      } else {
        this.log.warn('Solana wallet not configured - NFT minting will be simulated');
      }

      // Test connection
      const version = await this.connection.getVersion();
      this.log.info('Solana connected', { version });
    } catch (error) {
      this.log.error('Failed to initialize Solana:', error);
      throw error;
    }
  }

  getConnection(): Connection {
    if (!this.connection) {
      throw new Error('Solana not initialized');
    }
    return this.connection;
  }

  getWallet(): Keypair {
    if (!this.wallet) {
      throw new Error('Solana wallet not initialized');
    }
    return this.wallet;
  }

  async mintNFT(request: NFTMintRequest): Promise<{ tokenId: string; transactionHash: string }> {
    // This is a placeholder - actual implementation would use Metaplex
    this.log.info('Minting NFT (simulated)', { ticketId: request.ticketId });
    
    // Simulate minting
    return {
      tokenId: `token_${Date.now()}`,
      transactionHash: `tx_${Date.now()}`
    };
  }

  async transferNFT(tokenId: string, from: string, to: string): Promise<string> {
    // Placeholder for NFT transfer
    this.log.info('Transferring NFT (simulated)', { tokenId, from, to });
    return `transfer_tx_${Date.now()}`;
  }
}

export const SolanaService = new SolanaServiceClass();
```

## 10. Database Service Pattern
```typescript
import { Pool } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

class DatabaseServiceClass {
  private pool: Pool | null = null;
  private log = logger.child({ component: 'DatabaseService' });

  async initialize(): Promise<void> {
    try {
      this.pool = new Pool({
        connectionString: config.database.url,
        ...config.database.pool
      });

      // Test connection
      await this.pool.query('SELECT NOW()');
      this.log.info('Database connection established');

      // Set up connection error handling
      this.pool.on('error', (err) => {
        this.log.error('Unexpected database error:', err);
      });
    } catch (error) {
      this.log.error('Failed to initialize database:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not initialized');
    }
    return this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<{ rows: T[]; rowCount: number | null }> {
    const pool = this.getPool();
    const start = Date.now();

    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      
      this.log.debug('Query executed', {
        query: text,
        duration,
        rows: result.rowCount
      });

      return result;
    } catch (error) {
      this.log.error('Query failed:', {
        query: text,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  async transaction<T>(callback: (client: any) => Promise<T>): Promise<T> {
    const pool = this.getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.log.info('Database connection closed');
    }
  }
}

export const DatabaseService = new DatabaseServiceClass();
```

## 11. Model Pattern (Payment Service)
```typescript
import { query } from '../config/database';
import { Transaction, TransactionStatus } from '../types';

export class TransactionModel {
  static async create(data: Partial<Transaction>): Promise<Transaction> {
    const text = `
      INSERT INTO payment_transactions (
        venue_id, user_id, event_id, amount, currency,
        status, platform_fee, venue_payout, gas_fee_paid,
        stripe_payment_intent_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    
    const values = [
      data.venueId,
      data.userId,
      data.eventId,
      data.amount,
      data.currency || 'USD',
      data.status || TransactionStatus.PENDING,
      data.platformFee,
      data.venuePayout,
      data.gasFeePaid,
      data.stripePaymentIntentId,
      JSON.stringify(data.metadata || {})
    ];
    
    const result = await query(text, values);
    return result.rows[0];
  }

  static async findById(id: string): Promise<Transaction | null> {
    const result = await query('SELECT * FROM payment_transactions WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async updateStatus(id: string, status: TransactionStatus): Promise<Transaction> {
    const text = `
      UPDATE payment_transactions 
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await query(text, [id, status]);
    return result.rows[0];
  }

  static async getVenueTransactions(venueId: string, limit = 100): Promise<Transaction[]> {
    const text = `
      SELECT * FROM payment_transactions 
      WHERE venue_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    const result = await query(text, [venueId, limit]);
    return result.rows;
  }
}
```

## 12. Existing Marketplace Controller
```typescript
import { Request, Response, NextFunction } from 'express';
import { EscrowService, RoyaltySplitterService, PriceEnforcerService } from '../services/marketplace';

export class MarketplaceController {
  private escrowService: EscrowService;
  private royaltySplitter: RoyaltySplitterService;
  private priceEnforcer: PriceEnforcerService;
  
  constructor() {
    this.escrowService = new EscrowService();
    this.royaltySplitter = new RoyaltySplitterService();
    this.priceEnforcer = new PriceEnforcerService();
  }
  
  async createListing(req: Request, res: Response, next: NextFunction) {
    try {
      const { ticketId, price } = req.body;
      const userId = req.user.id;
      
      // Validate price
      const priceValidation = await this.priceEnforcer.validateListingPrice(
        ticketId,
        price,
        req.body.venueId
      );
      
      if (!priceValidation.valid) {
        return res.status(400).json({
          error: priceValidation.reason,
          originalPrice: priceValidation.originalPrice,
          maxAllowedPrice: priceValidation.maxAllowedPrice,
          minAllowedPrice: priceValidation.minAllowedPrice
        });
      }
      
      // Create listing (would integrate with ticket service)
      const listing = {
        id: `listing_${Date.now()}`,
        ticketId,
        sellerId: userId,
        price,
        originalPrice: priceValidation.originalPrice!,
        venueRoyaltyPercentage: 10, // Default 10%
        status: 'active',
        createdAt: new Date()
      };
      
      res.status(201).json({
        success: true,
        listing,
        priceInfo: priceValidation
      });
    } catch (error) {
      next(error);
    }
  }
  
  async purchaseResaleTicket(req: Request, res: Response, next: NextFunction) {
    try {
      const { listingId, paymentMethodId } = req.body;
      const buyerId = req.user.id;
      
      // Get listing details (mock for now)
      const listing = {
        id: listingId,
        sellerId: 'seller123',
        price: 150,
        venueRoyaltyPercentage: 10,
        ticketId: 'ticket123'
      };
      
      // Create escrow
      const escrow = await this.escrowService.createEscrow(
        listing as any,
        buyerId,
        paymentMethodId
      );
      
      // Fund escrow (charge buyer)
      await this.escrowService.fundEscrow(escrow.id);
      
      res.json({
        success: true,
        escrow,
        message: 'Payment held in escrow. Transfer will complete after NFT transfer.'
      });
    } catch (error) {
      next(error);
    }
  }
  
  async confirmTransfer(req: Request, res: Response, next: NextFunction) {
    try {
      const { escrowId } = req.params;
      
      // In production, verify NFT transfer on blockchain
      // For now, simulate transfer confirmation
      
      // Release escrow funds
      await this.escrowService.releaseEscrow(escrowId);
      
      res.json({
        success: true,
        message: 'Transfer confirmed and funds released'
      });
    } catch (error) {
      next(error);
    }
  }
  
  async getRoyaltyReport(req: Request, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      const { startDate, endDate } = req.query;
      
      // Verify venue access
      if (!req.user.venues?.includes(venueId) && !req.user.isAdmin) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }
      
      const report = await this.royaltySplitter.getRoyaltyReport(
        venueId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      
      res.json(report);
    } catch (error) {
      next(error);
    }
  }
  
  async getPricingAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const { venueId } = req.params;
      
      const analytics = await this.priceEnforcer.getPricingAnalytics(venueId);
      
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }
}
```

## 13. Database Schemas
### Tickets Table
```sql
-- TicketToken Platform - Individual Tickets Management Schema
-- Week 1, Day 5: Individual Tickets and Ownership Management
-- Created: $(date +%Y-%m-%d)
-- Description: Comprehensive individual ticket management including NFT integration,
--              transfer history, validation, and ownership tracking

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- TICKETS MASTER TABLE
-- ==========================================
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    event_id UUID NOT NULL,
    ticket_type_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,
    purchaser_user_id UUID NOT NULL, -- Original purchaser (may differ from current owner)
    
    -- Unique identifiers
    ticket_number VARCHAR(50) NOT NULL UNIQUE,
    barcode VARCHAR(100) NOT NULL UNIQUE,
    qr_code VARCHAR(500), -- QR code data/URL
    ticket_hash VARCHAR(64) UNIQUE, -- SHA-256 hash for verification
    
    -- Seat and location assignment
    venue_section VARCHAR(50),
    seat_row VARCHAR(10),
    seat_number VARCHAR(10),
    seat_coordinates JSONB, -- For GA events or complex layouts
    access_level VARCHAR(20),
    special_access TEXT[], -- Array of special access permissions
    
    -- Purchase information
    purchase_price DECIMAL(10,2) NOT NULL CHECK (purchase_price >= 0),
    fees_paid DECIMAL(10,2) DEFAULT 0,
    taxes_paid DECIMAL(10,2) DEFAULT 0,
    total_paid DECIMAL(10,2) NOT NULL CHECK (total_paid >= 0),
    currency_code VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(20),
    transaction_id VARCHAR(100),
    purchase_channel VARCHAR(30) DEFAULT 'WEB' CHECK (purchase_channel IN ('WEB', 'MOBILE', 'POS', 'PHONE', 'THIRD_PARTY', 'RESALE')),
    
    -- Ticket status and lifecycle
    status VARCHAR(20) DEFAULT 'SOLD' CHECK (status IN ('AVAILABLE', 'RESERVED', 'SOLD', 'USED', 'REFUNDED', 'CANCELLED', 'TRANSFERRED', 'EXPIRED', 'VOID')),
    substatus VARCHAR(30), -- Additional status details like 'PENDING_TRANSFER', 'AWAITING_REFUND'
    is_active BOOLEAN DEFAULT true,
    is_transferable BOOLEAN DEFAULT true,
    is_refundable BOOLEAN DEFAULT true,
    is_digital BOOLEAN DEFAULT true,
    requires_id_check BOOLEAN DEFAULT false,
    
    -- NFT and blockchain integration
    nft_token_id VARCHAR(100),
    blockchain_network VARCHAR(20), -- 'ETHEREUM', 'POLYGON', 'SOLANA', etc.
    smart_contract_address VARCHAR(100),
    nft_metadata_uri VARCHAR(500),
    blockchain_transaction_hash VARCHAR(100),
    nft_minted_at TIMESTAMP WITH TIME ZONE,
    nft_owner_wallet_address VARCHAR(100),
    
    -- Timing and validation
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_from TIMESTAMP WITH TIME ZONE,
    valid_until TIMESTAMP WITH TIME ZONE,
    first_scanned_at TIMESTAMP WITH TIME ZONE,
    last_scanned_at TIMESTAMP WITH TIME ZONE,
    scan_count INTEGER DEFAULT 0,
    entry_allowed_from TIMESTAMP WITH TIME ZONE,
    entry_cutoff TIMESTAMP WITH TIME ZONE,
    
    -- Transfer and ownership
    transfer_count INTEGER DEFAULT 0,
    original_purchase_id UUID, -- Links to original purchase record
    transfer_restrictions JSONB,
    ownership_verified_at TIMESTAMP WITH TIME ZONE,
    verification_method VARCHAR(20),
    
    -- Additional metadata
    notes TEXT,
    metadata JSONB,
    source_system VARCHAR(50) DEFAULT 'TICKETTOKEN',
    external_reference VARCHAR(100),
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID,
    updated_by UUID,
    
    -- Constraints
    CONSTRAINT fk_ticket_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_purchaser FOREIGN KEY (purchaser_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ticket_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_ticket_updater FOREIGN KEY (updated_by) REFERENCES users(id),
    CONSTRAINT chk_ticket_dates CHECK (valid_until IS NULL OR valid_until > valid_from),
    CONSTRAINT chk_entry_dates CHECK (entry_cutoff IS NULL OR entry_cutoff > entry_allowed_from),
    CONSTRAINT chk_scan_count CHECK (scan_count >= 0),
    CONSTRAINT chk_transfer_count CHECK (transfer_count >= 0)
);

-- ==========================================
-- TICKET TRANSFER HISTORY
-- ==========================================
CREATE TABLE ticket_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    original_ticket_id UUID NOT NULL, -- The ticket being transferred
    new_ticket_id UUID, -- New ticket created for recipient (if applicable)
    
    -- Transfer parties
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    initiated_by_user_id UUID NOT NULL,
    
    -- Transfer details
    transfer_type VARCHAR(20) NOT NULL CHECK (transfer_type IN ('GIFT', 'SALE', 'RESALE', 'REFUND_REPLACEMENT', 'UPGRADE', 'ADMIN')),
    transfer_method VARCHAR(20) DEFAULT 'PLATFORM' CHECK (transfer_method IN ('PLATFORM', 'EMAIL', 'QR_CODE', 'BLOCKCHAIN', 'PHYSICAL')),
    transfer_price DECIMAL(10,2), -- Price paid in transfer (for resales)
    transfer_fee DECIMAL(10,2) DEFAULT 0,
    platform_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Transfer status and validation
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
    requires_approval BOOLEAN DEFAULT false,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Blockchain transaction (if NFT)
    blockchain_transaction_hash VARCHAR(100),
    blockchain_confirmation_count INTEGER DEFAULT 0,
    gas_fee DECIMAL(18,8),
    
    -- Transfer restrictions and validation
    transfer_code VARCHAR(20), -- Unique code for email/manual transfers
    expires_at TIMESTAMP WITH TIME ZONE,
    acceptance_deadline TIMESTAMP WITH TIME ZONE,
    transfer_message TEXT,
    terms_accepted BOOLEAN DEFAULT false,
    
    -- Audit trail
    initiated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancellation_reason TEXT,
    
    -- Constraints
    CONSTRAINT fk_transfer_original_ticket FOREIGN KEY (original_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_new_ticket FOREIGN KEY (new_ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_transfer_from_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_to_user FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_initiator FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_transfer_approver FOREIGN KEY (approved_by) REFERENCES users(id),
    CONSTRAINT chk_transfer_different_users CHECK (from_user_id != to_user_id),
    CONSTRAINT chk_transfer_price CHECK (transfer_price IS NULL OR transfer_price >= 0)
);

-- ==========================================
-- TICKET VALIDATION AND ENTRY LOGS
-- ==========================================
CREATE TABLE ticket_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_id UUID NOT NULL,
    
    -- Validation details
    validation_type VARCHAR(20) NOT NULL CHECK (validation_type IN ('ENTRY_SCAN', 'VALIDATION_CHECK', 'FRAUD_CHECK', 'ID_VERIFICATION', 'MANUAL_CHECK')),
    validation_method VARCHAR(20) NOT NULL CHECK (validation_method IN ('QR_SCAN', 'BARCODE_SCAN', 'NFC', 'RFID', 'MANUAL', 'MOBILE_APP', 'KIOSK')),
    validation_result VARCHAR(20) NOT NULL CHECK (validation_result IN ('VALID', 'INVALID', 'EXPIRED', 'USED', 'DUPLICATE', 'FRAUD', 'ERROR')),
    
    -- Location and device information
    validation_location VARCHAR(100), -- Gate, entrance, checkpoint name
    venue_zone VARCHAR(50),
    device_id VARCHAR(100),
    device_type VARCHAR(30),
    gps_coordinates POINT,
    ip_address INET,
    user_agent TEXT,
    
    -- Validation context
    validated_by_user_id UUID, -- Staff member who performed validation
    validation_notes TEXT,
    error_message TEXT,
    confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    
    -- Fraud detection
    fraud_flags TEXT[],
    risk_score DECIMAL(5,2) DEFAULT 0,
    duplicate_scan_detected BOOLEAN DEFAULT false,
    time_since_last_scan INTERVAL,
    
    -- Additional data
    validation_data JSONB, -- Flexible data for specific validation types
    photo_url VARCHAR(500), -- Photo taken during validation
    signature_data TEXT, -- Digital signature if captured
    
    -- Timing
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER, -- How long validation took
    
    -- Constraints
    CONSTRAINT fk_validation_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_validation_user FOREIGN KEY (validated_by_user_id) REFERENCES users(id)
);

-- ==========================================
-- TICKET OWNERSHIP CHAIN
-- ==========================================
CREATE TABLE ticket_ownership_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,
    ownership_type VARCHAR(20) NOT NULL CHECK (ownership_type IN ('PURCHASE', 'TRANSFER', 'GIFT', 'INHERITANCE', 'ADMIN_ASSIGN', 'REFUND_REISSUE')),
    
    -- Ownership period
    owned_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    owned_until TIMESTAMP WITH TIME ZONE,
    is_current_owner BOOLEAN DEFAULT false,
    
    -- Reference to transaction that caused ownership change
    source_transaction_id UUID, -- Could reference purchase, transfer, etc.
    source_transaction_type VARCHAR(20),
    price_paid DECIMAL(10,2),
    
    -- Verification and proof
    ownership_proof_hash VARCHAR(64),
    blockchain_transaction_hash VARCHAR(100),
    legal_document_url VARCHAR(500),
    
    -- Additional context
    ownership_notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_ownership_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ownership_user FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- ==========================================
-- TICKET RESALE LISTINGS
-- ==========================================
CREATE TABLE ticket_resale_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    ticket_id UUID NOT NULL,
    seller_user_id UUID NOT NULL,
    
    -- Listing details
    listing_price DECIMAL(10,2) NOT NULL CHECK (listing_price > 0),
    min_price DECIMAL(10,2) CHECK (min_price <= listing_price),
    currency_code VARCHAR(3) DEFAULT 'USD',
    price_type VARCHAR(20) DEFAULT 'FIXED' CHECK (price_type IN ('FIXED', 'AUCTION', 'MAKE_OFFER', 'DECLINING')),
    
    -- Auction details (if applicable)
    auction_start_price DECIMAL(10,2),
    auction_reserve_price DECIMAL(10,2),
    auction_end_time TIMESTAMP WITH TIME ZONE,
    current_highest_bid DECIMAL(10,2),
    bid_count INTEGER DEFAULT 0,
    
    -- Listing status and visibility
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'SOLD', 'CANCELLED', 'EXPIRED', 'REMOVED')),
    visibility VARCHAR(20) DEFAULT 'PUBLIC' CHECK (visibility IN ('PUBLIC', 'PRIVATE', 'INVITE_ONLY', 'PLATFORM_ONLY')),
    is_verified BOOLEAN DEFAULT false,
    verification_notes TEXT,
    
    -- Platform and fees
    platform_fee_percentage DECIMAL(5,2) DEFAULT 10,
    seller_fee DECIMAL(10,2) DEFAULT 0,
    buyer_fee DECIMAL(10,2) DEFAULT 0,
    
    -- Listing metadata
    title VARCHAR(200),
    description TEXT,
    listing_images TEXT[],
    tags TEXT[],
    external_listing_urls TEXT[],
    
    -- Geographic restrictions
    allowed_countries TEXT[],
    restricted_regions TEXT[],
    local_pickup_available BOOLEAN DEFAULT false,
    shipping_options JSONB,
    
    -- Timing
    listed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    sold_at TIMESTAMP WITH TIME ZONE,
    removed_at TIMESTAMP WITH TIME ZONE,
    
    -- Performance tracking
    view_count INTEGER DEFAULT 0,
    inquiry_count INTEGER DEFAULT 0,
    offer_count INTEGER DEFAULT 0,
    
    -- Additional data
    metadata JSONB,
    created_by UUID,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_resale_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_resale_seller FOREIGN KEY (seller_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_resale_creator FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT chk_resale_auction CHECK (
        (price_type != 'AUCTION') OR 
        (auction_start_price IS NOT NULL AND auction_end_time IS NOT NULL)
    )
);

-- ==========================================
-- TICKET BATCH OPERATIONS
-- ==========================================
CREATE TABLE ticket_batch_operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    operation_type VARCHAR(30) NOT NULL CHECK (operation_type IN ('BULK_CREATE', 'BULK_TRANSFER', 'BULK_CANCEL', 'BULK_REFUND', 'BULK_UPDATE', 'BULK_VALIDATE')),
    event_id UUID,
    ticket_type_id UUID,
    
    -- Operation parameters
    operation_parameters JSONB NOT NULL,
    ticket_ids UUID[], -- Array of ticket IDs affected
    target_user_id UUID, -- For bulk transfers
    
    -- Operation status
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    total_tickets INTEGER NOT NULL,
    processed_tickets INTEGER DEFAULT 0,
    successful_tickets INTEGER DEFAULT 0,
    failed_tickets INTEGER DEFAULT 0,
    
    -- Progress tracking
    progress_percentage DECIMAL(5,2) DEFAULT 0,
    estimated_completion TIMESTAMP WITH TIME ZONE,
    error_messages TEXT[],
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    initiated_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_batch_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_batch_ticket_type FOREIGN KEY (ticket_type_id) REFERENCES ticket_types(id) ON DELETE CASCADE,
    CONSTRAINT fk_batch_target_user FOREIGN KEY (target_user_id) REFERENCES users(id),
    CONSTRAINT fk_batch_initiator FOREIGN KEY (initiated_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_batch_counts CHECK (processed_tickets = successful_tickets + failed_tickets)
);

-- ==========================================
-- HELPER FUNCTIONS
-- ==========================================

-- Function to generate unique ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number(p_event_id UUID, p_ticket_type_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_event_code VARCHAR(10);
    v_type_code VARCHAR(5);
    v_sequence INTEGER;
    v_ticket_number VARCHAR(50);
BEGIN
    -- Get event code (first 3 chars of event name + last 4 of UUID)
    SELECT UPPER(LEFT(REGEXP_REPLACE(event_name, '[^A-Za-z0-9]', '', 'g'), 3)) || 
           RIGHT(REPLACE(id::TEXT, '-', ''), 4) INTO v_event_code
    FROM events WHERE id = p_event_id;
    
    -- Get ticket type code (first 2 chars of type name + priority)
    SELECT UPPER(LEFT(REGEXP_REPLACE(type_name, '[^A-Za-z0-9]', '', 'g'), 2)) || 
           LPAD(tier_priority::TEXT, 1, '0') INTO v_type_code
    FROM ticket_types WHERE id = p_ticket_type_id;
    
    -- Get next sequence number for this event/type combination
    SELECT COALESCE(MAX(CAST(RIGHT(ticket_number, 6) AS INTEGER)), 0) + 1 INTO v_sequence
    FROM tickets 
    WHERE event_id = p_event_id AND ticket_type_id = p_ticket_type_id
    AND ticket_number ~ '^[A-Z0-9]+-[A-Z0-9]+-[0-9]+$';
    
    v_ticket_number := v_event_code || '-' || v_type_code || '-' || LPAD(v_sequence::TEXT, 6, '0');
    
    RETURN v_ticket_number;
END;
$$ LANGUAGE plpgsql;

-- Function to generate barcode
CREATE OR REPLACE FUNCTION generate_barcode(p_ticket_id UUID)
RETURNS VARCHAR AS $$
DECLARE
    v_timestamp BIGINT;
    v_hash VARCHAR(32);
    v_barcode VARCHAR(100);
BEGIN
    v_timestamp := EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::BIGINT;
    v_hash := MD5(p_ticket_id::TEXT || v_timestamp::TEXT);
    v_barcode := 'TT' || UPPER(LEFT(v_hash, 12)) || LPAD((v_timestamp % 999999)::TEXT, 6, '0');
    
    RETURN v_barcode;
END;
$$ LANGUAGE plpgsql;

-- Function to validate ticket for entry
CREATE OR REPLACE FUNCTION validate_ticket_entry(
    p_ticket_id UUID,
    p_validation_location VARCHAR DEFAULT NULL,
    p_validated_by UUID DEFAULT NULL
)
RETURNS TABLE(
    is_valid BOOLEAN,
    validation_result VARCHAR,
    error_message TEXT,
    entry_allowed BOOLEAN
) AS $$
DECLARE
    v_ticket RECORD;
    v_validation_id UUID;
    v_now TIMESTAMP WITH TIME ZONE := CURRENT_TIMESTAMP;
    v_last_scan TIMESTAMP WITH TIME ZONE;
    v_fraud_flags TEXT[] := ARRAY[]::TEXT[];
    v_confidence DECIMAL(3,2) := 1.00;
BEGIN
    -- Get ticket details
    SELECT t.*, e.event_date, e.event_start_time INTO v_ticket
    FROM tickets t
    JOIN events e ON t.event_id = e.id
    WHERE t.id = p_ticket_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket not found', false;
        RETURN;
    END IF;
    
    -- Check ticket status
    IF v_ticket.status NOT IN ('SOLD', 'TRANSFERRED') THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket status: ' || v_ticket.status, false;
        RETURN;
    END IF;
    
    -- Check if ticket is active
    IF NOT v_ticket.is_active THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket is not active', false;
        RETURN;
    END IF;
    
    -- Check valid date range
    IF v_ticket.valid_from IS NOT NULL AND v_now < v_ticket.valid_from THEN
        RETURN QUERY SELECT false, 'INVALID', 'Ticket not yet valid', false;
        RETURN;
    END IF;
    
    IF v_ticket.valid_until IS NOT NULL AND v_now > v_ticket.valid_until THEN
        RETURN QUERY SELECT false, 'EXPIRED', 'Ticket has expired', false;
        RETURN;
    END IF;
    
    -- Check entry time windows
    IF v_ticket.entry_allowed_from IS NOT NULL AND v_now < v_ticket.entry_allowed_from THEN
        RETURN QUERY SELECT false, 'INVALID', 'Entry not yet allowed', false;
        RETURN;
    END IF;
    
    IF v_ticket.entry_cutoff IS NOT NULL AND v_now > v_ticket.entry_cutoff THEN
        RETURN QUERY SELECT false, 'EXPIRED', 'Entry cutoff time passed', false;
        RETURN;
    END IF;
    
    -- Check for recent duplicate scans
    SELECT last_scanned_at INTO v_last_scan
    FROM tickets WHERE id = p_ticket_id;
    
    IF v_last_scan IS NOT NULL AND v_now - v_last_scan < INTERVAL '30 seconds' THEN
        v_fraud_flags := array_append(v_fraud_flags, 'RAPID_SCAN');
        v_confidence := v_confidence - 0.3;
    END IF;
    
    -- Check if already used (for single-entry tickets)
    IF v_ticket.scan_count > 0 AND v_ticket.first_scanned_at IS NOT NULL THEN
        -- Allow re-entry within 15 minutes for legitimate cases
        IF v_now - v_ticket.first_scanned_at > INTERVAL '15 minutes' THEN
            RETURN QUERY SELECT false, 'USED', 'Ticket already used', false;
            RETURN;
        ELSE
            v_fraud_flags := array_append(v_fraud_flags, 'RECENT_REENTRY');
            v_confidence := v_confidence - 0.2;
        END IF;
    END IF;
    
    -- Update ticket scan information
    UPDATE tickets
    SET 
        scan_count = scan_count + 1,
        last_scanned_at = v_now,
        first_scanned_at = COALESCE(first_scanned_at, v_now),
        updated_at = v_now
    WHERE id = p_ticket_id;
    
    -- Log validation
    INSERT INTO ticket_validations (
        ticket_id, validation_type, validation_method, validation_result,
        validation_location, validated_by_user_id, fraud_flags,
        confidence_score, duplicate_scan_detected,
        time_since_last_scan
    ) VALUES (
        p_ticket_id, 'ENTRY_SCAN', 'QR_SCAN', 'VALID',
        p_validation_location, p_validated_by, v_fraud_flags,
        v_confidence, array_length(v_fraud_flags, 1) > 0,
        CASE WHEN v_last_scan IS NOT NULL THEN v_now - v_last_scan ELSE NULL END
    ) RETURNING id INTO v_validation_id;
    
    RETURN QUERY SELECT true, 'VALID', NULL, true;
END;
$$ LANGUAGE plpgsql;

-- Function to transfer ticket ownership
CREATE OR REPLACE FUNCTION transfer_ticket(
    p_ticket_id UUID,
    p_from_user_id UUID,
    p_to_user_id UUID,
    p_transfer_type VARCHAR DEFAULT 'GIFT',
    p_transfer_price DECIMAL DEFAULT NULL,
    p_initiated_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_transfer_id UUID;
    v_ticket RECORD;
    v_policy RECORD;
    v_new_ticket_id UUID;
BEGIN
    -- Get ticket and validate ownership
    SELECT * INTO v_ticket
    FROM tickets
    WHERE id = p_ticket_id AND owner_user_id = p_from_user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ticket not found or user not owner';
    END IF;
    
    -- Check if ticket is transferable
    IF NOT v_ticket.is_transferable THEN
        RAISE EXCEPTION 'Ticket is not transferable';
    END IF;
    
    -- Get transfer policy
    SELECT * INTO v_policy
    FROM ticket_type_transfer_policies
    WHERE ticket_type_id = v_ticket.ticket_type_id;
    
    -- Check transfer limits
    IF v_policy.max_transfers_per_ticket IS NOT NULL AND 
       v_ticket.transfer_count >= v_policy.max_transfers_per_ticket THEN
        RAISE EXCEPTION 'Maximum transfers exceeded for this ticket';
    END IF;
    
    -- Create transfer record
    INSERT INTO ticket_transfers (
        original_ticket_id, from_user_id, to_user_id,
        initiated_by_user_id, transfer_type, transfer_price,
        status, requires_approval
    ) VALUES (
        p_ticket_id, p_from_user_id, p_to_user_id,
        COALESCE(p_initiated_by, p_from_user_id), p_transfer_type, p_transfer_price,
        CASE WHEN COALESCE(v_policy.requires_approval, false) THEN 'PENDING' ELSE 'COMPLETED' END,
        COALESCE(v_policy.requires_approval, false)
    ) RETURNING id INTO v_transfer_id;
    
    -- If no approval required, complete transfer immediately
    IF NOT COALESCE(v_policy.requires_approval, false) THEN
        -- Update ticket ownership
        UPDATE tickets
        SET 
            owner_user_id = p_to_user_id,
            transfer_count = transfer_count + 1,
            updated_at = CURRENT_TIMESTAMP,
            status = 'TRANSFERRED'
        WHERE id = p_ticket_id;
        
        -- Record ownership change
        INSERT INTO ticket_ownership_history (
            ticket_id, owner_user_id, ownership_type,
            source_transaction_id, source_transaction_type, price_paid
        ) VALUES (
            p_ticket_id, p_to_user_id, 'TRANSFER',
            v_transfer_id, 'TRANSFER', p_transfer_price
        );
        
        -- Mark previous ownership as ended
        UPDATE ticket_ownership_history
        SET owned_until = CURRENT_TIMESTAMP, is_current_owner = false
        WHERE ticket_id = p_ticket_id AND is_current_owner = true AND owner_user_id = p_from_user_id;
        
        -- Update new ownership as current
        UPDATE ticket_ownership_history
        SET is_current_owner = true
        WHERE ticket_id = p_ticket_id AND owner_user_id = p_to_user_id 
        AND owned_until IS NULL;
        
        -- Update transfer status
        UPDATE ticket_transfers
        SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
        WHERE id = v_transfer_id;
    END IF;
    
    RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get ticket ownership chain
CREATE OR REPLACE FUNCTION get_ownership_chain(p_ticket_id UUID)
RETURNS TABLE(
    owner_user_id UUID,
    owner_name VARCHAR,
    ownership_type VARCHAR,
    owned_from TIMESTAMP WITH TIME ZONE,
    owned_until TIMESTAMP WITH TIME ZONE,
    price_paid DECIMAL,
    is_current BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        toh.owner_user_id,
        u.first_name || ' ' || u.last_name as owner_name,
        toh.ownership_type,
        toh.owned_from,
        toh.owned_until,
        toh.price_paid,
        toh.is_current_owner
    FROM ticket_ownership_history toh
    JOIN users u ON toh.owner_user_id = u.id
    WHERE toh.ticket_id = p_ticket_id
    ORDER BY toh.owned_from;
END;
$$ LANGUAGE plpgsql;

-- Function to bulk create tickets
CREATE OR REPLACE FUNCTION bulk_create_tickets(
    p_event_id UUID,
    p_ticket_type_id UUID,
    p_quantity INTEGER,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_batch_id UUID;
    v_ticket_id UUID;
    v_i INTEGER;
    v_ticket_number VARCHAR(50);
    v_barcode VARCHAR(100);
    v_ticket_type RECORD;
BEGIN
    -- Get ticket type details
    SELECT * INTO v_ticket_type FROM ticket_types WHERE id = p_ticket_type_id;
    
    -- Create batch operation record
    INSERT INTO ticket_batch_operations (
        operation_type, event_id, ticket_type_id, operation_parameters,
        total_tickets, initiated_by
    ) VALUES (
        'BULK_CREATE', p_event_id, p_ticket_type_id,
        jsonb_build_object('quantity', p_quantity, 'auto_assign_seats', false),
        p_quantity, p_created_by
    ) RETURNING id INTO v_batch_id;
    
    -- Update batch status
    UPDATE ticket_batch_operations
    SET status = 'PROCESSING', started_at = CURRENT_TIMESTAMP
    WHERE id = v_batch_id;
    
    -- Create tickets in loop
    FOR v_i IN 1..p_quantity LOOP
        BEGIN
            v_ticket_number := generate_ticket_number(p_event_id, p_ticket_type_id);
            v_barcode := generate_barcode(uuid_generate_v1());
            
            INSERT INTO tickets (
                event_id, ticket_type_id, owner_user_id, purchaser_user_id,
                ticket_number, barcode, purchase_price, total_paid,
                status, created_by
            ) VALUES (
                p_event_id, p_ticket_type_id, p_created_by, p_created_by,
                v_ticket_number, v_barcode, v_ticket_type.base_price, v_ticket_type.total_price,
                'AVAILABLE', p_created_by
            ) RETURNING id INTO v_ticket_id;
            
            -- Update batch progress
            UPDATE ticket_batch_operations
            SET 
                processed_tickets = processed_tickets + 1,
                successful_tickets = successful_tickets + 1,
                progress_percentage = ((processed_tickets + 1.0) / total_tickets) * 100,
                ticket_ids = array_append(ticket_ids, v_ticket_id)
            WHERE id = v_batch_id;
            
        EXCEPTION WHEN OTHERS THEN
            -- Update failed count
            UPDATE ticket_batch_operations
            SET 
                processed_tickets = processed_tickets + 1,
                failed_tickets = failed_tickets + 1,
                progress_percentage = ((processed_tickets + 1.0) / total_tickets) * 100,
                error_messages = array_append(error_messages, SQLERRM)
            WHERE id = v_batch_id;
        END;
    END LOOP;
    
    -- Complete batch operation
    UPDATE ticket_batch_operations
    SET status = 'COMPLETED', completed_at = CURRENT_TIMESTAMP
    WHERE id = v_batch_id;
    
    RETURN v_batch_id;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- INDEXES FOR PERFORMANCE
-- ==========================================
CREATE INDEX idx_tickets_event_id ON tickets(event_id);
CREATE INDEX idx_tickets_ticket_type_id ON tickets(ticket_type_id);
CREATE INDEX idx_tickets_owner_user_id ON tickets(owner_user_id);
CREATE INDEX idx_tickets_purchaser_user_id ON tickets(purchaser_user_id);
CREATE INDEX idx_tickets_ticket_number ON tickets(ticket_number);
CREATE INDEX idx_tickets_barcode ON tickets(barcode);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_active ON tickets(is_active) WHERE is_active = true;
CREATE INDEX idx_tickets_nft_token ON tickets(nft_token_id) WHERE nft_token_id IS NOT NULL;
CREATE INDEX idx_tickets_blockchain ON tickets(blockchain_network, smart_contract_address);
CREATE INDEX idx_tickets_purchased_at ON tickets(purchased_at);
CREATE INDEX idx_tickets_valid_dates ON tickets(valid_from, valid_until);
CREATE INDEX idx_tickets_seat_assignment ON tickets(venue_section, seat_row, seat_number);

CREATE INDEX idx_ticket_transfers_original ON ticket_transfers(original_ticket_id);
CREATE INDEX idx_ticket_transfers_from_user ON ticket_transfers(from_user_id);
CREATE INDEX idx_ticket_transfers_to_user ON ticket_transfers(to_user_id);
CREATE INDEX idx_ticket_transfers_status ON ticket_transfers(status);
CREATE INDEX idx_ticket_transfers_pending ON ticket_transfers(status, expires_at) WHERE status = 'PENDING';

CREATE INDEX idx_ticket_validations_ticket ON ticket_validations(ticket_id);
CREATE INDEX idx_ticket_validations_validated_at ON ticket_validations(validated_at);
CREATE INDEX idx_ticket_validations_result ON ticket_validations(validation_result);
CREATE INDEX idx_ticket_validations_location ON ticket_validations(validation_location);
CREATE INDEX idx_ticket_validations_fraud ON ticket_validations(fraud_flags) WHERE array_length(fraud_flags, 1) > 0;

CREATE INDEX idx_ownership_history_ticket ON ticket_ownership_history(ticket_id);
CREATE INDEX idx_ownership_history_user ON ticket_ownership_history(owner_user_id);
CREATE INDEX idx_ownership_history_current ON ticket_ownership_history(is_current_owner) WHERE is_current_owner = true;
CREATE INDEX idx_ownership_history_dates ON ticket_ownership_history(owned_from, owned_until);

CREATE INDEX idx_resale_listings_ticket ON ticket_resale_listings(ticket_id);
CREATE INDEX idx_resale_listings_seller ON ticket_resale_listings(seller_user_id);
CREATE INDEX idx_resale_listings_status ON ticket_resale_listings(status);
CREATE INDEX idx_resale_listings_active ON ticket_resale_listings(status, expires_at) WHERE status = 'ACTIVE';
CREATE INDEX idx_resale_listings_price ON ticket_resale_listings(listing_price);

CREATE INDEX idx_batch_operations_event ON ticket_batch_operations(event_id);
CREATE INDEX idx_batch_operations_type ON ticket_batch_operations(operation_type);
CREATE INDEX idx_batch_operations_status ON ticket_batch_operations(status);
CREATE INDEX idx_batch_operations_initiator ON ticket_batch_operations(initiated_by);

-- JSON/JSONB indexes
CREATE INDEX idx_tickets_metadata ON tickets USING GIN(metadata);
CREATE INDEX idx_tickets_seat_coordinates ON tickets USING GIN(seat_coordinates);
CREATE INDEX idx_tickets_special_access ON tickets USING GIN(special_access);
CREATE INDEX idx_validation_data ON ticket_validations USING GIN(validation_data);
CREATE INDEX idx_resale_shipping ON ticket_resale_listings USING GIN(shipping_options);

-- Text search indexes
CREATE INDEX idx_tickets_search ON tickets USING GIN(to_tsvector('english', ticket_number || ' ' || COALESCE(notes, '')));

-- Composite indexes for common queries
CREATE INDEX idx_tickets_event_status_owner ON tickets(event_id, status, owner_user_id);
CREATE INDEX idx_tickets_type_status_available ON tickets(ticket_type_id, status) WHERE status IN ('AVAILABLE', 'SOLD');
CREATE INDEX idx_validations_ticket_date ON ticket_validations(ticket_id, validated_at DESC);

-- ==========================================
-- TRIGGERS FOR AUTOMATED UPDATES
-- ==========================================

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tickets_updated
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION update_ticket_timestamp();

CREATE TRIGGER trg_resale_listings_updated
    BEFORE UPDATE ON ticket_resale_listings
    FOR EACH ROW EXECUTE FUNCTION update_ticket_timestamp();

-- Trigger to generate ticket identifiers on insert
CREATE OR REPLACE FUNCTION generate_ticket_identifiers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := generate_ticket_number(NEW.event_id, NEW.ticket_type_id);
    END IF;
    
    IF NEW.barcode IS NULL THEN
        NEW.barcode := generate_barcode(NEW.id);
    END IF;
    
    IF NEW.ticket_hash IS NULL THEN
        NEW.ticket_hash := ENCODE(SHA256((NEW.id || NEW.ticket_number || NEW.barcode)::BYTEA), 'hex');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_identifiers
    BEFORE INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION generate_ticket_identifiers();

-- Trigger to create initial ownership record
CREATE OR REPLACE FUNCTION create_initial_ownership()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO ticket_ownership_history (
        ticket_id, owner_user_id, ownership_type,
        is_current_owner, price_paid
    ) VALUES (
        NEW.id, NEW.owner_user_id, 'PURCHASE',
        true, NEW.total_paid
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_initial_ownership
    AFTER INSERT ON tickets
    FOR EACH ROW EXECUTE FUNCTION create_initial_ownership();

-- ==========================================
-- VIEWS FOR REPORTING
-- ==========================================

-- View for ticket overview with event and type details
CREATE VIEW v_ticket_overview AS
SELECT 
    t.id,
    t.ticket_number,
    t.barcode,
    e.event_name,
    tt.type_name as ticket_type,
    tt.ticket_tier,
    t.status,
    t.purchase_price,
    t.total_paid,
    CONCAT(u_owner.first_name, ' ', u_owner.last_name) as current_owner,
    CONCAT(u_purchaser.first_name, ' ', u_purchaser.last_name) as original_purchaser,
    t.venue_section,
    t.seat_row,
    t.seat_number,
    t.is_transferable,
    t.is_refundable,
    t.transfer_count,
    t.scan_count,
    t.purchased_at,
    t.first_scanned_at,
    t.last_scanned_at
FROM tickets t
JOIN events e ON t.event_id = e.id
JOIN ticket_types tt ON t.ticket_type_id = tt.id
JOIN users u_owner ON t.owner_user_id = u_owner.id
JOIN users u_purchaser ON t.purchaser_user_id = u_purchaser.id;

-- View for active transfers
CREATE VIEW v_active_transfers AS
SELECT 
    tt.id,
    t.ticket_number,
    e.event_name,
    CONCAT(u_from.first_name, ' ', u_from.last_name) as from_user,
    CONCAT(u_to.first_name, ' ', u_to.last_name) as to_user,
    tt.transfer_type,
    tt.transfer_price,
    tt.status,
    tt.initiated_at,
    tt.expires_at,
    CASE 
        WHEN tt.expires_at < CURRENT_TIMESTAMP THEN true
        ELSE false
    END as is_expired
FROM ticket_transfers tt
JOIN tickets t ON tt.original_ticket_id = t.id
JOIN events e ON t.event_id = e.id
JOIN users u_from ON tt.from_user_id = u_from.id
JOIN users u_to ON tt.to_user_id = u_to.id
WHERE tt.status IN ('PENDING', 'ACCEPTED');

-- View for validation history
CREATE VIEW v_validation_history AS
SELECT 
    tv.id,
    t.ticket_number,
    e.event_name,
    tv.validation_type,
    tv.validation_result,
    tv.validation_location,
    CONCAT(u.first_name, ' ', u.last_name) as validated_by,
    tv.confidence_score,
    tv.fraud_flags,
    tv.validated_at
FROM ticket_validations tv
JOIN tickets t ON tv.ticket_id = t.id
JOIN events e ON t.event_id = e.id
LEFT JOIN users u ON tv.validated_by_user_id = u.id
ORDER BY tv.validated_at DESC;

-- Comments for documentation
COMMENT ON TABLE tickets IS 'Individual tickets with ownership, validation, and NFT integration';
COMMENT ON TABLE ticket_transfers IS 'Complete history of ticket transfers between users';
COMMENT ON TABLE ticket_validations IS 'Entry validation logs and fraud detection records';
COMMENT ON TABLE ticket_ownership_history IS 'Complete ownership chain for each ticket';
COMMENT ON TABLE ticket_resale_listings IS 'Secondary market ticket listings and auctions';
COMMENT ON TABLE ticket_batch_operations IS 'Bulk operations on multiple tickets';

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_created ON tickets(tenant_id, created_at) WHERE tenant_id IS NOT NULL;

```

### Events Table
```sql
-- =====================================================
-- TicketToken Platform - Events Master Data Schema
-- Week 1, Day 3 Development
-- =====================================================
-- Description: Comprehensive event management with performer lineup and scheduling
-- Version: 1.0
-- Created: 2025-07-16 14:44:10
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For text search optimization

-- Create ENUM types for event management
CREATE TYPE event_category AS ENUM (
    'concert',              -- Music concerts and performances
    'sports',               -- Sports events and games
    'theater',              -- Theater and drama performances
    'conference',           -- Business conferences and conventions
    'comedy',               -- Comedy shows and stand-up
    'dance',                -- Dance performances and recitals
    'festival',             -- Music, food, and cultural festivals
    'exhibition',           -- Art exhibitions and galleries
    'workshop',             -- Educational workshops and seminars
    'networking',           -- Professional networking events
    'charity',              -- Charity galas and fundraisers
    'religious',            -- Religious services and ceremonies
    'family',               -- Family-friendly events
    'nightlife',            -- Nightclub and DJ events
    'food_drink',           -- Food and beverage events
    'wellness',             -- Health and wellness events
    'cultural',             -- Cultural and community events
    'educational',          -- Educational and academic events
    'corporate',            -- Corporate events and meetings
    'other'                 -- Other event types
);

CREATE TYPE event_status AS ENUM (
    'draft',                -- Event is in draft mode
    'pending_approval',     -- Event pending approval
    'approved',             -- Event approved but not published
    'published',            -- Event is live and tickets available
    'on_sale',              -- Tickets currently on sale
    'sold_out',             -- All tickets sold
    'paused',               -- Ticket sales paused
    'cancelled',            -- Event cancelled
    'postponed',            -- Event postponed
    'rescheduled',          -- Event rescheduled
    'completed',            -- Event has concluded
    'archived'              -- Event archived
);

CREATE TYPE age_restriction AS ENUM (
    'all_ages',             -- All ages welcome
    '13_plus',              -- 13 and older
    '16_plus',              -- 16 and older
    '18_plus',              -- 18 and older (adult)
    '21_plus',              -- 21 and older (alcohol)
    'family_friendly',      -- Specifically family-oriented
    'seniors_only',         -- Senior citizens only
    'children_only'         -- Children-specific event
);

CREATE TYPE content_rating AS ENUM (
    'g',                    -- General audiences
    'pg',                   -- Parental guidance suggested
    'pg13',                 -- Parents strongly cautioned
    'r',                    -- Restricted
    'nc17',                 -- Adults only
    'unrated',              -- Not rated
    'explicit'              -- Explicit content
);

CREATE TYPE performer_type AS ENUM (
    'headliner',            -- Main performer/artist
    'co_headliner',         -- Co-main performer
    'opening_act',          -- Opening/supporting act
    'special_guest',        -- Special guest performer
    'dj',                   -- DJ or electronic artist
    'mc_host',              -- Master of ceremonies/host
    'speaker',              -- Conference speaker/presenter
    'comedian',             -- Comedy performer
    'athlete',              -- Sports athlete/team
    'presenter',            -- Event presenter
    'moderator',            -- Panel moderator
    'other'                 -- Other performer type
);

-- =====================================================
-- EVENTS TABLE
-- =====================================================
-- Master events table with comprehensive event information
CREATE TABLE IF NOT EXISTS events (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL,                             -- Reference to venues.id
    
    -- Event identification
    event_name VARCHAR(300) NOT NULL,                   -- Event name/title
    event_slug VARCHAR(300) UNIQUE,                     -- URL-friendly slug
    short_description TEXT,                             -- Brief event description
    full_description TEXT,                              -- Detailed event description
    
    -- Event classification
    event_category event_category NOT NULL,             -- Primary event category
    event_subcategories VARCHAR(100)[],                 -- Additional subcategories
    event_tags VARCHAR(50)[],                           -- Searchable tags
    genre VARCHAR(100),                                 -- Music genre or event genre
    
    -- Event scheduling
    event_date DATE NOT NULL,                           -- Event date
    event_time TIME,                                    -- Event start time
    event_timezone VARCHAR(100) DEFAULT 'UTC',          -- Event timezone
    event_datetime TIMESTAMPTZ,                         -- Combined date/time with timezone
    
    -- Event timing details
    doors_open_time TIME,                               -- When doors open
    show_start_time TIME,                               -- When show/event starts
    estimated_duration INTERVAL,                       -- Expected event duration
    estimated_end_time TIME,                            -- Estimated end time
    
    -- Multiple session support
    has_multiple_sessions BOOLEAN NOT NULL DEFAULT FALSE, -- Event has multiple sessions
    session_count INTEGER DEFAULT 1,                    -- Number of sessions
    session_schedule JSONB DEFAULT '[]',                -- Session schedule details
    
    -- Event status and visibility
    event_status event_status NOT NULL DEFAULT 'draft',
    is_public BOOLEAN NOT NULL DEFAULT FALSE,           -- Event is visible to public
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,         -- Featured event
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,        -- Recurring event
    recurrence_pattern JSONB,                          -- Recurrence configuration
    
    -- Age restrictions and content
    age_restriction age_restriction DEFAULT 'all_ages',
    content_rating content_rating DEFAULT 'unrated',
    content_warnings TEXT[],                            -- Content warning tags
    accessibility_info TEXT,                            -- Accessibility information
    
    -- Capacity and ticketing
    expected_attendance INTEGER,                         -- Expected number of attendees
    max_capacity INTEGER,                               -- Maximum event capacity
    venue_layout_id UUID,                              -- Reference to venue_layouts.id
    seating_configuration VARCHAR(100),                 -- Seating configuration type
    
    -- Pricing and sales
    base_ticket_price DECIMAL(10, 2),                  -- Base ticket price
    price_range_min DECIMAL(10, 2),                    -- Minimum ticket price
    price_range_max DECIMAL(10, 2),                    -- Maximum ticket price
    ticket_sales_start TIMESTAMPTZ,                    -- When ticket sales begin
    ticket_sales_end TIMESTAMPTZ,                      -- When ticket sales end
    
    -- Event organizer information
    organizer_name VARCHAR(200),                        -- Event organizer name
    organizer_contact_email VARCHAR(320),              -- Organizer contact email
    organizer_contact_phone VARCHAR(20),               -- Organizer contact phone
    organizer_website TEXT,                            -- Organizer website
    
    -- Promotion and marketing
    promotional_text TEXT,                             -- Promotional description
    marketing_copy TEXT,                               -- Marketing copy for ads
    hashtags VARCHAR(50)[],                            -- Social media hashtags
    social_media_links JSONB DEFAULT '{}',             -- Social media links
    
    -- Event artwork and media
    primary_image_url TEXT,                            -- Main event image
    poster_image_url TEXT,                             -- Event poster image
    banner_image_url TEXT,                             -- Banner image for web
    gallery_images JSONB DEFAULT '[]',                 -- Image gallery URLs
    promotional_video_url TEXT,                        -- Promotional video URL
    
    -- Weather and outdoor considerations
    is_outdoor_event BOOLEAN NOT NULL DEFAULT FALSE,    -- Event is outdoors
    weather_dependent BOOLEAN NOT NULL DEFAULT FALSE,   -- Event depends on weather
    rain_policy TEXT,                                  -- Rain/weather policy
    weather_contingency_plan TEXT,                     -- Weather backup plan
    
    -- Special requirements and notes
    special_requirements TEXT,                          -- Special venue requirements
    production_notes TEXT,                             -- Production notes for staff
    catering_requirements TEXT,                         -- Catering needs
    technical_requirements TEXT,                        -- Technical setup needs
    security_requirements TEXT,                         -- Security considerations
    
    -- Performance and analytics
    total_tickets_sold INTEGER DEFAULT 0,              -- Total tickets sold
    gross_revenue DECIMAL(12, 2) DEFAULT 0,            -- Gross ticket revenue
    attendance_count INTEGER,                          -- Actual attendance
    no_show_count INTEGER DEFAULT 0,                   -- Number of no-shows
    
    -- Rating and feedback
    average_rating DECIMAL(3, 2),                      -- Average attendee rating
    total_reviews INTEGER DEFAULT 0,                   -- Total number of reviews
    would_recommend_percentage DECIMAL(5, 2),          -- Recommendation percentage
    
    -- Event logistics
    setup_start_time TIMESTAMPTZ,                      -- Setup start time
    breakdown_end_time TIMESTAMPTZ,                    -- Breakdown completion time
    load_in_instructions TEXT,                         -- Load-in instructions
    load_out_instructions TEXT,                        -- Load-out instructions
    
    -- Cancellation and refund policy
    cancellation_policy TEXT,                          -- Cancellation policy
    refund_policy TEXT,                                -- Refund policy
    force_majeure_policy TEXT,                         -- Force majeure policy
    last_cancellation_date DATE,                       -- Last date for cancellation
    
    -- External references
    external_event_id VARCHAR(100),                    -- External system event ID
    ticketing_system_id VARCHAR(100),                  -- External ticketing system ID
    third_party_urls JSONB DEFAULT '{}',               -- Third-party platform URLs
    
    -- SEO and metadata
    meta_title VARCHAR(200),                           -- SEO meta title
    meta_description TEXT,                             -- SEO meta description
    meta_keywords VARCHAR(500),                        -- SEO keywords
    structured_data JSONB,                             -- Schema.org structured data
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Event creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),      -- Last update timestamp
    created_by_user_id UUID,                           -- User who created event
    updated_by_user_id UUID,                           -- User who last updated event
    published_at TIMESTAMPTZ,                          -- Event publication timestamp
    published_by_user_id UUID,                         -- User who published event
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,                            -- Soft delete timestamp
    deleted_by_user_id UUID,                           -- User who deleted event
    deletion_reason TEXT,                              -- Reason for deletion
    
    -- Constraints
    CONSTRAINT events_valid_capacity CHECK (
        max_capacity IS NULL OR 
        expected_attendance IS NULL OR 
        expected_attendance <= max_capacity
    ),
    CONSTRAINT events_valid_price_range CHECK (
        price_range_min IS NULL OR 
        price_range_max IS NULL OR 
        price_range_min <= price_range_max
    ),
    CONSTRAINT events_valid_ticket_sales CHECK (
        ticket_sales_start IS NULL OR 
        ticket_sales_end IS NULL OR 
        ticket_sales_start <= ticket_sales_end
    ),
    CONSTRAINT events_valid_timing CHECK (
        doors_open_time IS NULL OR 
        show_start_time IS NULL OR 
        doors_open_time <= show_start_time
    ),
    CONSTRAINT events_valid_session_count CHECK (session_count > 0),
    CONSTRAINT events_valid_totals CHECK (
        total_tickets_sold >= 0 AND
        gross_revenue >= 0 AND
        (attendance_count IS NULL OR attendance_count >= 0) AND
        no_show_count >= 0 AND
        total_reviews >= 0
    ),
    CONSTRAINT events_valid_rating CHECK (
        average_rating IS NULL OR 
        (average_rating >= 0 AND average_rating <= 5)
    )
);

-- =====================================================
-- EVENT_PERFORMERS TABLE
-- =====================================================
-- Track performers, artists, and lineup for events
CREATE TABLE IF NOT EXISTS event_performers (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Event association
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Performer identification
    performer_name VARCHAR(200) NOT NULL,               -- Performer/artist name
    performer_type performer_type NOT NULL,             -- Type of performer
    stage_name VARCHAR(200),                            -- Stage/performance name
    
    -- Performer details
    performer_description TEXT,                         -- Performer bio/description
    performer_genre VARCHAR(100),                       -- Musical/performance genre
    performer_website TEXT,                            -- Performer website
    performer_social_media JSONB DEFAULT '{}',         -- Social media links
    
    -- Performance scheduling
    performance_order INTEGER NOT NULL DEFAULT 1,       -- Order in lineup (1 = first)
    set_duration INTERVAL,                              -- Performance set duration
    scheduled_start_time TIME,                          -- Scheduled start time
    scheduled_end_time TIME,                            -- Scheduled end time
    
    -- Performance details
    song_list TEXT[],                                   -- Song list/setlist
    special_notes TEXT,                                 -- Special performance notes
    technical_rider_url TEXT,                          -- Technical rider document
    hospitality_rider_url TEXT,                        -- Hospitality rider document
    
    -- Performer media
    performer_image_url TEXT,                           -- Performer photo
    promotional_images JSONB DEFAULT '[]',             -- Additional promo images
    
    -- Performance status
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,           -- Performance confirmed
    featured BOOLEAN NOT NULL DEFAULT FALSE,            -- Featured performer
    headliner BOOLEAN NOT NULL DEFAULT FALSE,           -- Is headlining act
    
    -- Financial information
    performance_fee DECIMAL(10, 2),                    -- Performance fee
    expense_budget DECIMAL(10, 2),                     -- Expense budget
    payment_terms TEXT,                                -- Payment terms
    contract_signed BOOLEAN NOT NULL DEFAULT FALSE,     -- Contract executed
    
    -- Contact information
    contact_name VARCHAR(200),                          -- Primary contact name
    contact_email VARCHAR(320),                        -- Contact email
    contact_phone VARCHAR(20),                          -- Contact phone
    agent_name VARCHAR(200),                           -- Agent/manager name
    agent_contact VARCHAR(320),                        -- Agent contact info
    
    -- Performance requirements
    equipment_requirements TEXT,                        -- Equipment needs
    backstage_requirements TEXT,                        -- Backstage needs
    catering_requirements TEXT,                         -- Catering requirements
    transportation_needs TEXT,                          -- Transportation needs
    accommodation_needs TEXT,                           -- Hotel/accommodation needs
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT event_performers_valid_order CHECK (performance_order > 0),
    CONSTRAINT event_performers_valid_fees CHECK (
        (performance_fee IS NULL OR performance_fee >= 0) AND
        (expense_budget IS NULL OR expense_budget >= 0)
    ),
    CONSTRAINT event_performers_valid_times CHECK (
        scheduled_end_time IS NULL OR 
        scheduled_start_time IS NULL OR 
        scheduled_end_time > scheduled_start_time
    )
);

-- =====================================================
-- EVENT_SESSIONS TABLE
-- =====================================================
-- Support for multi-session events (conferences, festivals, etc.)
CREATE TABLE IF NOT EXISTS event_sessions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Event association
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Session identification
    session_name VARCHAR(200) NOT NULL,                 -- Session name/title
    session_description TEXT,                           -- Session description
    session_type VARCHAR(100),                          -- Session type
    session_track VARCHAR(100),                         -- Session track/category
    
    -- Session scheduling
    session_date DATE NOT NULL,                         -- Session date
    start_time TIME NOT NULL,                           -- Session start time
    end_time TIME NOT NULL,                             -- Session end time
    duration INTERVAL,                                  -- Session duration
    
    -- Session location
    room_name VARCHAR(100),                             -- Room/stage name
    room_capacity INTEGER,                              -- Room capacity
    room_location TEXT,                                 -- Room location details
    
    -- Session content
    learning_objectives TEXT[],                         -- Learning objectives
    session_materials JSONB DEFAULT '[]',              -- Session materials/links
    presentation_url TEXT,                              -- Presentation slides URL
    recording_url TEXT,                                 -- Session recording URL
    
    -- Session requirements
    equipment_needed TEXT[],                            -- Required equipment
    special_setup TEXT,                                 -- Special setup requirements
    accessibility_notes TEXT,                           -- Accessibility information
    
    -- Session status
    is_keynote BOOLEAN NOT NULL DEFAULT FALSE,          -- Keynote session
    requires_registration BOOLEAN NOT NULL DEFAULT FALSE, -- Separate registration
    max_attendees INTEGER,                              -- Maximum attendees
    current_registrations INTEGER DEFAULT 0,            -- Current registrations
    
    -- Session rating
    average_rating DECIMAL(3, 2),                      -- Session rating
    total_ratings INTEGER DEFAULT 0,                   -- Number of ratings
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT event_sessions_valid_times CHECK (end_time > start_time),
    CONSTRAINT event_sessions_valid_capacity CHECK (
        room_capacity IS NULL OR room_capacity > 0
    ),
    CONSTRAINT event_sessions_valid_registrations CHECK (
        current_registrations >= 0 AND
        (max_attendees IS NULL OR current_registrations <= max_attendees)
    ),
    CONSTRAINT event_sessions_valid_rating CHECK (
        average_rating IS NULL OR 
        (average_rating >= 0 AND average_rating <= 5)
    )
);

-- =====================================================
-- EVENT_PRODUCTION_SCHEDULES TABLE
-- =====================================================
-- Track production schedules and crew assignments
CREATE TABLE IF NOT EXISTS event_production_schedules (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Event association
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    
    -- Schedule identification
    schedule_name VARCHAR(200) NOT NULL,                -- Schedule item name
    schedule_type VARCHAR(100) NOT NULL,                -- Schedule type
    schedule_description TEXT,                          -- Schedule description
    
    -- Timing
    scheduled_date DATE NOT NULL,                       -- Schedule date
    start_time TIME NOT NULL,                           -- Start time
    end_time TIME,                                      -- End time
    estimated_duration INTERVAL,                       -- Estimated duration
    
    -- Assignment
    assigned_to VARCHAR(200),                           -- Assigned person/team
    crew_required INTEGER,                              -- Number of crew needed
    equipment_needed TEXT[],                            -- Required equipment
    
    -- Status and notes
    is_critical BOOLEAN NOT NULL DEFAULT FALSE,         -- Critical timeline item
    completion_status VARCHAR(50) DEFAULT 'pending',    -- Completion status
    notes TEXT,                                         -- Additional notes
    
    -- Dependencies
    depends_on UUID[],                                  -- Dependent schedule items
    blocks UUID[],                                      -- Items this blocks
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    
    -- Constraints
    CONSTRAINT event_production_valid_times CHECK (
        end_time IS NULL OR end_time > start_time
    ),
    CONSTRAINT event_production_valid_crew CHECK (crew_required IS NULL OR crew_required >= 0)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes for events
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);
CREATE INDEX IF NOT EXISTS idx_events_category ON events(event_category);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(event_status);
CREATE INDEX IF NOT EXISTS idx_events_slug ON events(event_slug) WHERE deleted_at IS NULL;

-- Event date and time indexes
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_datetime ON events(event_datetime) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_upcoming ON events(event_date, event_status) 
    WHERE event_date >= CURRENT_DATE AND deleted_at IS NULL;

-- Event visibility and features
CREATE INDEX IF NOT EXISTS idx_events_public ON events(is_public, event_status) WHERE is_public = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_featured ON events(is_featured, event_date) WHERE is_featured = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_published ON events(published_at) WHERE published_at IS NOT NULL;

-- Ticket sales indexes
CREATE INDEX IF NOT EXISTS idx_events_ticket_sales ON events(ticket_sales_start, ticket_sales_end) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_on_sale ON events(venue_id, event_status, ticket_sales_start, ticket_sales_end) 
    WHERE event_status = 'on_sale' AND deleted_at IS NULL;

-- Search and filtering indexes
CREATE INDEX IF NOT EXISTS idx_events_tags ON events USING gin(event_tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_subcategories ON events USING gin(event_subcategories) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_genre ON events(genre) WHERE genre IS NOT NULL AND deleted_at IS NULL;

-- Age and content indexes
CREATE INDEX IF NOT EXISTS idx_events_age_restriction ON events(age_restriction) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_content_rating ON events(content_rating) WHERE deleted_at IS NULL;

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_events_attendance ON events(attendance_count) WHERE attendance_count IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_revenue ON events(gross_revenue) WHERE gross_revenue > 0;
CREATE INDEX IF NOT EXISTS idx_events_rating ON events(average_rating) WHERE average_rating IS NOT NULL;

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_events_search ON events USING gin(
    to_tsvector('english', event_name || ' ' || COALESCE(short_description, '') || ' ' || COALESCE(organizer_name, ''))
) WHERE deleted_at IS NULL;

-- Event performers indexes
CREATE INDEX IF NOT EXISTS idx_event_performers_event_id ON event_performers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_performers_type ON event_performers(performer_type);
CREATE INDEX IF NOT EXISTS idx_event_performers_order ON event_performers(event_id, performance_order);
CREATE INDEX IF NOT EXISTS idx_event_performers_featured ON event_performers(featured) WHERE featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_event_performers_headliner ON event_performers(headliner) WHERE headliner = TRUE;

-- Event sessions indexes
CREATE INDEX IF NOT EXISTS idx_event_sessions_event_id ON event_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_sessions_date ON event_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_event_sessions_time ON event_sessions(session_date, start_time);
CREATE INDEX IF NOT EXISTS idx_event_sessions_track ON event_sessions(session_track) WHERE session_track IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_sessions_keynote ON event_sessions(is_keynote) WHERE is_keynote = TRUE;

-- Production schedule indexes
CREATE INDEX IF NOT EXISTS idx_event_production_event_id ON event_production_schedules(event_id);
CREATE INDEX IF NOT EXISTS idx_event_production_date ON event_production_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_event_production_critical ON event_production_schedules(is_critical) WHERE is_critical = TRUE;
CREATE INDEX IF NOT EXISTS idx_event_production_status ON event_production_schedules(completion_status);

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC PROCESSING
-- =====================================================

-- Function to update event metadata
CREATE OR REPLACE FUNCTION update_event_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Auto-generate slug if not provided
    IF NEW.event_slug IS NULL OR NEW.event_slug = '' THEN
        NEW.event_slug = lower(regexp_replace(NEW.event_name, '[^a-zA-Z0-9]+', '-', 'g'));
        NEW.event_slug = trim(NEW.event_slug, '-');
        
        -- Ensure uniqueness
        WHILE EXISTS (SELECT 1 FROM events WHERE event_slug = NEW.event_slug AND id != NEW.id) LOOP
            NEW.event_slug = NEW.event_slug || '-' || floor(random() * 1000)::text;
        END LOOP;
    END IF;
    
    -- Combine date and time into datetime
    IF NEW.event_date IS NOT NULL AND NEW.event_time IS NOT NULL THEN
        NEW.event_datetime = (NEW.event_date || ' ' || NEW.event_time)::TIMESTAMP AT TIME ZONE COALESCE(NEW.event_timezone, 'UTC');
    END IF;
    
    -- Calculate estimated end time
    IF NEW.show_start_time IS NOT NULL AND NEW.estimated_duration IS NOT NULL THEN
        NEW.estimated_end_time = NEW.show_start_time + NEW.estimated_duration;
    END IF;
    
    -- Set publication timestamp
    IF OLD.event_status != 'published' AND NEW.event_status = 'published' AND NEW.published_at IS NULL THEN
        NEW.published_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to update performer order
CREATE OR REPLACE FUNCTION update_performer_order()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Set headliner flag based on performer type
    IF NEW.performer_type = 'headliner' THEN
        NEW.headliner = TRUE;
        NEW.featured = TRUE;
    ELSIF NEW.performer_type IN ('co_headliner', 'special_guest') THEN
        NEW.featured = TRUE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate session duration
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    
    -- Calculate duration from start and end times
    IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
        NEW.duration = NEW.end_time - NEW.start_time;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic processing
DROP TRIGGER IF EXISTS trigger_event_metadata_update ON events;
CREATE TRIGGER trigger_event_metadata_update
    BEFORE INSERT OR UPDATE ON events
    FOR EACH ROW
    EXECUTE FUNCTION update_event_metadata();

DROP TRIGGER IF EXISTS trigger_performer_order_update ON event_performers;
CREATE TRIGGER trigger_performer_order_update
    BEFORE INSERT OR UPDATE ON event_performers
    FOR EACH ROW
    EXECUTE FUNCTION update_performer_order();

DROP TRIGGER IF EXISTS trigger_session_duration_calculation ON event_sessions;
CREATE TRIGGER trigger_session_duration_calculation
    BEFORE INSERT OR UPDATE ON event_sessions
    FOR EACH ROW
    EXECUTE FUNCTION calculate_session_duration();

-- =====================================================
-- EVENT MANAGEMENT HELPER FUNCTIONS
-- =====================================================

-- Function to create a new event
CREATE OR REPLACE FUNCTION create_event(
    p_venue_id UUID,
    p_event_name VARCHAR(300),
    p_event_category event_category,
    p_event_date DATE,
    p_event_time TIME DEFAULT NULL,
    p_short_description TEXT DEFAULT NULL,
    p_organizer_name VARCHAR(200) DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_event_id UUID;
BEGIN
    INSERT INTO events (
        venue_id, event_name, event_category, event_date, event_time,
        short_description, organizer_name, created_by_user_id
    )
    VALUES (
        p_venue_id, p_event_name, p_event_category, p_event_date, p_event_time,
        p_short_description, p_organizer_name, p_created_by_user_id
    )
    RETURNING id INTO new_event_id;
    
    RETURN new_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add performer to event
CREATE OR REPLACE FUNCTION add_event_performer(
    p_event_id UUID,
    p_performer_name VARCHAR(200),
    p_performer_type performer_type,
    p_performance_order INTEGER DEFAULT NULL,
    p_performance_fee DECIMAL(10, 2) DEFAULT NULL,
    p_set_duration INTERVAL DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_performer_id UUID;
    next_order INTEGER;
BEGIN
    -- Calculate next performance order if not provided
    IF p_performance_order IS NULL THEN
        SELECT COALESCE(MAX(performance_order), 0) + 1 INTO next_order
        FROM event_performers
        WHERE event_id = p_event_id;
    ELSE
        next_order = p_performance_order;
    END IF;
    
    INSERT INTO event_performers (
        event_id, performer_name, performer_type, performance_order,
        performance_fee, set_duration, created_by_user_id
    )
    VALUES (
        p_event_id, p_performer_name, p_performer_type, next_order,
        p_performance_fee, p_set_duration, p_created_by_user_id
    )
    RETURNING id INTO new_performer_id;
    
    RETURN new_performer_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get upcoming events
CREATE OR REPLACE FUNCTION get_upcoming_events(
    p_venue_id UUID DEFAULT NULL,
    p_category event_category DEFAULT NULL,
    p_days_ahead INTEGER DEFAULT 30,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR(300),
    event_category event_category,
    event_date DATE,
    event_time TIME,
    venue_id UUID,
    event_status event_status,
    total_tickets_sold INTEGER,
    headliner_name VARCHAR(200)
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.event_name, e.event_category, e.event_date, e.event_time,
           e.venue_id, e.event_status, e.total_tickets_sold,
           ep.performer_name as headliner_name
    FROM events e
    LEFT JOIN event_performers ep ON e.id = ep.event_id AND ep.headliner = TRUE
    WHERE e.deleted_at IS NULL
    AND e.event_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day' * p_days_ahead
    AND (p_venue_id IS NULL OR e.venue_id = p_venue_id)
    AND (p_category IS NULL OR e.event_category = p_category)
    AND e.event_status IN ('published', 'on_sale', 'sold_out')
    ORDER BY e.event_date, e.event_time
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search events
CREATE OR REPLACE FUNCTION search_events(
    p_search_text TEXT,
    p_venue_id UUID DEFAULT NULL,
    p_category event_category DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date DATE DEFAULT NULL,
    p_age_restriction age_restriction DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR(300),
    event_slug VARCHAR(300),
    event_category event_category,
    event_date DATE,
    event_time TIME,
    venue_id UUID,
    short_description TEXT,
    primary_image_url TEXT,
    price_range_min DECIMAL(10, 2),
    price_range_max DECIMAL(10, 2),
    relevance_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.event_name, e.event_slug, e.event_category, e.event_date, e.event_time,
           e.venue_id, e.short_description, e.primary_image_url, e.price_range_min, e.price_range_max,
           ts_rank(to_tsvector('english', e.event_name || ' ' || COALESCE(e.short_description, '') || ' ' || COALESCE(e.organizer_name, '')), 
                   plainto_tsquery('english', p_search_text)) as relevance_score
    FROM events e
    WHERE e.deleted_at IS NULL
    AND e.is_public = TRUE
    AND e.event_status IN ('published', 'on_sale', 'sold_out')
    AND to_tsvector('english', e.event_name || ' ' || COALESCE(e.short_description, '') || ' ' || COALESCE(e.organizer_name, '')) 
        @@ plainto_tsquery('english', p_search_text)
    AND (p_venue_id IS NULL OR e.venue_id = p_venue_id)
    AND (p_category IS NULL OR e.event_category = p_category)
    AND e.event_date >= p_start_date
    AND (p_end_date IS NULL OR e.event_date <= p_end_date)
    AND (p_age_restriction IS NULL OR e.age_restriction = p_age_restriction)
    ORDER BY relevance_score DESC, e.event_date
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get event details with performers
CREATE OR REPLACE FUNCTION get_event_details(p_event_id UUID)
RETURNS TABLE(
    event_id UUID,
    event_name VARCHAR(300),
    event_category event_category,
    event_date DATE,
    event_time TIME,
    venue_id UUID,
    full_description TEXT,
    event_status event_status,
    age_restriction age_restriction,
    price_range_min DECIMAL(10, 2),
    price_range_max DECIMAL(10, 2),
    performers JSONB,
    sessions JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT e.id, e.event_name, e.event_category, e.event_date, e.event_time,
           e.venue_id, e.full_description, e.event_status, e.age_restriction,
           e.price_range_min, e.price_range_max,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'performer_name', ep.performer_name,
                       'performer_type', ep.performer_type,
                       'performance_order', ep.performance_order,
                       'headliner', ep.headliner,
                       'set_duration', ep.set_duration
                   ) ORDER BY ep.performance_order
               ) FROM event_performers ep WHERE ep.event_id = e.id),
               '[]'::jsonb
           ) as performers,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'session_name', es.session_name,
                       'session_date', es.session_date,
                       'start_time', es.start_time,
                       'end_time', es.end_time,
                       'room_name', es.room_name
                   ) ORDER BY es.session_date, es.start_time
               ) FROM event_sessions es WHERE es.event_id = e.id),
               '[]'::jsonb
           ) as sessions
    FROM events e
    WHERE e.id = p_event_id
    AND e.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to update event status
CREATE OR REPLACE FUNCTION update_event_status(
    p_event_id UUID,
    p_new_status event_status,
    p_updated_by_user_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE events
    SET event_status = p_new_status,
        updated_by_user_id = p_updated_by_user_id,
        updated_at = NOW(),
        published_at = CASE WHEN p_new_status = 'published' AND published_at IS NULL THEN NOW() ELSE published_at END,
        published_by_user_id = CASE WHEN p_new_status = 'published' AND published_by_user_id IS NULL THEN p_updated_by_user_id ELSE published_by_user_id END
    WHERE id = p_event_id
    AND deleted_at IS NULL;
    
    -- Log status change if audit function exists
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_audit_event') THEN
        PERFORM log_audit_event(
            p_updated_by_user_id,
            'event_management'::audit_category,
            'update'::audit_action,
            'event',
            p_event_id::text,
            NULL,
            'Event status changed to ' || p_new_status::text,
            NULL,
            jsonb_build_object('new_status', p_new_status, 'reason', p_reason),
            'info'::audit_severity
        );
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to get event statistics
CREATE OR REPLACE FUNCTION get_event_statistics(
    p_venue_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(
    total_events BIGINT,
    completed_events BIGINT,
    cancelled_events BIGINT,
    total_attendance BIGINT,
    total_revenue DECIMAL(12, 2),
    average_rating DECIMAL(3, 2),
    events_by_category JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE event_status = 'completed') as completed_events,
        COUNT(*) FILTER (WHERE event_status = 'cancelled') as cancelled_events,
        COALESCE(SUM(attendance_count), 0) as total_attendance,
        COALESCE(SUM(gross_revenue), 0) as total_revenue,
        AVG(average_rating) as average_rating,
        (SELECT jsonb_object_agg(event_category, cnt) 
         FROM (SELECT event_category, COUNT(*) as cnt 
               FROM events 
               WHERE deleted_at IS NULL 
               AND (p_venue_id IS NULL OR venue_id = p_venue_id)
               AND event_date BETWEEN p_start_date AND p_end_date
               GROUP BY event_category) t) as events_by_category
    FROM events
    WHERE deleted_at IS NULL
    AND (p_venue_id IS NULL OR venue_id = p_venue_id)
    AND event_date BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to duplicate event (for recurring events)
CREATE OR REPLACE FUNCTION duplicate_event(
    p_source_event_id UUID,
    p_new_event_date DATE,
    p_new_event_time TIME DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_event_id UUID;
    source_event RECORD;
    performer_record RECORD;
    session_record RECORD;
BEGIN
    -- Get source event details
    SELECT * INTO source_event FROM events WHERE id = p_source_event_id;
    
    -- Create new event
    INSERT INTO events (
        venue_id, event_name, event_category, event_date, event_time,
        short_description, full_description, event_subcategories, event_tags,
        genre, doors_open_time, show_start_time, estimated_duration,
        age_restriction, content_rating, content_warnings, accessibility_info,
        expected_attendance, max_capacity, venue_layout_id, seating_configuration,
        base_ticket_price, price_range_min, price_range_max,
        organizer_name, organizer_contact_email, organizer_contact_phone,
        promotional_text, marketing_copy, hashtags, social_media_links,
        primary_image_url, poster_image_url, banner_image_url,
        is_outdoor_event, weather_dependent, rain_policy,
        special_requirements, production_notes, catering_requirements,
        technical_requirements, security_requirements,
        cancellation_policy, refund_policy, force_majeure_policy,
        meta_title, meta_description, meta_keywords,
        created_by_user_id
    )
    SELECT 
        venue_id, event_name || ' - ' || p_new_event_date, event_category, 
        p_new_event_date, COALESCE(p_new_event_time, event_time),
        short_description, full_description, event_subcategories, event_tags,
        genre, doors_open_time, show_start_time, estimated_duration,
        age_restriction, content_rating, content_warnings, accessibility_info,
        expected_attendance, max_capacity, venue_layout_id, seating_configuration,
        base_ticket_price, price_range_min, price_range_max,
        organizer_name, organizer_contact_email, organizer_contact_phone,
        promotional_text, marketing_copy, hashtags, social_media_links,
        primary_image_url, poster_image_url, banner_image_url,
        is_outdoor_event, weather_dependent, rain_policy,
        special_requirements, production_notes, catering_requirements,
        technical_requirements, security_requirements,
        cancellation_policy, refund_policy, force_majeure_policy,
        meta_title, meta_description, meta_keywords,
        p_created_by_user_id
    FROM events
    WHERE id = p_source_event_id
    RETURNING id INTO new_event_id;
    
    -- Copy performers
    FOR performer_record IN
        SELECT * FROM event_performers WHERE event_id = p_source_event_id
    LOOP
        INSERT INTO event_performers (
            event_id, performer_name, performer_type, stage_name,
            performer_description, performer_genre, performance_order,
            set_duration, performance_fee, contact_name, contact_email,
            equipment_requirements, backstage_requirements,
            created_by_user_id
        )
        VALUES (
            new_event_id, performer_record.performer_name, performer_record.performer_type,
            performer_record.stage_name, performer_record.performer_description,
            performer_record.performer_genre, performer_record.performance_order,
            performer_record.set_duration, performer_record.performance_fee,
            performer_record.contact_name, performer_record.contact_email,
            performer_record.equipment_requirements, performer_record.backstage_requirements,
            p_created_by_user_id
        );
    END LOOP;
    
    -- Copy sessions (update session date to match new event date)
    FOR session_record IN
        SELECT * FROM event_sessions WHERE event_id = p_source_event_id
    LOOP
        INSERT INTO event_sessions (
            event_id, session_name, session_description, session_type,
            session_track, session_date, start_time, end_time,
            room_name, room_capacity, learning_objectives,
            equipment_needed, special_setup, max_attendees,
            created_by_user_id
        )
        VALUES (
            new_event_id, session_record.session_name, session_record.session_description,
            session_record.session_type, session_record.session_track,
            p_new_event_date, session_record.start_time, session_record.end_time,
            session_record.room_name, session_record.room_capacity,
            session_record.learning_objectives, session_record.equipment_needed,
            session_record.special_setup, session_record.max_attendees,
            p_created_by_user_id
        );
    END LOOP;
    
    RETURN new_event_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE events IS 'Master events table with comprehensive event information and scheduling';
COMMENT ON TABLE event_performers IS 'Event performer and artist lineup management with contract details';
COMMENT ON TABLE event_sessions IS 'Multi-session event support for conferences, festivals, and workshops';
COMMENT ON TABLE event_production_schedules IS 'Production timeline and crew scheduling for events';

-- Events table comments
COMMENT ON COLUMN events.event_slug IS 'URL-friendly identifier: auto-generated from event name for web URLs';
COMMENT ON COLUMN events.event_datetime IS 'Combined timestamp: event date and time with timezone support';
COMMENT ON COLUMN events.venue_layout_id IS 'Layout reference: specific venue layout configuration for this event';
COMMENT ON COLUMN events.recurrence_pattern IS 'Recurrence rules: JSON configuration for recurring events';
COMMENT ON COLUMN events.content_warnings IS 'Content warnings: array of warning tags for sensitive content';
COMMENT ON COLUMN events.structured_data IS 'SEO metadata: Schema.org structured data for search engines';

-- Event performers table comments
COMMENT ON COLUMN event_performers.performance_order IS 'Lineup order: performance sequence (1 = first, higher = later)';
COMMENT ON COLUMN event_performers.technical_rider_url IS 'Technical requirements: link to technical rider document';
COMMENT ON COLUMN event_performers.hospitality_rider_url IS 'Hospitality requirements: link to hospitality rider document';
COMMENT ON COLUMN event_performers.contract_signed IS 'Contract status: whether performance contract is executed';

-- Event sessions table comments
COMMENT ON COLUMN event_sessions.session_track IS 'Session grouping: thematic track or category for conferences';
COMMENT ON COLUMN event_sessions.learning_objectives IS 'Educational goals: array of learning outcomes for session';
COMMENT ON COLUMN event_sessions.requires_registration IS 'Registration required: separate registration beyond event ticket';

-- =====================================================
-- EVENTS SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive event management system with:
-- - 20 event categories covering all major event types
-- - Multi-performer lineup management with contract tracking
-- - Multi-session support for conferences and festivals
-- - Production scheduling and crew management
-- - Timezone-aware scheduling with flexible timing
-- - Comprehensive content classification and age restrictions
-- - Marketing and promotional content management
-- - Advanced search and filtering capabilities
-- - Event duplication for recurring events
-- - Performance analytics and reporting
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_events_tenant_id ON events(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_tenant_created ON events(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
```

### Venues Table
```sql
-- =====================================================
-- TicketToken Platform - Venues Master Data Schema
-- Week 1, Day 2 Development
-- =====================================================
-- Description: Comprehensive venue management with master data
-- Version: 1.0
-- Created: 2025-07-16 14:19:37
-- =====================================================

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "postgis";      -- For geographic data (optional)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- For text search optimization

-- Create ENUM types for venue management
CREATE TYPE venue_type AS ENUM (
    'concert_hall',         -- Traditional concert halls
    'stadium',              -- Large sports stadiums
    'arena',                -- Indoor arenas
    'theater',              -- Theaters and playhouses
    'club',                 -- Nightclubs and entertainment venues
    'outdoor',              -- Outdoor venues and festivals
    'convention_center',    -- Convention and conference centers
    'auditorium',          -- Auditoriums and lecture halls
    'amphitheater',        -- Outdoor amphitheaters
    'pavilion',            -- Covered outdoor venues
    'ballroom',            -- Hotel ballrooms and event spaces
    'warehouse',           -- Converted warehouse spaces
    'rooftop',             -- Rooftop venues
    'restaurant',          -- Restaurant event spaces
    'bar',                 -- Bar and pub venues
    'other'                -- Other venue types
);

CREATE TYPE venue_status AS ENUM (
    'active',              -- Venue is active and available
    'inactive',            -- Venue is temporarily inactive
    'pending_approval',    -- Venue awaiting approval
    'suspended',           -- Venue is suspended
    'closed',              -- Venue is permanently closed
    'under_construction',  -- Venue under construction/renovation
    'maintenance'          -- Venue under maintenance
);

CREATE TYPE verification_status AS ENUM (
    'pending',             -- Verification pending
    'verified',            -- Fully verified
    'rejected',            -- Verification rejected
    'incomplete',          -- Missing required documents
    'expired'              -- Verification expired
);

CREATE TYPE ownership_type AS ENUM (
    'owner',               -- Venue owner
    'lessee',              -- Venue lessee/renter
    'manager',             -- Venue manager
    'partner'              -- Business partner
);

-- =====================================================
-- VENUES TABLE
-- =====================================================
-- Master venues table with comprehensive venue information
CREATE TABLE IF NOT EXISTS venues (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Basic venue information
    venue_name VARCHAR(200) NOT NULL,                   -- Official venue name
    venue_slug VARCHAR(200) UNIQUE,                     -- URL-friendly slug
    display_name VARCHAR(200),                          -- Display name (may differ from official)
    short_description TEXT,                             -- Brief venue description
    full_description TEXT,                              -- Detailed venue description
    
    -- Venue classification
    venue_type venue_type NOT NULL,                     -- Primary venue type
    venue_subtypes VARCHAR(100)[],                      -- Additional venue classifications
    venue_tags VARCHAR(50)[],                           -- Searchable tags
    
    -- Address and location
    address_line_1 VARCHAR(255) NOT NULL,               -- Primary address
    address_line_2 VARCHAR(255),                        -- Secondary address (suite, floor, etc.)
    city VARCHAR(100) NOT NULL,                         -- City
    state_province VARCHAR(100),                        -- State or province
    postal_code VARCHAR(20),                            -- ZIP/postal code
    country_code CHAR(2) NOT NULL DEFAULT 'US',         -- ISO country code
    
    -- Geographic coordinates
    latitude DECIMAL(10, 8),                            -- Latitude coordinate
    longitude DECIMAL(11, 8),                           -- Longitude coordinate
    timezone VARCHAR(100),                              -- Venue timezone
    
    -- Contact information
    primary_phone VARCHAR(20),                          -- Primary phone number
    secondary_phone VARCHAR(20),                        -- Secondary phone number
    primary_email VARCHAR(320),                         -- Primary email
    website_url TEXT,                                   -- Official website
    social_media_links JSONB DEFAULT '{}',              -- Social media profiles
    
    -- Capacity information
    total_capacity INTEGER,                             -- Maximum total capacity
    seated_capacity INTEGER,                            -- Maximum seated capacity
    standing_capacity INTEGER,                          -- Maximum standing capacity
    vip_capacity INTEGER,                               -- VIP/premium capacity
    accessible_capacity INTEGER,                        -- ADA accessible capacity
    capacity_notes TEXT,                                -- Additional capacity information
    
    -- Venue features and amenities
    has_parking BOOLEAN NOT NULL DEFAULT FALSE,         -- Parking available
    parking_capacity INTEGER,                           -- Number of parking spaces
    parking_cost DECIMAL(10, 2),                       -- Parking cost
    has_public_transport BOOLEAN NOT NULL DEFAULT FALSE, -- Public transport access
    has_vip_areas BOOLEAN NOT NULL DEFAULT FALSE,       -- VIP areas available
    has_concessions BOOLEAN NOT NULL DEFAULT FALSE,     -- Food/drink concessions
    has_merchandise BOOLEAN NOT NULL DEFAULT FALSE,     -- Merchandise sales
    has_coat_check BOOLEAN NOT NULL DEFAULT FALSE,      -- Coat check service
    has_wifi BOOLEAN NOT NULL DEFAULT FALSE,            -- WiFi available
    has_live_streaming BOOLEAN NOT NULL DEFAULT FALSE,  -- Live streaming capabilities
    accessibility_features TEXT[],                      -- ADA accessibility features
    amenities JSONB DEFAULT '{}',                      -- Additional amenities
    
    -- Venue status and verification
    venue_status venue_status NOT NULL DEFAULT 'pending_approval',
    verification_status verification_status NOT NULL DEFAULT 'pending',
    verified_at TIMESTAMPTZ,                           -- Verification timestamp
    verified_by_user_id UUID,                          -- Admin who verified venue
    
    -- Business and legal information
    business_name VARCHAR(200),                         -- Legal business name
    business_license_number VARCHAR(100),              -- Business license number
    tax_id VARCHAR(50),                                -- Tax identification number
    insurance_policy_number VARCHAR(100),              -- Insurance policy number
    liquor_license_number VARCHAR(100),                -- Liquor license (if applicable)
    fire_department_approval VARCHAR(100),             -- Fire department certificate
    health_department_approval VARCHAR(100),           -- Health department certificate
    
    -- Owner/manager information
    owner_user_id UUID,                                -- Reference to users.id (venue owner)
    manager_user_id UUID,                              -- Reference to users.id (venue manager)
    ownership_type ownership_type DEFAULT 'owner',     -- Type of ownership relationship
    
    -- Contact person information
    contact_person_name VARCHAR(200),                  -- Primary contact name
    contact_person_title VARCHAR(100),                 -- Contact person title
    contact_person_phone VARCHAR(20),                  -- Contact person phone
    contact_person_email VARCHAR(320),                 -- Contact person email
    
    -- Financial information
    commission_rate DECIMAL(5, 4) DEFAULT 0.0500,      -- Platform commission rate (5% default)
    payment_terms INTEGER DEFAULT 30,                  -- Payment terms in days
    preferred_payment_method VARCHAR(50),              -- Preferred payment method
    bank_account_info JSONB,                          -- Encrypted bank account information
    
    -- Venue settings and preferences
    allows_resale BOOLEAN NOT NULL DEFAULT TRUE,       -- Allow ticket resale
    requires_id_verification BOOLEAN NOT NULL DEFAULT FALSE, -- Require ID at entry
    minimum_age INTEGER,                               -- Minimum age requirement
    dress_code VARCHAR(200),                           -- Dress code requirements
    prohibited_items TEXT[],                           -- List of prohibited items
    venue_rules TEXT,                                  -- Venue-specific rules
    
    -- Media and branding
    logo_url TEXT,                                     -- Venue logo URL
    cover_image_url TEXT,                              -- Cover image URL
    gallery_images JSONB DEFAULT '[]',                -- Image gallery URLs
    virtual_tour_url TEXT,                             -- Virtual tour URL
    
    -- Technical specifications
    stage_dimensions VARCHAR(100),                      -- Stage size (e.g., "40x60 feet")
    ceiling_height VARCHAR(50),                        -- Ceiling height
    sound_system_specs JSONB,                          -- Sound system specifications
    lighting_system_specs JSONB,                       -- Lighting system specifications
    power_specifications JSONB,                        -- Electrical specifications
    
    -- Operational information
    typical_setup_time INTERVAL,                       -- Typical event setup time
    typical_breakdown_time INTERVAL,                   -- Typical event breakdown time
    advance_booking_days INTEGER DEFAULT 90,           -- How far in advance bookings allowed
    cancellation_policy TEXT,                          -- Cancellation policy
    force_majeure_policy TEXT,                         -- Force majeure policy
    
    -- Analytics and performance
    total_events_hosted INTEGER NOT NULL DEFAULT 0,    -- Total events hosted
    total_tickets_sold BIGINT NOT NULL DEFAULT 0,      -- Total tickets sold
    average_rating DECIMAL(3, 2),                      -- Average user rating
    total_reviews INTEGER NOT NULL DEFAULT 0,          -- Total number of reviews
    
    -- Audit and metadata fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- Record creation timestamp
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),     -- Last update timestamp
    created_by_user_id UUID,                          -- User who created record
    updated_by_user_id UUID,                          -- User who last updated record
    
    -- Soft delete support
    deleted_at TIMESTAMPTZ,                           -- Soft delete timestamp
    deleted_by_user_id UUID,                          -- User who deleted record
    deletion_reason TEXT,                             -- Reason for deletion
    
    -- Data quality and validation
    data_quality_score INTEGER DEFAULT 0,              -- Data completeness score (0-100)
    last_verified_at TIMESTAMPTZ,                     -- Last data verification
    requires_update BOOLEAN NOT NULL DEFAULT FALSE,    -- Flagged for data update
    
    -- Constraints
    CONSTRAINT venues_name_not_empty CHECK (TRIM(venue_name) != ''),
    CONSTRAINT venues_valid_capacity CHECK (total_capacity IS NULL OR total_capacity > 0),
    CONSTRAINT venues_seated_capacity_valid CHECK (seated_capacity IS NULL OR seated_capacity >= 0),
    CONSTRAINT venues_standing_capacity_valid CHECK (standing_capacity IS NULL OR standing_capacity >= 0),
    CONSTRAINT venues_capacity_logic CHECK (
        total_capacity IS NULL OR 
        (COALESCE(seated_capacity, 0) + COALESCE(standing_capacity, 0)) <= total_capacity
    ),
    CONSTRAINT venues_valid_coordinates CHECK (
        (latitude IS NULL AND longitude IS NULL) OR 
        (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    ),
    CONSTRAINT venues_valid_commission CHECK (commission_rate >= 0 AND commission_rate <= 1),
    CONSTRAINT venues_valid_rating CHECK (average_rating IS NULL OR (average_rating >= 0 AND average_rating <= 5)),
    CONSTRAINT venues_valid_age CHECK (minimum_age IS NULL OR minimum_age >= 0),
    CONSTRAINT venues_valid_parking CHECK (parking_capacity IS NULL OR parking_capacity >= 0),
    CONSTRAINT venues_email_format CHECK (primary_email IS NULL OR primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT venues_contact_email_format CHECK (contact_person_email IS NULL OR contact_person_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- =====================================================
-- VENUE_DOCUMENTS TABLE
-- =====================================================
-- Store venue verification documents and certificates
CREATE TABLE IF NOT EXISTS venue_documents (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    
    -- Document information
    document_type VARCHAR(100) NOT NULL,               -- Type of document
    document_name VARCHAR(200) NOT NULL,               -- Document name/title
    document_description TEXT,                         -- Document description
    
    -- File information
    file_url TEXT NOT NULL,                           -- Document file URL
    file_name VARCHAR(255),                           -- Original file name
    file_size_bytes BIGINT,                           -- File size in bytes
    file_type VARCHAR(100),                           -- MIME type
    file_hash VARCHAR(64),                            -- File integrity hash
    
    -- Document status
    is_required BOOLEAN NOT NULL DEFAULT FALSE,        -- Required for verification
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,        -- Document verified
    verification_notes TEXT,                           -- Verification notes
    verified_at TIMESTAMPTZ,                          -- Verification timestamp
    verified_by_user_id UUID,                         -- Admin who verified
    
    -- Document validity
    issued_date DATE,                                  -- Document issue date
    expiry_date DATE,                                  -- Document expiry date
    is_expired BOOLEAN GENERATED ALWAYS AS (expiry_date < CURRENT_DATE) STORED,
    
    -- Audit fields
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- Upload timestamp
    uploaded_by_user_id UUID,                         -- User who uploaded
    
    -- Constraints
    CONSTRAINT venue_docs_valid_dates CHECK (issued_date IS NULL OR expiry_date IS NULL OR issued_date <= expiry_date),
    CONSTRAINT venue_docs_file_size_positive CHECK (file_size_bytes IS NULL OR file_size_bytes > 0)
);

-- =====================================================
-- VENUE_OPERATING_HOURS TABLE
-- =====================================================
-- Store venue operating hours and availability
CREATE TABLE IF NOT EXISTS venue_operating_hours (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
    tenant_id UUID,
    
    -- Venue association
    venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    
    -- Day and time information
    day_of_week INTEGER NOT NULL,                      -- 0=Sunday, 1=Monday, ..., 6=Saturday
    is_open BOOLEAN NOT NULL DEFAULT TRUE,             -- Venue is open on this day
    open_time TIME,                                    -- Opening time
    close_time TIME,                                   -- Closing time
    
    -- Special conditions
    is_24_hours BOOLEAN NOT NULL DEFAULT FALSE,        -- Open 24 hours
    notes TEXT,                                        -- Special notes for this day
    
    -- Seasonal adjustments
    effective_from DATE,                               -- When these hours take effect
    effective_until DATE,                             -- When these hours expire
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT venue_hours_valid_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
    CONSTRAINT venue_hours_valid_times CHECK (
        NOT is_open OR is_24_hours OR (open_time IS NOT NULL AND close_time IS NOT NULL)
    ),
    CONSTRAINT venue_hours_valid_dates CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_from <= effective_until),
    
    -- Unique constraint
    UNIQUE(venue_id, day_of_week, effective_from)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- Primary lookup indexes
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(venue_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_slug ON venues(venue_slug) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_type ON venues(venue_type) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(venue_status) WHERE deleted_at IS NULL;

-- Geographic indexes
CREATE INDEX IF NOT EXISTS idx_venues_location ON venues(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues(city, state_province, country_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_country ON venues(country_code) WHERE deleted_at IS NULL;

-- Owner and management indexes
CREATE INDEX IF NOT EXISTS idx_venues_owner ON venues(owner_user_id) WHERE owner_user_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_manager ON venues(manager_user_id) WHERE manager_user_id IS NOT NULL AND deleted_at IS NULL;

-- Verification and business indexes
CREATE INDEX IF NOT EXISTS idx_venues_verification ON venues(verification_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_business_license ON venues(business_license_number) WHERE business_license_number IS NOT NULL AND deleted_at IS NULL;

-- Capacity and features indexes
CREATE INDEX IF NOT EXISTS idx_venues_capacity ON venues(total_capacity) WHERE total_capacity IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_features ON venues USING gin(accessibility_features) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_tags ON venues USING gin(venue_tags) WHERE deleted_at IS NULL;

-- Performance and rating indexes
CREATE INDEX IF NOT EXISTS idx_venues_rating ON venues(average_rating) WHERE average_rating IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_events_hosted ON venues(total_events_hosted) WHERE deleted_at IS NULL;

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_venues_created_at ON venues(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_updated_at ON venues(updated_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_venues_deleted_at ON venues(deleted_at) WHERE deleted_at IS NOT NULL;

-- Full-text search indexes
CREATE INDEX IF NOT EXISTS idx_venues_search ON venues USING gin(
    to_tsvector('english', venue_name || ' ' || COALESCE(display_name, '') || ' ' || COALESCE(short_description, ''))
) WHERE deleted_at IS NULL;

-- Venue documents indexes
CREATE INDEX IF NOT EXISTS idx_venue_docs_venue_id ON venue_documents(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_docs_type ON venue_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_venue_docs_verified ON venue_documents(is_verified);
CREATE INDEX IF NOT EXISTS idx_venue_docs_expired ON venue_documents(is_expired) WHERE is_expired = TRUE;
CREATE INDEX IF NOT EXISTS idx_venue_docs_expiry ON venue_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- Operating hours indexes
CREATE INDEX IF NOT EXISTS idx_venue_hours_venue_id ON venue_operating_hours(venue_id);
CREATE INDEX IF NOT EXISTS idx_venue_hours_day ON venue_operating_hours(day_of_week);
CREATE INDEX IF NOT EXISTS idx_venue_hours_effective ON venue_operating_hours(effective_from, effective_until);

-- =====================================================
-- TRIGGER FUNCTIONS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to automatically update timestamps and data quality
CREATE OR REPLACE FUNCTION update_venue_metadata()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp
    NEW.updated_at = NOW();
    
    -- Calculate data quality score based on completeness
    NEW.data_quality_score = (
        CASE WHEN NEW.venue_name IS NOT NULL AND TRIM(NEW.venue_name) != '' THEN 10 ELSE 0 END +
        CASE WHEN NEW.short_description IS NOT NULL AND TRIM(NEW.short_description) != '' THEN 10 ELSE 0 END +
        CASE WHEN NEW.address_line_1 IS NOT NULL AND TRIM(NEW.address_line_1) != '' THEN 15 ELSE 0 END +
        CASE WHEN NEW.city IS NOT NULL AND TRIM(NEW.city) != '' THEN 10 ELSE 0 END +
        CASE WHEN NEW.primary_phone IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.primary_email IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.total_capacity IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN 10 ELSE 0 END +
        CASE WHEN NEW.website_url IS NOT NULL THEN 5 ELSE 0 END +
        CASE WHEN NEW.logo_url IS NOT NULL THEN 5 ELSE 0 END +
        CASE WHEN NEW.cover_image_url IS NOT NULL THEN 5 ELSE 0 END
    );
    
    -- Generate slug if not provided
    IF NEW.venue_slug IS NULL OR NEW.venue_slug = '' THEN
        NEW.venue_slug = lower(regexp_replace(NEW.venue_name, '[^a-zA-Z0-9]+', '-', 'g'));
        NEW.venue_slug = trim(NEW.venue_slug, '-');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically update operating hours timestamps
CREATE OR REPLACE FUNCTION update_venue_hours_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for automatic updates
DROP TRIGGER IF EXISTS trigger_venue_metadata_update ON venues;
CREATE TRIGGER trigger_venue_metadata_update
    BEFORE UPDATE ON venues
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_metadata();

DROP TRIGGER IF EXISTS trigger_venue_metadata_insert ON venues;
CREATE TRIGGER trigger_venue_metadata_insert
    BEFORE INSERT ON venues
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_metadata();

DROP TRIGGER IF EXISTS trigger_venue_hours_updated_at ON venue_operating_hours;
CREATE TRIGGER trigger_venue_hours_updated_at
    BEFORE UPDATE ON venue_operating_hours
    FOR EACH ROW
    EXECUTE FUNCTION update_venue_hours_updated_at();

-- =====================================================
-- VENUE MANAGEMENT HELPER FUNCTIONS
-- =====================================================

-- Function to create a new venue
CREATE OR REPLACE FUNCTION create_venue(
    p_venue_name VARCHAR(200),
    p_venue_type venue_type,
    p_address_line_1 VARCHAR(255),
    p_city VARCHAR(100),
    p_country_code CHAR(2),
    p_owner_user_id UUID,
    p_total_capacity INTEGER DEFAULT NULL,
    p_primary_phone VARCHAR(20) DEFAULT NULL,
    p_primary_email VARCHAR(320) DEFAULT NULL,
    p_created_by_user_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_venue_id UUID;
BEGIN
    INSERT INTO venues (
        venue_name, venue_type, address_line_1, city, country_code,
        owner_user_id, total_capacity, primary_phone, primary_email,
        created_by_user_id
    )
    VALUES (
        p_venue_name, p_venue_type, p_address_line_1, p_city, p_country_code,
        p_owner_user_id, p_total_capacity, p_primary_phone, p_primary_email,
        p_created_by_user_id
    )
    RETURNING id INTO new_venue_id;
    
    RETURN new_venue_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update venue verification status
CREATE OR REPLACE FUNCTION update_venue_verification(
    p_venue_id UUID,
    p_verification_status verification_status,
    p_verified_by_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE venues
    SET verification_status = p_verification_status,
        verified_at = CASE WHEN p_verification_status = 'verified' THEN NOW() ELSE verified_at END,
        verified_by_user_id = p_verified_by_user_id,
        updated_at = NOW()
    WHERE id = p_venue_id
    AND deleted_at IS NULL;
    
    -- Log verification change in audit trail if function exists
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_audit_event') THEN
        PERFORM log_audit_event(
            p_verified_by_user_id,
            'venue_management'::audit_category,
            'update'::audit_action,
            'venue',
            p_venue_id::text,
            NULL,
            'Venue verification status updated to ' || p_verification_status::text,
            NULL,
            jsonb_build_object('verification_status', p_verification_status, 'notes', p_notes),
            'info'::audit_severity
        );
    END IF;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to search venues with filters
CREATE OR REPLACE FUNCTION search_venues(
    p_search_text TEXT DEFAULT NULL,
    p_venue_types venue_type[] DEFAULT NULL,
    p_city VARCHAR(100) DEFAULT NULL,
    p_state_province VARCHAR(100) DEFAULT NULL,
    p_country_code CHAR(2) DEFAULT NULL,
    p_min_capacity INTEGER DEFAULT NULL,
    p_max_capacity INTEGER DEFAULT NULL,
    p_venue_status venue_status[] DEFAULT NULL,
    p_latitude DECIMAL(10, 8) DEFAULT NULL,
    p_longitude DECIMAL(11, 8) DEFAULT NULL,
    p_radius_km DECIMAL(10, 2) DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
) RETURNS TABLE(
    id UUID,
    venue_name VARCHAR(200),
    venue_type venue_type,
    city VARCHAR(100),
    state_province VARCHAR(100),
    total_capacity INTEGER,
    average_rating DECIMAL(3, 2),
    distance_km DECIMAL(10, 2),
    venue_status venue_status
) AS $$
BEGIN
    RETURN QUERY
    SELECT v.id, v.venue_name, v.venue_type, v.city, v.state_province,
           v.total_capacity, v.average_rating,
           CASE 
               WHEN p_latitude IS NOT NULL AND p_longitude IS NOT NULL AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL THEN
                   6371 * acos(cos(radians(p_latitude)) * cos(radians(v.latitude)) * 
                              cos(radians(v.longitude) - radians(p_longitude)) + 
                              sin(radians(p_latitude)) * sin(radians(v.latitude)))
               ELSE NULL
           END::DECIMAL(10, 2) as distance_km,
           v.venue_status
    FROM venues v
    WHERE v.deleted_at IS NULL
    AND (p_search_text IS NULL OR 
         to_tsvector('english', v.venue_name || ' ' || COALESCE(v.display_name, '') || ' ' || COALESCE(v.short_description, '')) 
         @@ plainto_tsquery('english', p_search_text))
    AND (p_venue_types IS NULL OR v.venue_type = ANY(p_venue_types))
    AND (p_city IS NULL OR v.city ILIKE '%' || p_city || '%')
    AND (p_state_province IS NULL OR v.state_province ILIKE '%' || p_state_province || '%')
    AND (p_country_code IS NULL OR v.country_code = p_country_code)
    AND (p_min_capacity IS NULL OR v.total_capacity >= p_min_capacity)
    AND (p_max_capacity IS NULL OR v.total_capacity <= p_max_capacity)
    AND (p_venue_status IS NULL OR v.venue_status = ANY(p_venue_status))
    AND (p_radius_km IS NULL OR p_latitude IS NULL OR p_longitude IS NULL OR v.latitude IS NULL OR v.longitude IS NULL OR
         6371 * acos(cos(radians(p_latitude)) * cos(radians(v.latitude)) * 
                    cos(radians(v.longitude) - radians(p_longitude)) + 
                    sin(radians(p_latitude)) * sin(radians(v.latitude))) <= p_radius_km)
    ORDER BY 
        CASE WHEN distance_km IS NOT NULL THEN distance_km ELSE 999999 END,
        v.average_rating DESC NULLS LAST,
        v.venue_name
    LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get venue details with related data
CREATE OR REPLACE FUNCTION get_venue_details(p_venue_id UUID)
RETURNS TABLE(
    id UUID,
    venue_name VARCHAR(200),
    venue_type venue_type,
    full_description TEXT,
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(100),
    state_province VARCHAR(100),
    country_code CHAR(2),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    total_capacity INTEGER,
    seated_capacity INTEGER,
    standing_capacity INTEGER,
    venue_status venue_status,
    verification_status verification_status,
    average_rating DECIMAL(3, 2),
    total_events_hosted INTEGER,
    amenities JSONB,
    contact_info JSONB,
    operating_hours JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT v.id, v.venue_name, v.venue_type, v.full_description,
           v.address_line_1, v.address_line_2, v.city, v.state_province, v.country_code,
           v.latitude, v.longitude, v.total_capacity, v.seated_capacity, v.standing_capacity,
           v.venue_status, v.verification_status, v.average_rating, v.total_events_hosted,
           v.amenities,
           jsonb_build_object(
               'primary_phone', v.primary_phone,
               'primary_email', v.primary_email,
               'website_url', v.website_url,
               'contact_person_name', v.contact_person_name,
               'contact_person_phone', v.contact_person_phone,
               'contact_person_email', v.contact_person_email
           ) as contact_info,
           COALESCE(
               (SELECT jsonb_agg(
                   jsonb_build_object(
                       'day_of_week', voh.day_of_week,
                       'is_open', voh.is_open,
                       'open_time', voh.open_time,
                       'close_time', voh.close_time,
                       'is_24_hours', voh.is_24_hours
                   )
               ) FROM venue_operating_hours voh 
               WHERE voh.venue_id = v.id 
               AND (voh.effective_until IS NULL OR voh.effective_until >= CURRENT_DATE)),
               '[]'::jsonb
           ) as operating_hours
    FROM venues v
    WHERE v.id = p_venue_id
    AND v.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Function to soft delete venue
CREATE OR REPLACE FUNCTION delete_venue(
    p_venue_id UUID,
    p_deleted_by_user_id UUID,
    p_deletion_reason TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    UPDATE venues
    SET deleted_at = NOW(),
        deleted_by_user_id = p_deleted_by_user_id,
        deletion_reason = p_deletion_reason,
        venue_status = 'closed'
    WHERE id = p_venue_id
    AND deleted_at IS NULL;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate venue statistics
CREATE OR REPLACE FUNCTION get_venue_statistics()
RETURNS TABLE(
    total_venues BIGINT,
    active_venues BIGINT,
    verified_venues BIGINT,
    pending_approval BIGINT,
    venues_by_type JSONB,
    venues_by_country JSONB,
    average_capacity DECIMAL,
    total_capacity BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_venues,
        COUNT(*) FILTER (WHERE venue_status = 'active') as active_venues,
        COUNT(*) FILTER (WHERE verification_status = 'verified') as verified_venues,
        COUNT(*) FILTER (WHERE venue_status = 'pending_approval') as pending_approval,
        (SELECT jsonb_object_agg(venue_type, cnt) 
         FROM (SELECT venue_type, COUNT(*) as cnt FROM venues WHERE deleted_at IS NULL GROUP BY venue_type) t) as venues_by_type,
        (SELECT jsonb_object_agg(country_code, cnt) 
         FROM (SELECT country_code, COUNT(*) as cnt FROM venues WHERE deleted_at IS NULL GROUP BY country_code) t) as venues_by_country,
        AVG(total_capacity) as average_capacity,
        SUM(total_capacity) as total_capacity
    FROM venues
    WHERE deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS ON TABLES AND COLUMNS
-- =====================================================

COMMENT ON TABLE venues IS 'Master venue data with comprehensive information for TicketToken platform';
COMMENT ON TABLE venue_documents IS 'Venue verification documents and certificates storage';
COMMENT ON TABLE venue_operating_hours IS 'Venue operating hours and availability schedule';

-- Venues table comments
COMMENT ON COLUMN venues.venue_slug IS 'URL-friendly venue identifier: used in public URLs';
COMMENT ON COLUMN venues.venue_subtypes IS 'Additional venue classifications: array of secondary venue types';
COMMENT ON COLUMN venues.venue_tags IS 'Searchable tags: keywords for venue discovery and filtering';
COMMENT ON COLUMN venues.latitude IS 'Geographic latitude: decimal degrees for mapping and location services';
COMMENT ON COLUMN venues.longitude IS 'Geographic longitude: decimal degrees for mapping and location services';
COMMENT ON COLUMN venues.social_media_links IS 'Social media profiles: JSON object with platform URLs';
COMMENT ON COLUMN venues.accessibility_features IS 'ADA compliance features: array of accessibility accommodations';
COMMENT ON COLUMN venues.amenities IS 'Additional amenities: JSON object with facility features and services';
COMMENT ON COLUMN venues.commission_rate IS 'Platform commission: decimal percentage of ticket sales (0.05 = 5%)';
COMMENT ON COLUMN venues.bank_account_info IS 'Payment information: encrypted bank account details for settlements';
COMMENT ON COLUMN venues.prohibited_items IS 'Restricted items: array of items not allowed in venue';
COMMENT ON COLUMN venues.data_quality_score IS 'Data completeness: calculated score (0-100) based on field completion';

-- =====================================================
-- VENUE MASTER DATA SCHEMA CREATION COMPLETE
-- =====================================================
-- Comprehensive venue management system with:
-- - Complete venue master data with business information
-- - Geographic mapping and location services support
-- - Capacity management with flexible configurations
-- - Verification and document management system
-- - Operating hours and availability tracking
-- - Performance optimization with strategic indexing
-- - Helper functions for venue operations
-- - Audit trail integration and compliance support
-- - Data quality scoring and validation
-- Ready for TicketToken Week 1 development

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_venues_tenant_id ON venues(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_tenant_created ON venues(tenant_id, created_at) WHERE tenant_id IS NOT NULL;
-- =====================================================
```

## 14. Route Patterns
```typescript
import { Router } from 'express';
import { ticketController } from '../controllers/ticketController';
import { validate, ticketSchemas } from '../utils/validation';
import { requireRole } from '../middleware/auth';

const router = Router();

// Ticket type management (admin/venue manager only)
router.post(
  '/types',
  requireRole(['admin', 'venue_manager']),
  validate(ticketSchemas.createTicketType),
  ticketController.createTicketType.bind(ticketController)
);

router.get(
  '/events/:eventId/types',
  ticketController.getTicketTypes.bind(ticketController)
);

// Ticket purchasing
router.post(
  '/purchase',
  validate(ticketSchemas.purchaseTickets),
  ticketController.purchaseTickets.bind(ticketController)
);

router.post(
  '/reservations/:reservationId/confirm',
  ticketController.confirmPurchase.bind(ticketController)
);

// Ticket viewing
router.get(
  '/:ticketId',
  ticketController.getTicket.bind(ticketController)
);

router.get(
  '/users/:userId',
  ticketController.getUserTickets.bind(ticketController)
);

// My tickets (convenience endpoint)
router.get(
  '/my-tickets',
  (req, res, next) => {
    (req.params as any).userId = (req as any).user.id;
    ticketController.getUserTickets(req as any, res, next);
  }
);

// Availability check
router.get(
  '/events/:eventId/types/:ticketTypeId/availability',
  ticketController.checkAvailability.bind(ticketController)
);

export default router;
```
