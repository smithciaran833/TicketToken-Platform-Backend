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

    const hasAccess = await checkUserVenueAccess(server, user.id, requestedVenueId);
    if (!hasAccess) {
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

    // Inject venue context
    request.venueContext = {
      venueId: requestedVenueId,
      userId: user.id,
      role: user.role,
      permissions: user.permissions || []
    };

    // TODO: Set PostgreSQL row-level security context when DB is available
    // if (server.db) {
    //   await server.db.query('SET LOCAL app.current_venue_id = $1', [requestedVenueId]);
    //   await server.db.query('SET LOCAL app.current_user_id = $1', [user.id]);
    // }
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

// Check user's venue access
async function checkUserVenueAccess(
  server: FastifyInstance,
  userId: string,
  venueId: string
): Promise<boolean> {
  // Check cache first
  const cacheKey = `${REDIS_KEYS.CACHE_VENUE}access:${userId}:${venueId}`;
  const cached = await server.redis.get(cacheKey);
  
  if (cached) {
    return cached === 'true';
  }

  // TODO: Check with venue service
  // For now, allow access if user's venueId matches
  const user = await server.redis.get(`${REDIS_KEYS.SESSION}user:${userId}`);
  if (!user) {
    return false;
  }

  const userData = JSON.parse(user);
  const hasAccess = userData.venueId === venueId || userData.role === 'admin';

  // Cache result
  await server.redis.setex(cacheKey, REDIS_TTL.CACHE_MEDIUM, hasAccess.toString());

  return hasAccess;
}

// Extract venue ID from various sources
function extractVenueId(request: FastifyRequest): string | null {
  // Priority order:
  // 1. Route parameter
  const params = request.params as Record<string, string>;
  const routeVenueId = params?.venueId;
  if (routeVenueId) return routeVenueId;

  // 2. Query parameter
  const query = request.query as Record<string, string>;
  const queryVenueId = query?.venueId;
  if (queryVenueId) return queryVenueId;

  // 3. Request body
  const body = request.body as Record<string, any>;
  const bodyVenueId = body?.venueId;
  if (bodyVenueId) return bodyVenueId;

  // 4. Header (for API key requests)
  const headerVenueId = request.headers['x-venue-id'];
  if (headerVenueId && typeof headerVenueId === 'string') return headerVenueId;

  // 5. User's default venue
  const user = request.user as AuthUser | undefined;
  if (user?.venueId) {
    return user.venueId;
  }

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
  // Admin bypass
  const user = await server.redis.get(`${REDIS_KEYS.SESSION}user:${userId}`);
  if (!user) {
    return false;
  }

  const userData = JSON.parse(user);
  if (userData.role === 'admin') {
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
  // TODO: Implement with venue service
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
  const venuePattern = /\/venues\/([a-f0-9-]+)/;
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
