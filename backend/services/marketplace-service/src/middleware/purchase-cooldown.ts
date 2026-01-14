/**
 * Purchase Cooldown Middleware for Marketplace Service
 * 
 * Issues Fixed:
 * - TIME-2: No purchase cooldown → Rate limiting purchases per user
 * - TIME-H3: Allows rapid purchases → Prevents multi-device attacks
 * 
 * This middleware:
 * 1. Enforces cooldown between purchases for the same user
 * 2. Uses Redis for distributed state
 * 3. Configurable per-ticket and global cooldowns
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'PurchaseCooldown' });

// Configuration
const GLOBAL_COOLDOWN_SECONDS = parseInt(process.env.PURCHASE_GLOBAL_COOLDOWN_SECONDS || '5', 10);
const PER_TICKET_COOLDOWN_SECONDS = parseInt(process.env.PURCHASE_TICKET_COOLDOWN_SECONDS || '300', 10);
const PER_EVENT_COOLDOWN_SECONDS = parseInt(process.env.PURCHASE_EVENT_COOLDOWN_SECONDS || '10', 10);

// Redis key prefixes
const KEY_PREFIX_GLOBAL = 'purchase:cooldown:global:';
const KEY_PREFIX_TICKET = 'purchase:cooldown:ticket:';
const KEY_PREFIX_EVENT = 'purchase:cooldown:event:';

interface CooldownCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

/**
 * AUDIT FIX TIME-2: Check if user is in cooldown period
 */
export async function checkPurchaseCooldown(
  userId: string,
  ticketId?: string,
  eventId?: string
): Promise<CooldownCheckResult> {
  try {
    const redis = getRedis();
    
    // Check global cooldown (prevents rapid consecutive purchases)
    const globalKey = `${KEY_PREFIX_GLOBAL}${userId}`;
    const globalTtl = await redis.ttl(globalKey);
    
    if (globalTtl > 0) {
      log.debug('User in global purchase cooldown', { userId, ttl: globalTtl });
      return {
        allowed: false,
        reason: 'Please wait before making another purchase',
        retryAfterSeconds: globalTtl
      };
    }

    // Check per-event cooldown (prevents buying too many from same event quickly)
    if (eventId) {
      const eventKey = `${KEY_PREFIX_EVENT}${userId}:${eventId}`;
      const eventTtl = await redis.ttl(eventKey);
      
      if (eventTtl > 0) {
        log.debug('User in event purchase cooldown', { userId, eventId, ttl: eventTtl });
        return {
          allowed: false,
          reason: 'Please wait before purchasing another ticket from this event',
          retryAfterSeconds: eventTtl
        };
      }
    }

    // Check per-ticket cooldown (prevents buying same ticket if purchase fails)
    if (ticketId) {
      const ticketKey = `${KEY_PREFIX_TICKET}${userId}:${ticketId}`;
      const ticketTtl = await redis.ttl(ticketKey);
      
      if (ticketTtl > 0) {
        log.debug('User in ticket purchase cooldown', { userId, ticketId, ttl: ticketTtl });
        return {
          allowed: false,
          reason: 'This ticket is temporarily unavailable. Please try again later.',
          retryAfterSeconds: ticketTtl
        };
      }
    }

    return { allowed: true };
  } catch (error: any) {
    // If Redis is down, allow the purchase but log warning
    log.warn('Failed to check purchase cooldown - allowing purchase', {
      userId,
      ticketId,
      eventId,
      error: error.message
    });
    return { allowed: true };
  }
}

/**
 * AUDIT FIX TIME-2: Set cooldown after purchase attempt
 */
