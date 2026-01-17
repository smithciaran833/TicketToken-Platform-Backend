import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { createRequestLogger, logSecurityEvent } from '../utils/logger';
import { AuthorizationError, NotFoundError, AuthUser } from '../types';
import { REDIS_KEYS, REDIS_TTL } from '../config/redis';

export async function setupVenueIsolationMiddleware(server: FastifyInstance) {
  // Venue isolation middleware
  server.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip for non-venue routes
    const publicRoutes = ['/health', '/ready', '/metrics', '/api/v1/auth'];
    if (publicRoutes.some(route => request.url.startsWith(route))) {
      return;
    }

    const requestedVenueId = extractVenueId(request);
    if (!requestedVenueId) {
      return; // Some endpoints don't require venue context
    }

    // Get user's venue access
    const user = request.user as AuthUser | undefined;
    if (!user) {
      return; // Auth middleware will handle this
    }

    const accessResult = await checkUserVenueAccess(server, user.id, requestedVenueId);
    if (!accessResult.hasAccess) {
      // Log security violation
      await logSecurityViolation({
        userId: user.id,
        attemptedVenueId: requestedVenueId,
        userVenues: user.venueId ? [user.venueId] : [],
        endpoint: request.url,
        method: request.method,
        ip: request.ip,
      });

      // Don't reveal venue existence
      throw new NotFoundError('Venue');
    }

    // Log admin bypass for audit trail
    if (accessResult.isAdminBypass) {
      await logSecurityEvent('admin_venue_bypass', {
        userId: user.id,
        userRole: 'admin',
        venueId: requestedVenueId,
        endpoint: request.url,
        method: request.method,
        ip: request.ip,
      }, 'medium');
    }

    // Inject venue context for downstream use
    request.venueContext = {
      venueId: requestedVenueId,
      userId: user.id,
      role: user.role,
      permissions: user.permissions || []
    };

    // NOTE: PostgreSQL RLS context (SET LOCAL app.current_venue_id) is NOT set here.
    // The API Gateway is a stateless proxy with no database connection.
    // RLS context is set by downstream services that have DB connections.
    // The gateway passes tenant context via x-tenant-id header (set in authenticated-proxy.ts).
  });

  // API key venue validation
  server.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
      return;
    }

    const requestedResource = request.url;
    const isValid = await validateAPIKeyVenueAccess(server, apiKey, requestedResource);

    if (!isValid) {
      throw new AuthorizationError('API key does not have access to this venue');
    }
  });
}

// Check user's venue access - returns whether access was via admin bypass
async function checkUserVenueAccess(
  server: FastifyInstance,
  userId: string,
  venueId: string
): Promise<{ hasAccess: boolean; isAdminBypass: boolean }> {
  // Check cache first
  const cacheKey = `${REDIS_KEYS.CACHE_VENUE}access:${userId}:${venueId}`;
  const cached = await server.redis.get(cacheKey);

  if (cached) {
    // Cache stores "true", "false", or "admin"
    return {
      hasAccess: cached === 'true' || cached === 'admin',
      isAdminBypass: cached === 'admin'
    };
  }

  // Check user data from session cache
  const user = await server.redis.get(`${REDIS_KEYS.SESSION}user:${userId}`);
  if (!user) {
    return { hasAccess: false, isAdminBypass: false };
  }

  const userData = JSON.parse(user);

  // Check if admin bypass
  if (userData.role === 'admin') {
    // Cache as admin bypass
    await server.redis.setex(cacheKey, REDIS_TTL.CACHE_MEDIUM, 'admin');
    return { hasAccess: true, isAdminBypass: true };
  }

  // Check venue membership
  const hasAccess = userData.venueId === venueId;

  // Cache result
  await server.redis.setex(cacheKey, REDIS_TTL.CACHE_MEDIUM, hasAccess.toString());

  return { hasAccess, isAdminBypass: false };
}

// Extract venue ID from TRUSTED sources only
// SECURITY: Never extract from request body or untrusted headers
function extractVenueId(request: FastifyRequest): string | null {
  // Priority order (trusted sources only):

  // 1. Route parameter (from URL path - trusted)
  const params = request.params as Record<string, string>;
  const routeVenueId = params?.venueId;
  if (routeVenueId) return routeVenueId;

  // 2. Query parameter (visible in URL - acceptable for reads)
  const query = request.query as Record<string, string>;
  const queryVenueId = query?.venueId;
  if (queryVenueId) return queryVenueId;

  // 3. User's venue from JWT (verified token - trusted)
  const user = request.user as AuthUser | undefined;
  if (user?.venueId) {
    return user.venueId;
  }

  // REMOVED: request.body?.venueId - untrusted, attacker controlled
  // REMOVED: request.headers['x-venue-id'] - untrusted, attacker controlled

  return null;
}

