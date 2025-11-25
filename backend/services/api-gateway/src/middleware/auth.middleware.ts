import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config';
import { createRequestLogger, logSecurityEvent } from '../utils/logger';
import {
  AuthenticationError,
  AuthorizationError,
  AuthUser,
  UserRole
} from '../types';
import { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { nanoid } from 'nanoid';
import { AuthServiceClient } from '../clients/AuthServiceClient';
import { VenueServiceClient } from '../clients/VenueServiceClient';

// Define JWT payload types
interface JWTPayload {
  sub: string;
  type: 'access' | 'refresh';
  tenant_id: string;  // Now required in all tokens
  jti?: string;
  family?: string;
  permissions?: string[];
  role?: string;
}

// RBAC configuration from requirements
const RBAC_CONFIG: Record<UserRole, { permissions: string[]; venueScoped: boolean }> = {
  'venue-owner': {
    permissions: ['*'],
    venueScoped: true,
  },
  'venue-manager': {
    permissions: [
      'events:create', 'events:update', 'events:delete',
      'tickets:view', 'tickets:validate',
      'reports:view', 'reports:export',
    ],
    venueScoped: true,
  },
  'box-office': {
    permissions: [
      'tickets:sell', 'tickets:view', 'tickets:validate',
      'payments:process', 'reports:daily',
    ],
    venueScoped: true,
  },
  'door-staff': {
    permissions: ['tickets:validate', 'tickets:view'],
    venueScoped: true,
  },
  'customer': {
    permissions: [
      'tickets:purchase', 'tickets:view-own', 'tickets:transfer-own',
      'profile:update-own',
    ],
    venueScoped: false,
  },
  'admin': {
    permissions: ['*'],
    venueScoped: false,
  },
};

export async function setupAuthMiddleware(server: FastifyInstance) {
  // Register JWT plugin
  const jwtPlugin = fastifyJwt as any;

  await server.register(jwtPlugin, {
    secret: config.jwt.accessSecret,
    sign: {
      algorithm: 'HS256',
      expiresIn: config.jwt.accessTokenExpiry,
      issuer: config.jwt.issuer,
    },
    verify: {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
    },
  });

  // Decorate with authentication method
  server.decorate('authenticate', async (request: FastifyRequest) => {
    const logger = createRequestLogger(request.id);

    try {
      // Extract token from header
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid authorization header');
      }

      const token = authHeader.substring(7);

      // Check if token is blacklisted
      const isBlacklisted = await server.redis.get(`${REDIS_KEYS.SESSION}blacklist:${token}`);
      if (isBlacklisted) {
        logSecurityEvent('blacklisted_token_usage', {
          requestId: request.id,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        }, 'high');
        throw new AuthenticationError('Token has been revoked');
      }

      // Verify JWT
      const decoded = await request.jwtVerify() as JWTPayload;

      // Validate token type
      if (decoded.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }

      // Validate tenant_id is present
      if (!decoded.tenant_id) {
        logSecurityEvent('token_missing_tenant', {
          userId: decoded.sub,
          requestId: request.id,
          ip: request.ip,
        }, 'high');
        throw new AuthenticationError('Invalid token - missing tenant context');
      }

      // Get user details from cache or service
      const user = await getUserDetails(server, decoded.sub);
      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Attach user to request with tenant_id from JWT
      request.user = {
        id: user.id,
        email: user.email,
        role: user.role || decoded.role,
        tenant_id: decoded.tenant_id,  // Always from JWT, never from headers
        permissions: decoded.permissions || getUserPermissions(user.role),
        venueId: user.venueId,
        metadata: user.metadata,
      };

      logger.info({
        userId: user.id,
        tenantId: decoded.tenant_id,
        role: user.role,
        venueId: user.venueId,
      }, 'User authenticated successfully');

    } catch (error) {
      logger.warn({
        error: (error as any).message,
        ip: request.ip,
        path: request.url,
      }, 'Authentication failed');

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError('Invalid or expired token');
    }
  });

  // Create a requirePermission function
  (server as any).requirePermission = (permission: string) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const logger = createRequestLogger(request.id);

      // First authenticate
      await server.authenticate(request);

      const user = request.user!;

      // Check if user has the required permission
      if (!hasPermission(user, permission, request)) {
        logger.warn({
          userId: user.id,
          role: user.role,
          requiredPermission: permission,
          userPermissions: user.permissions,
        }, 'Authorization failed - insufficient permissions');

        logSecurityEvent('unauthorized_access_attempt', {
          userId: user.id,
          permission,
          path: request.url,
          venueId: request.headers['x-venue-id'],
        }, 'medium');

        throw new AuthorizationError(`Insufficient permissions: ${permission} required`);
      }

      // Check venue scope if applicable
      const params = request.params as Record<string, string>;
      const venueId = params.venueId || request.headers['x-venue-id'] as string;

      if (venueId && RBAC_CONFIG[user.role].venueScoped) {
        const hasVenueAccess = await checkVenueAccess(server, user.id, venueId, permission);

        if (!hasVenueAccess) {
          logger.warn({
            userId: user.id,
            venueId,
            permission,
          }, 'Venue access denied');

          throw new AuthorizationError('Access denied to this venue');
        }
      }

      logger.info({
        userId: user.id,
        permission,
        venueId,
      }, 'Authorization successful');
    };
  };
}

