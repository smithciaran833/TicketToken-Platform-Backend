import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { logger } from '../utils/logger';
import { UnauthorizedError, RateLimitError } from '../utils/errors';
import { createHash } from 'crypto';

// SECURITY FIX (SEC-DB6): Hash API keys before lookup
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

// SECURITY FIX: Rate limiting on authentication attempts
async function checkAuthRateLimit(request: FastifyRequest, redis: any): Promise<void> {
  // Skip rate limiting in tests
  if (process.env.DISABLE_RATE_LIMIT === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }

  const now = Date.now();
  const window = Math.floor(now / 60000); // 1 minute windows
  const key = `auth_ratelimit:${request.ip}:${window}`;

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60); // Expire after 60 seconds
    }

    if (count > 10) { // Max 10 attempts per minute per IP
      logger.warn({
        ip: request.ip,
        requestId: request.id,
        attempts: count
      }, 'Auth rate limit exceeded');
      throw new RateLimitError('authentication', 60);
    }
  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }
    // On Redis error, log but don't block authentication
    logger.error({ error, ip: request.ip }, 'Auth rate limit check failed');
  }
}

// SECURITY FIX: Cache invalidation for API keys
export async function invalidateApiKeyCache(keyHash: string, redis: any): Promise<void> {
  await redis.del(`api_key_hash:${keyHash}`);
}

export interface AuthUser {
  id: string;
  email: string;
  permissions: string[];
  tenant_id?: string;
}

export interface AuthenticatedRequest<T extends RouteGenericInterface = RouteGenericInterface> extends FastifyRequest<T> {
  user: AuthUser;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // SECURITY FIX: Rate limit authentication attempts
  const server = request.server as any;
  const redis = server.container?.cradle?.redis;
  if (redis) {
    await checkAuthRateLimit(request, redis);
  }

  try {
    // Check for API key first
    const apiKey = request.headers['x-api-key'] as string;
    if (apiKey) {
      return await authenticateWithApiKey(apiKey, request, reply);
    }

    // Check for JWT
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      throw new UnauthorizedError('Missing authentication token');
    }

    // Cast server to any to access jwt
    const server = request.server as any;
    try {
      const decoded = await server.jwt.verify(token);

      // SECURITY FIX: Require exp claim to prevent tokens without expiration
      if (!decoded.exp) {
        logger.warn({
          requestId: request.id,
          sub: decoded.sub,
        }, 'Token missing required exp claim');
        throw new UnauthorizedError('Invalid or expired token');
      }

      // SECURITY FIX (AE6): Validate token issuer
      const expectedIssuer = process.env.JWT_ISSUER || 'tickettoken-auth-service';
      if (decoded.iss && decoded.iss !== expectedIssuer) {
        logger.warn({
          requestId: request.id,
          actualIssuer: decoded.iss,
          expectedIssuer
        }, 'Token issuer mismatch');
        throw new UnauthorizedError('Invalid token issuer');
      }

      // SECURITY FIX (AE6): Validate token audience if present
      const expectedAudience = process.env.JWT_AUDIENCE || 'venue-service';
      if (decoded.aud && decoded.aud !== expectedAudience && !decoded.aud.includes?.(expectedAudience)) {
        logger.warn({
          requestId: request.id,
          actualAudience: decoded.aud,
          expectedAudience
        }, 'Token audience mismatch');
        throw new UnauthorizedError('Invalid token audience');
      }

      // Set user on request
      (request as any).user = {
        id: decoded.sub,
        email: decoded.email || '',
        permissions: decoded.permissions || [],
        tenant_id: decoded.tenant_id
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.warn({ error, requestId: request.id }, 'JWT verification failed');
      throw new UnauthorizedError('Invalid or expired token');
    }
  } catch (error) {
    logger.error({ error, requestId: request.id }, 'Authentication error');
    throw error;
  }
}

export async function requireVenueAccess(
  request: FastifyRequest<{ Params: { venueId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const venueId = request.params.venueId;
  const userId = (request as any).user?.id;
  const userTenantId = (request as any).user?.tenant_id;

  if (!userId) {
    return ErrorResponseBuilder.unauthorized(reply, 'Not authenticated');
  }

  const server = request.server as any;
  const db = server.container.cradle.db;

  // SECURITY FIX: Verify venue belongs to user's tenant (tenant boundary check)
  if (userTenantId) {
    const venue = await db('venues')
      .where({ id: venueId })
      .select('tenant_id')
      .first();

    if (venue && venue.tenant_id !== userTenantId) {
      logger.warn({
        userId,
        userTenantId,
        venueId,
        venueTenantId: venue.tenant_id,
        requestId: request.id
      }, 'Cross-tenant venue access attempt blocked');
      return ErrorResponseBuilder.forbidden(reply, 'Access denied');
    }
  }

  const venueService = server.container.cradle.venueService;

  const hasAccess = await venueService.checkVenueAccess(venueId, userId);
  if (!hasAccess) {
    return ErrorResponseBuilder.forbidden(reply, 'Access denied');
  }

  // Store venue access info on request
  (request as any).user.venueId = venueId;
}

async function authenticateWithApiKey(
  apiKey: string,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const server = request.server as any;
  const db = server.container.cradle.db;
  const redis = server.container.cradle.redis;

  // SECURITY FIX: Validate API key format (32-128 characters)
  if (!apiKey || apiKey.length < 32 || apiKey.length > 128) {
    return ErrorResponseBuilder.unauthorized(reply, 'Invalid API key format');
  }

  // SECURITY FIX (SEC-DB6): Hash the API key for lookup and caching
  const hashedKey = hashApiKey(apiKey);

  // Check cache first (using hashed key, not plaintext)
  const cached = await redis.get(`api_key_hash:${hashedKey}`);
  if (cached) {
    (request as any).user = JSON.parse(cached);
    return;
  }

  // SECURITY FIX: Look up API key by hash only (legacy plaintext fallback removed)
  const keyData = await db('api_keys')
    .where({ key_hash: hashedKey, is_active: true })
    .where('expires_at', '>', new Date())
    .first();

  if (!keyData) {
    return ErrorResponseBuilder.unauthorized(reply, 'Invalid API key');
  }

  // Get user data
  const user = await db('users')
    .where({ id: keyData.user_id })
    .first();

  if (!user) {
    return ErrorResponseBuilder.unauthorized(reply, 'Invalid API key');
  }

  const authUser = {
    id: user.id,
    email: user.email,
    permissions: keyData.permissions || [],
    tenant_id: user.tenant_id
  };

  // SECURITY FIX: Reduced cache TTL from 300s to 60s (using hashed key, not plaintext)
  await redis.setex(`api_key_hash:${hashedKey}`, 60, JSON.stringify(authUser));

  (request as any).user = authUser;
}
