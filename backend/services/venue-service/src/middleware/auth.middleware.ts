import { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import { ErrorResponseBuilder } from '../utils/error-response';
import { logger } from '../utils/logger';
import { UnauthorizedError } from '../utils/errors';

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

      // Set user on request
      (request as any).user = {
        id: decoded.sub,
        email: decoded.email || '',
        permissions: decoded.permissions || [],
        tenant_id: decoded.tenant_id
      };
    } catch (error) {
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

  // Check cache first
  const cached = await redis.get(`api_key:${apiKey}`);
  if (cached) {
    (request as any).user = JSON.parse(cached);
    return;
  }

  // Look up API key in database
  const keyData = await db('api_keys')
    .where({ key: apiKey, is_active: true })
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

  // Cache for 5 minutes
  await redis.setex(`api_key:${apiKey}`, 300, JSON.stringify(authUser));

  (request as any).user = authUser;
}
