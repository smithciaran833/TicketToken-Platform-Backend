/**
 * Redis Pub/Sub Manager
 * 
 * Manages Redis publish/subscribe messaging with automatic JSON serialization,
 * reconnection handling, and pattern-based subscriptions.
 */

import { EventEmitter } from 'events';
import { getRedisPubClient, getRedisSubClient } from '../connection-manager';
import { serialize, deserialize } from '../utils/serialization';
import { PubSubMessage, MessageHandler, PubSubConfig, RedisOperationError } from '../types';
import Redis from 'ioredis';

/**
 * Pub/Sub Manager Class
 */
export class PubSubManager extends EventEmitter {
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private subscriptions: Map<string, MessageHandler[]> = new Map();
  private patternSubscriptions: Map<string, MessageHandler[]> = new Map();
  
  constructor() {
    super();
  }
  
  /**
   * Initialize clients
   */
  private async initialize(): Promise<void> {
    if (!this.pubClient) {
      this.pubClient = await getRedisPubClient();
    }
    
    if (!this.subClient) {
      this.subClient = await getRedisSubClient();
      this.setupSubscriptionHandlers();
    }
  }
  
  /**
   * Setup message handlers on subscription client
   */
  private setupSubscriptionHandlers(): void {
    if (!this.subClient) return;
    
    // Handle regular channel messages
    this.subClient.on('message', async (channel: string, message: string) => {
      const handlers = this.subscriptions.get(channel);
      if (!handlers) return;
      
      const pubSubMessage: PubSubMessage = {
        channel,
        data: deserialize(message),
        timestamp: new Date(),
      };
      
      // Execute all handlers for this channel
      for (const handler of handlers) {
        try {
          await handler(pubSubMessage);
        } catch (error) {
          this.emit('error', error);
        }
      }
    });
    
    // Handle pattern-based messages
    this.subClient.on('pmessage', async (pattern: string, channel: string, message: string) => {
      const handlers = this.patternSubscriptions.get(pattern);
      if (!handlers) return;
      
      const pubSubMessage: PubSubMessage = {
        channel,
        pattern,
        data: deserialize(message),
        timestamp: new Date(),
      };
      
      // Execute all handlers for this pattern
      for (const handler of handlers) {
        try {
          await handler(pubSubMessage);
        } catch (error) {
          this.emit('error', error);
        }
      }
    });
    
    // Handle subscription events
    this.subClient.on('subscribe', (channel: string, count: number) => {
      this.emit('subscribe', { channel, count });
    });
    
    this.subClient.on('unsubscribe', (channel: string, count: number) => {
      this.emit('unsubscribe', { channel, count });
    });
    
    this.subClient.on('psubscribe', (pattern: string, count: number) => {
      this.emit('psubscribe', { pattern, count });
    });
    
    this.subClient.on('punsubscribe', (pattern: string, count: number) => {
      this.emit('punsubscribe', { pattern, count });
    });
  }
  
  /**
   * Publish message to channel
   */
  async publish(channel: string, message: any): Promise<number> {
    try {
      await this.initialize();
      
      const serialized = serialize(message);
      const subscribers = await this.pubClient!.publish(channel, serialized);
      
      return subscribers;
    } catch (error) {
      throw new RedisOperationError(
        'Publish failed',
        'publish',
        channel,
        error as Error
      );
    }
  }
  
  /**
   * Subscribe to a channel
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    try {
      await this.initialize();
      
      // Add handler to map
      if (!this.subscriptions.has(channel)) {
        this.subscriptions.set(channel, []);
        // Actually subscribe on Redis if this is the first handler
        await this.subClient!.subscribe(channel);
      }
      
      this.subscriptions.get(channel)!.push(handler);
    } catch (error) {
      throw new RedisOperationError(
        'Subscribe failed',
        'subscribe',
        channel,
        error as Error
      );
    }
  }
  
  /**
   * Subscribe to channels matching a pattern
   */
  async psubscribe(pattern: string, handler: MessageHandler): Promise<void> {
    try {
      await this.initialize();
      
      // Add handler to map
      if (!this.patternSubscriptions.has(pattern)) {
        this.patternSubscriptions.set(pattern, []);
        // Actually subscribe on Redis if this is the first handler
        await this.subClient!.psubscribe(pattern);
      }
      
      this.patternSubscriptions.get(pattern)!.push(handler);
    } catch (error) {
      throw new RedisOperationError(
        'Pattern subscribe failed',
        'psubscribe',
        pattern,
        error as Error
      );
    }
  }
  
  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    try {
      await this.initialize();
      
      const handlers = this.subscriptions.get(channel);
      if (!handlers) return;
      
      if (handler) {
        // Remove specific handler
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        
        // If no handlers left, unsubscribe from Redis
        if (handlers.length === 0) {
          this.subscriptions.delete(channel);
          await this.subClient!.unsubscribe(channel);
        }
      } else {
        // Remove all handlers and unsubscribe
        this.subscriptions.delete(channel);
        await this.subClient!.unsubscribe(channel);
      }
    } catch (error) {
      throw new RedisOperationError(
        'Unsubscribe failed',
        'unsubscribe',
        channel,
        error as Error
      );
    }
  }
  
  /**
   * Unsubscribe from pattern
   */
  async punsubscribe(pattern: string, handler?: MessageHandler): Promise<void> {
    try {
      await this.initialize();
      
      const handlers = this.patternSubscriptions.get(pattern);
      if (!handlers) return;
      
      if (handler) {
        // Remove specific handler
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
        
        // If no handlers left, unsubscribe from Redis
        if (handlers.length === 0) {
          this.patternSubscriptions.delete(pattern);
          await this.subClient!.punsubscribe(pattern);
        }
      } else {
        // Remove all handlers and unsubscribe
        this.patternSubscriptions.delete(pattern);
        await this.subClient!.punsubscribe(pattern);
      }
    } catch (error) {
      throw new RedisOperationError(
        'Pattern unsubscribe failed',
        'punsubscribe',
        pattern,
        error as Error
      );
    }
  }
  
  /**
   * Get number of subscribers for a channel
   */
  async numSubscribers(channel: string): Promise<number> {
    try {
      await this.initialize();
      const result = await this.pubClient!.pubsub('NUMSUB', channel);
      return result[1] as number || 0;
    } catch (error) {
      throw new RedisOperationError(
        'Get subscribers count failed',
        'numSubscribers',
        channel,
        error as Error
      );
    }
  }
  
  /**
   * Get active channels
   */
  async channels(pattern?: string): Promise<string[]> {
    try {
      await this.initialize();
      if (pattern) {
        return await this.pubClient!.pubsub('CHANNELS', pattern) as string[];
      }
      return await this.pubClient!.pubsub('CHANNELS') as string[];
    } catch (error) {
      throw new RedisOperationError(
        'Get channels failed',
        'channels',
        '',
        error as Error
      );
    }
  }
  
  /**
   * Close all connections
   */
  async close(): Promise<void> {
    try {
      // Clear all subscriptions
      this.subscriptions.clear();
      this.patternSubscriptions.clear();
      
      // Note: Don't close clients as they're managed by ConnectionManager
      this.pubClient = null;
      this.subClient = null;
    } catch (error) {
      throw new RedisOperationError(
        'Close failed',
        'close',
        '',
        error as Error
      );
    }
  }
}

// Singleton
let pubsubManager: PubSubManager | null = null;

export function getPubSubManager(): PubSubManager {
  if (!pubsubManager) {
    pubsubManager = new PubSubManager();
  }
  return pubsubManager;
}

export function createPubSubManager(): PubSubManager {
  return new PubSubManager();
}
