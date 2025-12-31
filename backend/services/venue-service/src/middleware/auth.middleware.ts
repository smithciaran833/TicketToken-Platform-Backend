import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';
import { createHash } from 'crypto';

// SECURITY FIX (SEC-DB6): Hash API keys before lookup
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
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

  if (!userId) {
    return ErrorResponseBuilder.unauthorized(reply, 'Not authenticated');
  }

  const server = request.server as any;
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

  // SECURITY FIX (SEC-DB6): Hash the API key for lookup and caching
  const hashedKey = hashApiKey(apiKey);

  // Check cache first (using hashed key, not plaintext)
  const cached = await redis.get(`api_key_hash:${hashedKey}`);
  if (cached) {
    (request as any).user = JSON.parse(cached);
    return;
  }

  // Look up API key by hash in database
  // Note: The api_keys table should store key_hash instead of plaintext key
  // This lookup supports both legacy (plaintext) and new (hashed) storage
  let keyData = await db('api_keys')
    .where({ key_hash: hashedKey, is_active: true })
    .where('expires_at', '>', new Date())
    .first();

  // Fallback to legacy plaintext lookup if hash not found
  // TODO: Remove this fallback after migration to hashed keys is complete
  if (!keyData) {
    keyData = await db('api_keys')
      .where({ key: apiKey, is_active: true })
      .where('expires_at', '>', new Date())
      .first();
    
    if (keyData) {
      logger.warn('API key found using legacy plaintext lookup - should be migrated to hashed storage');
    }
  }

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

  // Cache for 5 minutes (using hashed key, not plaintext)
  await redis.setex(`api_key_hash:${hashedKey}`, 300, JSON.stringify(authUser));

  (request as any).user = authUser;
}
