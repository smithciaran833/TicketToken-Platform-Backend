import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

/**
 * SEC-S14: Re-authentication middleware for sensitive operations
 * Requires additional verification for high-risk operations like refunds/cancellations
 * 
 * This middleware enforces:
 * - Recent authentication (token issued within threshold)
 * - Optional password re-entry for very sensitive operations
 * - Rate limiting for sensitive operations per user
 */

// Configuration
const RE_AUTH_THRESHOLD_MS = parseInt(process.env.RE_AUTH_THRESHOLD_MS || '900000', 10); // 15 minutes default
const SENSITIVE_OPS_RATE_LIMIT = parseInt(process.env.SENSITIVE_OPS_RATE_LIMIT || '10', 10); // per hour
const SENSITIVE_OPS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Track sensitive operations per user for rate limiting
const sensitiveOpsCount = new Map<string, { count: number; windowStart: number }>();

// Cleanup old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, data] of sensitiveOpsCount.entries()) {
    if (now - data.windowStart > SENSITIVE_OPS_WINDOW_MS) {
      sensitiveOpsCount.delete(userId);
    }
  }
}, 10 * 60 * 1000);

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    tenantId: string;
    email: string;
    role: string;
    permissions: string[];
  };
}

/**
 * SEC-S14: Require recent authentication for sensitive operations
 * Used for refunds, cancellations, and other high-risk actions
 */
export async function requireRecentAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const req = request as AuthenticatedRequest;
  const user = req.user;

  if (!user) {
    reply.status(401).send({
      error: 'Unauthorized',
      message: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  // Check if token was issued recently
  const jwtPayload = (request as any).user;
  const tokenIssuedAt = jwtPayload.iat ? jwtPayload.iat * 1000 : 0;
  const now = Date.now();
  const tokenAge = now - tokenIssuedAt;

  if (tokenAge > RE_AUTH_THRESHOLD_MS) {
    logger.warn('Token too old for sensitive operation', {
      userId: user.id,
      tokenAge,
      threshold: RE_AUTH_THRESHOLD_MS,
      path: request.url,
    });

    reply.status(403).send({
      error: 'Re-authentication required',
      message: 'Your session has been active too long. Please re-authenticate to perform this action.',
      code: 'RE_AUTH_REQUIRED',
      tokenAgeMinutes: Math.floor(tokenAge / 60000),
      thresholdMinutes: Math.floor(RE_AUTH_THRESHOLD_MS / 60000),
    });
    return;
  }

  // Check rate limit for sensitive operations
  const userKey = `${user.tenantId}:${user.id}`;
  const userData = sensitiveOpsCount.get(userKey);

  if (userData) {
    if (now - userData.windowStart > SENSITIVE_OPS_WINDOW_MS) {
      // Reset window
      sensitiveOpsCount.set(userKey, { count: 1, windowStart: now });
    } else if (userData.count >= SENSITIVE_OPS_RATE_LIMIT) {
      logger.warn('Rate limit exceeded for sensitive operations', {
        userId: user.id,
        count: userData.count,
        limit: SENSITIVE_OPS_RATE_LIMIT,
      });

      reply.status(429).send({
        error: 'Too many requests',
        message: 'You have exceeded the limit for sensitive operations. Please try again later.',
        code: 'SENSITIVE_OPS_RATE_LIMIT',
        retryAfterMinutes: Math.ceil((userData.windowStart + SENSITIVE_OPS_WINDOW_MS - now) / 60000),
      });
      return;
    } else {
      userData.count++;
    }
  } else {
    sensitiveOpsCount.set(userKey, { count: 1, windowStart: now });
  }

  logger.info('Sensitive operation authorized', {
    userId: user.id,
    path: request.url,
    method: request.method,
  });
}

/**
 * SEC-S14: Require explicit confirmation header for destructive operations
 * Used for order cancellations, bulk operations
 */
export async function requireExplicitConfirmation(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const confirmationHeader = request.headers['x-confirm-action'] as string;
  
  if (confirmationHeader !== 'true' && confirmationHeader !== 'CONFIRM') {
    logger.warn('Missing confirmation for destructive operation', {
      userId: (request as any).user?.id,
      path: request.url,
    });

    reply.status(400).send({
      error: 'Confirmation required',
      message: 'This operation requires explicit confirmation. Set X-Confirm-Action header to "CONFIRM".',
      code: 'CONFIRMATION_REQUIRED',
    });
    return;
  }
}

/**
 * Combined middleware for highly sensitive operations (refunds, cancellations)
 */
export async function requireSensitiveOperationAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // First check recent auth
  await requireRecentAuth(request, reply);
  
  // If recent auth failed, it would have sent a response
  if (reply.sent) return;

  // For DELETE and certain POST operations, also require confirmation
  if (request.method === 'DELETE' || 
      request.url.includes('/cancel') ||
      request.url.includes('/refund')) {
    await requireExplicitConfirmation(request, reply);
  }
}

export default requireSensitiveOperationAuth;
