import { Server as SocketIOServer, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import logger from '../utils/logger';

/**
 * EVENT STREAM SERVICE
 * 
 * Real-time event streaming using WebSocket (Socket.IO)
 * Phase 8: Advanced Features
 */

export enum StreamEventType {
  TRANSFER_UPDATE = 'transfer:update',
  TRANSFER_STATUS = 'transfer:status',
  BLOCKCHAIN_UPDATE = 'blockchain:update',
  NOTIFICATION = 'notification'
}

export interface StreamEvent {
  type: StreamEventType;
  data: any;
  timestamp: string;
}

export class EventStreamService {
  private io: SocketIOServer;
  private redisSubscriber: Redis;
  private authenticatedSockets: Map<string, Socket> = new Map();

  constructor(io: SocketIOServer, redis: Redis) {
    this.io = io;
    this.redisSubscriber = redis.duplicate();
    this.setupSocketHandlers();
    this.setupRedisSubscriptions();
  }

  /**
   * Setup Socket.IO event handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // Authenticate socket
      socket.on('authenticate', async (data: { userId: string; token: string }) => {
        try {
          // Verify token (implementation depends on your auth system)
          const isValid = await this.verifyToken(data.token, data.userId);
          
          if (isValid) {
            this.authenticatedSockets.set(socket.id, socket);
            socket.data.userId = data.userId;
            
            // Join user's personal room
            socket.join(`user:${data.userId}`);
            
            socket.emit('authenticated', { success: true });
            logger.info('Socket authenticated', { socketId: socket.id, userId: data.userId });
          } else {
            socket.emit('authenticated', { success: false, error: 'Invalid token' });
            socket.disconnect();
          }
        } catch (error) {
          logger.error({ err: error }, 'Authentication error');
          socket.disconnect();
        }
      });

      // Subscribe to transfer updates
      socket.on('subscribe:transfer', (transferId: string) => {
        if (socket.data.userId) {
          socket.join(`transfer:${transferId}`);
          logger.info('Subscribed to transfer', { socketId: socket.id, transferId });
        }
      });

      // Unsubscribe from transfer updates
      socket.on('unsubscribe:transfer', (transferId: string) => {
        socket.leave(`transfer:${transferId}`);
        logger.info('Unsubscribed from transfer', { socketId: socket.id, transferId });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.authenticatedSockets.delete(socket.id);
        logger.info('Client disconnected', { socketId: socket.id });
      });
    });
  }

  /**
   * Setup Redis pub/sub for distributed events
   */
  private setupRedisSubscriptions(): void {
    // Subscribe to transfer events channel
    this.redisSubscriber.subscribe('transfer:events', (err) => {
      if (err) {
        logger.error({ err }, 'Failed to subscribe to Redis channel');
      } else {
        logger.info('Subscribed to Redis transfer events channel');
      }
    });

    // Handle incoming messages
    this.redisSubscriber.on('message', (channel, message) => {
      try {
        const event: StreamEvent = JSON.parse(message);
        this.broadcastEvent(event);
      } catch (error) {
        logger.error({ err: error, channel, message }, 'Failed to parse Redis message');
      }
    });
  }

  /**
   * Publish event to Redis (for distributed systems)
   */
  async publishEvent(event: StreamEvent): Promise<void> {
    try {
      const message = JSON.stringify(event);
      await this.redisSubscriber.publish('transfer:events', message);
    } catch (error) {
      logger.error({ err: error, event }, 'Failed to publish event to Redis');
    }
  }

  /**
   * Broadcast event to connected clients
   */
  private broadcastEvent(event: StreamEvent): void {
    // Extract room from event data if available
    const { transferId, userId } = event.data || {};

    if (transferId) {
      // Send to transfer room
      this.io.to(`transfer:${transferId}`).emit(event.type, event.data);
    }

    if (userId) {
      // Send to user room
      this.io.to(`user:${userId}`).emit(event.type, event.data);
    }
  }

  /**
   * Send event to specific user
   */
  async sendToUser(userId: string, event: StreamEvent): Promise<void> {
    this.io.to(`user:${userId}`).emit(event.type, event.data);
  }

  /**
   * Send event to specific transfer subscribers
   */
  async sendToTransfer(transferId: string, event: StreamEvent): Promise<void> {
    this.io.to(`transfer:${transferId}`).emit(event.type, event.data);
  }

  /**
   * Broadcast to all connected clients
   */
  async broadcast(event: StreamEvent): Promise<void> {
    this.io.emit(event.type, event.data);
  }

  /**
   * Get connected client count
   */
  getConnectedCount(): number {
    return this.authenticatedSockets.size;
  }

  /**
   * Get room members count
   */
  async getRoomMemberCount(room: string): Promise<number> {
    const sockets = await this.io.in(room).fetchSockets();
    return sockets.length;
  }

  /**
   * Verify authentication token
   * (This should integrate with your actual auth system)
   */
  private async verifyToken(token: string, userId: string): Promise<boolean> {
    // TODO: Implement actual token verification
    // This is a placeholder - implement with your JWT/auth system
    return true;
  }

  /**
   * Cleanup and close connections
   */
  async close(): Promise<void> {
    await this.redisSubscriber.quit();
    this.io.close();
    logger.info('Event stream service closed');
  }
}

/**
 * Helper to create stream events
 */
export function createStreamEvent(
  type: StreamEventType,
  data: any
): StreamEvent {
  return {
    type,
    data,
    timestamp: new Date().toISOString()
  };
}