export async function setPurchaseCooldown(
  userId: string,
  ticketId?: string,
  eventId?: string
): Promise<void> {
  try {
    const redis = getRedis();
    const pipeline = redis.multi();
    
    // Set global cooldown
    const globalKey = `${KEY_PREFIX_GLOBAL}${userId}`;
    pipeline.set(globalKey, '1', 'EX', GLOBAL_COOLDOWN_SECONDS);
    
    // Set per-event cooldown
    if (eventId) {
      const eventKey = `${KEY_PREFIX_EVENT}${userId}:${eventId}`;
      pipeline.set(eventKey, '1', 'EX', PER_EVENT_COOLDOWN_SECONDS);
    }
    
    // Set per-ticket cooldown
    if (ticketId) {
      const ticketKey = `${KEY_PREFIX_TICKET}${userId}:${ticketId}`;
      pipeline.set(ticketKey, '1', 'EX', PER_TICKET_COOLDOWN_SECONDS);
    }
    
    await pipeline.exec();
    
    log.debug('Purchase cooldown set', { userId, ticketId, eventId });
  } catch (error: any) {
    log.warn('Failed to set purchase cooldown', {
      userId,
      ticketId,
      eventId,
      error: error.message
    });
  }
}

/**
 * AUDIT FIX TIME-2: Clear cooldown (e.g., after successful purchase or admin override)
 */
export async function clearPurchaseCooldown(
  userId: string,
  ticketId?: string,
  eventId?: string
): Promise<void> {
  try {
    const redis = getRedis();
    const keys: string[] = [];
    
    if (ticketId) {
      keys.push(`${KEY_PREFIX_TICKET}${userId}:${ticketId}`);
    }
    
    // Don't clear global or event cooldowns - they're meant to persist
    
    if (keys.length > 0) {
      await redis.del(...keys);
      log.debug('Purchase cooldown cleared', { userId, ticketId });
    }
  } catch (error: any) {
    log.warn('Failed to clear purchase cooldown', {
      userId,
      ticketId,
      eventId,
      error: error.message
    });
  }
}

/**
 * AUDIT FIX TIME-2: Express/Fastify middleware for purchase endpoints
 */
export function purchaseCooldownMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Get user ID from auth context
  const userId = (request as any).user?.id || (request as any).userId;
  
  if (!userId) {
    // No user ID means not authenticated - let auth middleware handle it
    done();
    return;
  }

  // Get ticket and event IDs from request body or params
  const body = request.body as any;
  const params = request.params as any;
  
  const ticketId = body?.ticketId || body?.ticket_id || params?.ticketId;
  const eventId = body?.eventId || body?.event_id || params?.eventId;
  const listingId = body?.listingId || body?.listing_id || params?.listingId;

  // Check cooldown
  checkPurchaseCooldown(userId, ticketId || listingId, eventId)
    .then((result) => {
      if (!result.allowed) {
        reply.status(429).send({
          error: 'Too Many Requests',
          message: result.reason,
          retryAfter: result.retryAfterSeconds
        });
        return;
      }
      done();
    })
    .catch((error) => {
      log.error('Cooldown check error', { error: error.message });
      // On error, allow the request to proceed
      done();
    });
}

/**
 * Hook to set cooldown after purchase route handler
 */
export function setPurchaseCooldownHook(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  // Only set cooldown if the purchase was successful (2xx status)
  if (reply.statusCode >= 200 && reply.statusCode < 300) {
    const userId = (request as any).user?.id || (request as any).userId;
    const body = request.body as any;
    const params = request.params as any;
    
    const ticketId = body?.ticketId || body?.ticket_id || params?.ticketId;
    const eventId = body?.eventId || body?.event_id || params?.eventId;
    const listingId = body?.listingId || body?.listing_id || params?.listingId;
    
    if (userId) {
      setPurchaseCooldown(userId, ticketId || listingId, eventId)
        .catch((error) => {
          log.warn('Failed to set cooldown after purchase', { error: error.message });
        });
    }
  }
  
  done();
}

// Export configuration for testing
export const cooldownConfig = {
  GLOBAL_COOLDOWN_SECONDS,
  PER_TICKET_COOLDOWN_SECONDS,
  PER_EVENT_COOLDOWN_SECONDS
};
