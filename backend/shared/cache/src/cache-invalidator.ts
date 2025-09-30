import { EventEmitter } from 'events';
import { CacheService } from './cache-service';

export interface InvalidationRule {
  event: string;
  keys?: string[];
  patterns?: string[];
  tags?: string[];
  handler?: (payload: any) => string[] | Promise<string[]>;
}

export class CacheInvalidator extends EventEmitter {
  private rules: Map<string, InvalidationRule[]> = new Map();
  
  constructor(private cache: CacheService) {
    super();
  }

  /**
   * Register invalidation rules
   */
  register(rule: InvalidationRule): void {
    const rules = this.rules.get(rule.event) || [];
    rules.push(rule);
    this.rules.set(rule.event, rules);
  }

  /**
   * Register multiple rules
   */
  registerMany(rules: InvalidationRule[]): void {
    rules.forEach(rule => this.register(rule));
  }

  /**
   * Process invalidation event
   */
  async process(event: string, payload?: any): Promise<void> {
    const rules = this.rules.get(event);
    if (!rules) return;
    
    const promises = rules.map(async rule => {
      try {
        // Direct key invalidation
        if (rule.keys) {
          await this.cache.delete(rule.keys);
        }
        
        // Pattern-based invalidation
        if (rule.patterns) {
          for (const pattern of rule.patterns) {
            const keys = await this.findKeysByPattern(pattern, payload);
            if (keys.length > 0) {
              await this.cache.delete(keys);
            }
          }
        }
        
        // Tag-based invalidation
        if (rule.tags) {
          const tags = this.resolveTags(rule.tags, payload);
          await this.cache.deleteByTags(tags);
        }
        
        // Custom handler
        if (rule.handler) {
          const keys = await rule.handler(payload);
          if (keys && keys.length > 0) {
            await this.cache.delete(keys);
          }
        }
        
        this.emit('invalidated', { event, rule, payload });
      } catch (error) {
        this.emit('error', { event, rule, payload, error });
      }
    });
    
    await Promise.all(promises);
  }

  /**
   * Setup common invalidation rules for TicketToken
   */
  setupDefaultRules(): void {
    this.registerMany([
      // User updates
      {
        event: 'user.updated',
        handler: async (payload) => [
          `auth:user:${payload.userId}`,
          `auth:session:*:${payload.userId}`
        ]
      },
      {
        event: 'user.logout',
        handler: async (payload) => [
          `auth:session:${payload.sessionId}`
        ]
      },
      
      // Event updates
      {
        event: 'event.updated',
        handler: async (payload) => [
          `event:details:${payload.eventId}`,
          `event:tickets:${payload.eventId}`,
          `venue:events:${payload.venueId}`
        ]
      },
      {
        event: 'event.created',
        handler: async (payload) => [
          `venue:events:${payload.venueId}`,
          `search:events:*`
        ]
      },
      
      // Ticket updates
      {
        event: 'ticket.purchased',
        handler: async (payload) => [
          `ticket:availability:${payload.eventId}`,
          `event:details:${payload.eventId}`,
          `user:tickets:${payload.userId}`
        ]
      },
      {
        event: 'ticket.transferred',
        handler: async (payload) => [
          `user:tickets:${payload.fromUserId}`,
          `user:tickets:${payload.toUserId}`,
          `ticket:ownership:${payload.ticketId}`
        ]
      },
      
      // Venue updates
      {
        event: 'venue.updated',
        handler: async (payload) => [
          `venue:profile:${payload.venueId}`,
          `venue:events:${payload.venueId}`,
          `venue:staff:${payload.venueId}`
        ]
      },
      
      // Order updates
      {
        event: 'order.created',
        handler: async (payload) => [
          `user:orders:${payload.userId}`,
          `venue:orders:${payload.venueId}`,
          `ticket:availability:${payload.eventId}`
        ]
      },
      {
        event: 'order.cancelled',
        handler: async (payload) => [
          `user:orders:${payload.userId}`,
          `venue:orders:${payload.venueId}`,
          `ticket:availability:${payload.eventId}`
        ]
      },
      
      // Payment updates
      {
        event: 'payment.completed',
        handler: async (payload) => [
          `order:status:${payload.orderId}`,
          `user:orders:${payload.userId}`
        ]
      },
      {
        event: 'payment.failed',
        handler: async (payload) => [
          `order:status:${payload.orderId}`,
          `ticket:availability:${payload.eventId}`
        ]
      }
    ]);
  }

  private async findKeysByPattern(pattern: string, payload: any): Promise<string[]> {
    // Replace placeholders in pattern with actual values
    let resolvedPattern = pattern;
    if (payload) {
      Object.keys(payload).forEach(key => {
        resolvedPattern = resolvedPattern.replace(`{${key}}`, payload[key]);
      });
    }
    
    // In production, this would use Redis SCAN
    // For now, return empty array
    return [];
  }

  private resolveTags(tags: string[], payload: any): string[] {
    if (!payload) return tags;
    
    return tags.map(tag => {
      let resolvedTag = tag;
      Object.keys(payload).forEach(key => {
        resolvedTag = resolvedTag.replace(`{${key}}`, payload[key]);
      });
      return resolvedTag;
    });
  }
}