// Log security violations
async function logSecurityViolation(violation: any) {
  const logger = createRequestLogger('venue-isolation');

  logger.error({
    violation,
  }, 'Venue access violation detected');

  await logSecurityEvent('venue_access_violation', violation, 'high');
}

// Check if user has access to perform action on venue
export async function checkVenuePermission(
  server: FastifyInstance,
  userId: string,
  venueId: string,
  permission: string
): Promise<boolean> {
  const user = await server.redis.get(`${REDIS_KEYS.SESSION}user:${userId}`);
  if (!user) {
    return false;
  }

  const userData = JSON.parse(user);

  // Admin bypass with audit logging
  if (userData.role === 'admin') {
    await logSecurityEvent('admin_permission_bypass', {
      userId,
      venueId,
      permission,
      userRole: 'admin',
    }, 'low');
    return true;
  }

  // Check venue membership
  if (userData.venueId !== venueId) {
    return false;
  }

  // Check permission based on role
  const rolePermissions: Record<string, string[]> = {
    'venue-owner': ['*'],
    'venue-manager': ['events:*', 'tickets:view', 'reports:*'],
    'box-office': ['tickets:*', 'payments:process'],
    'door-staff': ['tickets:validate'],
  };

  const permissions = rolePermissions[userData.role] || [];

  if (permissions.includes('*')) {
    return true;
  }

  if (permissions.includes(permission)) {
    return true;
  }

  // Check wildcard permissions
  const [resource] = permission.split(':');
  if (permissions.includes(`${resource}:*`)) {
    return true;
  }

  return false;
}

// Get user's venues
export async function getUserVenues(
  server: FastifyInstance,
  userId: string
): Promise<string[]> {
  const user = await server.redis.get(`${REDIS_KEYS.SESSION}user:${userId}`);
  if (!user) {
    return [];
  }

  const userData = JSON.parse(user);
  return userData.venueId ? [userData.venueId] : [];
}

// Check venue tier access
export function checkVenueTierAccess(
  currentTier: string,
  requiredTier: string
): boolean {
  const tierHierarchy: Record<string, number> = {
    free: 0,
    standard: 1,
    premium: 2,
  };

  return tierHierarchy[currentTier] >= tierHierarchy[requiredTier];
}

// API namespace isolation for venue APIs
export async function validateAPIKeyVenueAccess(
  server: FastifyInstance,
  apiKey: string,
  requestedResource: string
): Promise<boolean> {
  // Get API key data
  const keyData = await server.redis.get(`api:key:${apiKey}`);

  if (!keyData) {
    return false;
  }

  const { venueId } = JSON.parse(keyData);

  // Extract venue from resource
  const resourceVenue = extractVenueFromResource(requestedResource);

  if (!resourceVenue) {
    return true; // Non-venue specific resource
  }

  if (venueId !== resourceVenue) {
    // Log cross-venue attempt
    await logSecurityEvent('cross_venue_api_attempt', {
      apiKey: apiKey.substring(0, 10) + '...',
      authorizedVenue: venueId,
      attemptedVenue: resourceVenue,
      resource: requestedResource,
    }, 'critical');

    return false;
  }

  return true;
}

// Extract venue ID from resource path
function extractVenueFromResource(resource: string): string | null {
  const venuePattern = /\/venues\/([a-z0-9-]+)/i;
  const match = resource.match(venuePattern);
  return match ? match[1] : null;
}

// Venue-specific rate limiting
export async function getVenueRateLimit(
  server: FastifyInstance,
  venueId: string
): Promise<number> {
  const venueData = await server.redis.get(`${REDIS_KEYS.CACHE_VENUE}${venueId}`);

  if (!venueData) {
    return config.rateLimit.global.max;
  }

  const venue = JSON.parse(venueData);
  const tierMultipliers: Record<string, number> = {
    premium: 10,
    standard: 5,
    free: 1,
  };

  return config.rateLimit.global.max * (tierMultipliers[venue.tier] || 1);
}