// Helper function to get user details with caching
async function getUserDetails(server: FastifyInstance, userId: string): Promise<any> {
  const cacheKey = `${REDIS_KEYS.CACHE_VENUE}user:${userId}`;

  // Check cache first
  const cached = await server.redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from auth service
  const authClient = new AuthServiceClient(server);
  const user = await authClient.getUserById(userId);

  if (!user) {
    // User not found or service unavailable
    return null;
  }

  // Cache for 5 minutes
  await server.redis.setex(cacheKey, REDIS_TTL.CACHE_MEDIUM, JSON.stringify(user));

  return user;
}

// Get permissions for a role
function getUserPermissions(role: UserRole): string[] {
  const roleConfig = RBAC_CONFIG[role];
  if (!roleConfig) {
    return [];
  }

  if (roleConfig.permissions.includes('*')) {
    return ['*'];
  }

  return roleConfig.permissions;
}

// Check if user has permission
function hasPermission(user: AuthUser, requiredPermission: string, request: FastifyRequest): boolean {
  // Admin bypass
  if (user.permissions.includes('*')) {
    return true;
  }

  // Check exact permission
  if (user.permissions.includes(requiredPermission)) {
    return true;
  }

  // Check wildcard permissions
  const [resource, action] = requiredPermission.split(':');
  if (user.permissions.includes(`${resource}:*`)) {
    return true;
  }

  // Check ownership permissions
  if (action?.endsWith('-own')) {
    const basePermission = requiredPermission.replace('-own', '');
    const body = request.body as Record<string, any>;
    const params = request.params as Record<string, string>;
    const ownerId = body?.userId || params?.userId;

    if (user.permissions.includes(basePermission) && ownerId === user.id) {
      return true;
    }
  }

  return false;
}

// Check venue access
async function checkVenueAccess(
  server: FastifyInstance,
  userId: string,
  venueId: string,
  permission: string
): Promise<boolean> {
  // Check cache first for venue access
  const cacheKey = `${REDIS_KEYS.CACHE_VENUE}access:${userId}:${venueId}:${permission}`;
  const cached = await server.redis.get(cacheKey);
  if (cached) {
    return cached === 'true';
  }

  // Check with venue service
  const venueClient = new VenueServiceClient(server);
  const hasAccess = await venueClient.checkUserVenueAccess(userId, venueId, permission);

  // Cache for 10 minutes
  await server.redis.setex(cacheKey, 600, hasAccess ? 'true' : 'false');

  return hasAccess;
}

// Token refresh handler
export async function handleTokenRefresh(
  server: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const logger = createRequestLogger(request.id);

  try {
    const { refreshToken } = request.body as { refreshToken: string };

    if (!refreshToken) {
      throw new AuthenticationError('Refresh token required');
    }

    // Verify refresh token with separate secret
    let decoded: JWTPayload;
    try {
      decoded = server.jwt.verify(refreshToken, {
        algorithms: ['HS256']
      }) as JWTPayload;
    } catch (err) {
      throw new AuthenticationError('Invalid refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new AuthenticationError('Invalid token type');
    }

    // Check if refresh token is valid
    const storedData = await server.redis.get(`${REDIS_KEYS.REFRESH_TOKEN}${decoded.jti}`);
    if (!storedData) {
      logSecurityEvent('refresh_token_reuse', {
        userId: decoded.sub,
        family: decoded.family,
        ip: request.ip,
      }, 'critical');

      throw new AuthenticationError('Invalid refresh token');
    }

    // Generate new token pair with tenant_id
    const user = await getUserDetails(server, decoded.sub);

    const newAccessToken = server.jwt.sign({
      sub: user.id,
      type: 'access',
      tenant_id: decoded.tenant_id,  // Preserve tenant_id
      permissions: getUserPermissions(user.role),
      role: user.role,
    } as JWTPayload);

    const newJti = nanoid();
    const newRefreshToken = server.jwt.sign({
      sub: user.id,
      type: 'refresh',
      tenant_id: decoded.tenant_id,  // Preserve tenant_id
      jti: newJti,
      family: decoded.family,
    } as JWTPayload, {
      expiresIn: config.jwt.refreshTokenExpiry,
    });

    // Invalidate old refresh token
    await server.redis.del(`${REDIS_KEYS.REFRESH_TOKEN}${decoded.jti}`);

    // Store new refresh token
    await server.redis.setex(
      `${REDIS_KEYS.REFRESH_TOKEN}${newJti}`,
      REDIS_TTL.REFRESH_TOKEN,
      JSON.stringify({
        userId: user.id,
        tenantId: decoded.tenant_id,
        family: decoded.family,
        createdAt: Date.now(),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      })
    );

    logger.info({
      userId: user.id,
      tenantId: decoded.tenant_id,
      tokenFamily: decoded.family,
    }, 'Token refreshed successfully');

    return reply.code(200).send({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });

  } catch (error) {
    logger.error({
      error: (error as any).message,
      ip: request.ip,
    }, 'Token refresh failed');

    throw new AuthenticationError('Invalid refresh token');
  }
}
