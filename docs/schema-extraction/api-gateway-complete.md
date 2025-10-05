# COMPLETE DATABASE ANALYSIS: api-gateway
Generated: Thu Oct  2 15:07:47 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/authenticated-proxy.ts
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

interface ProxyOptions {
  serviceUrl: string;
  serviceName: string;
  publicPaths?: string[];
  timeout?: number;
}

// Headers that should never be forwarded to backend services
const BLOCKED_HEADERS = [
  'x-internal-service',
  'x-internal-signature',
  'x-internal-key',
  'x-admin-token',
  'x-privileged',
  'x-tenant-id',  // Block external tenant headers - must come from JWT
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'expect',
  'proxy-authenticate',
  'proxy-authorization',
  'www-authenticate',
  'te'
];

// Headers that are allowed to pass through
const ALLOWED_HEADERS = [
  'accept',
  'accept-language',
  'accept-encoding',
  'authorization',
  'content-type',
  'user-agent',
  'referer',
  'origin',
  'x-request-id',
  'x-correlation-id',
  // Removed x-tenant-id from allowed list
  'x-api-key',
  'idempotency-key'
];

function filterHeaders(headers: any): any {
  const filtered: any = {};

  // Only forward allowed headers
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    // Skip blocked headers (including x-tenant-id)
    if (BLOCKED_HEADERS.includes(lowerKey)) {
      continue;
    }

    // Only allow specific headers
    if (ALLOWED_HEADERS.includes(lowerKey) || lowerKey.startsWith('x-custom-')) {
      filtered[key] = value;
    }
  }

  return filtered;
}

export function createAuthenticatedProxy(server: FastifyInstance, options: ProxyOptions) {
  const { serviceUrl, serviceName, publicPaths = [], timeout = 5000 } = options;

  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply, path: string = '') => {
    try {
      const targetUrl = path ? `${serviceUrl}/${path}` : serviceUrl;

      // Filter headers before forwarding
      const filteredHeaders = filterHeaders(request.headers);

      // Add service identification for internal requests
      filteredHeaders['x-gateway-forwarded'] = 'true';
      filteredHeaders['x-original-ip'] = request.ip;

      // Extract tenant_id from JWT and add as internal header
      // This is secure because it comes from the verified JWT, not from the client
      if (request.user) {
        const user = request.user as any;
        if (user.tenant_id) {
          filteredHeaders['x-tenant-id'] = user.tenant_id;
          filteredHeaders['x-tenant-source'] = 'jwt';  // Mark that this came from JWT
        }
      }

      const response = await axios({
        method: request.method as any,
        url: targetUrl,
        headers: filteredHeaders,
        data: request.body,
        params: request.query,
        timeout: timeout,
        maxRedirects: 0,
        validateStatus: () => true,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      // Filter response headers too
      const responseHeaders: any = {};
      for (const [key, value] of Object.entries(response.headers)) {
        const lowerKey = key.toLowerCase();
        // Don't forward internal response headers
        if (!lowerKey.startsWith('x-internal-') && !BLOCKED_HEADERS.includes(lowerKey)) {
          responseHeaders[key] = value;
        }
      }

      return reply
        .code(response.status)
        .headers(responseHeaders)
        .send(response.data);

    } catch (error: any) {
      server.log.error({
        error: error.message,
        code: error.code,
        service: serviceName,
        url: path
      }, `Proxy error to ${serviceName}`);

      // Handle specific error types
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return reply.code(504).send({
          error: 'Gateway Timeout',
          message: `${serviceName} service timeout after ${timeout}ms`
        });
      }

      if (error.code === 'ECONNREFUSED') {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: `${serviceName} service is down`
        });
      }

      return reply.code(502).send({
        error: 'Bad Gateway',
        message: `${serviceName} service error: ${error.message}`
      });
    }
  };

  return async function setupRoutes(server: FastifyInstance) {
    // Handle base route
    server.all('/', {
      preHandler: async (request, _reply) => {
        const path = request.url.replace(/\?.*$/, '');
        if (!publicPaths.some(p => path.endsWith(p))) {
          await (server as any).authenticate(request);
        }
      }
    }, async (request, reply) => {
      return proxyHandler(request, reply, '');
    });

    // Handle wildcard routes
    server.all('/*', {
      preHandler: async (request, _reply) => {
        const wildcardPath = (request.params as any)['*'] || '';
        const fullPath = '/' + wildcardPath;

        // Check if this is a public path
        const isPublic = publicPaths.some(publicPath => {
          if (publicPath.includes('*')) {
            const regex = new RegExp('^' + publicPath.replace('*', '.*') + '$');
            return regex.test(fullPath);
          }
          return fullPath === publicPath || fullPath.startsWith(publicPath + '/');
        });

        if (!isPublic) {
          await (server as any).authenticate(request);
        }
      }
    }, async (request, reply) => {
      const wildcardPath = (request.params as any)['*'] || '';
      return proxyHandler(request, reply, wildcardPath);
    });
  };
}
```

### FILE: src/routes/webhook.routes.ts
```typescript
import { serviceUrls } from '../config/services';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

// Extend FastifyRequest to include rawBody
interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

export default async function webhookRoutes(server: FastifyInstance) {
  // Special handler for Stripe webhooks that preserves raw body
  const handleStripeWebhook = async (request: RawBodyRequest, reply: FastifyReply) => {
    try {
      // Get the raw body buffer
      const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
      
      // Preserve critical headers exactly as received
      const headers: any = {
        'stripe-signature': request.headers['stripe-signature'],
        'stripe-webhook-id': request.headers['stripe-webhook-id'],
        'content-type': request.headers['content-type'] || 'application/json',
        'content-length': Buffer.byteLength(rawBody).toString(),
        'x-forwarded-for': request.ip,
        'x-original-host': request.headers['host']
      };

      // Remove undefined headers
      Object.keys(headers).forEach(key => 
        headers[key] === undefined && delete headers[key]
      );

      // Forward to payment service with raw body
      const response = await axios({
        method: 'POST',
        url: `${serviceUrls.payment}/api/v1/webhooks/stripe`,
        data: rawBody,
        headers,
        timeout: 10000, // 10 second timeout for webhooks
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
        // Tell axios not to transform the data
        transformRequest: [(data) => data],
        // Raw response
        responseType: 'json'
      });

      return reply
        .code(response.status)
        .send(response.data);

    } catch (error: any) {
      server.log.error({ 
        error: error.message,
        code: error.code,
        path: '/webhooks/stripe'
      }, 'Stripe webhook proxy error');
      
      // Return 500 so Stripe will retry
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to process webhook'
      });
    }
  };

  // Stripe webhook endpoint - no auth, raw body preserved
  server.post('/stripe', {
    config: {
      rawBody: true
    }
  }, handleStripeWebhook);

  // Generic webhook endpoint for other providers (standard JSON parsing)
  server.all('/*', async (request, reply) => {
    const wildcardPath = (request.params as any)['*'] || '';
    
    try {
      const response = await axios({
        method: request.method as any,
        url: `${serviceUrls.payment}/api/v1/webhooks/${wildcardPath}`,
        data: request.body,
        headers: {
          'content-type': request.headers['content-type'],
          'x-forwarded-for': request.ip
        },
        timeout: 10000,
        validateStatus: () => true
      });

      return reply
        .code(response.status)
        .headers(response.headers as any)
        .send(response.data);
        
    } catch (error: any) {
      server.log.error({ error: error.message }, 'Webhook proxy error');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Webhook processing failed'
      });
    }
  });
}
```

### FILE: src/routes/search.routes.schema.ts
```typescript
export const searchSchemas = {
  globalSearch: {
    tags: ['search'],
    summary: 'Global search across all entities',
    description: 'Search venues, events, tickets, and marketplace listings',
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Search query' },
        type: { type: 'string', enum: ['venues', 'events', 'tickets', 'marketplace'] },
        limit: { type: 'number', default: 20 },
        page: { type: 'number', default: 1 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          total: { type: 'number' },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                id: { type: 'string' },
                score: { type: 'number' },
                data: { type: 'object' }
              }
            }
          }
        }
      }
    }
  },
  
  autocomplete: {
    tags: ['search'],
    summary: 'Autocomplete suggestions',
    description: 'Get search suggestions as you type',
    querystring: {
      type: 'object',
      required: ['q'],
      properties: {
        q: { type: 'string', description: 'Partial search query (min 2 chars)' }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }
};
```

### FILE: src/utils/security.ts
```typescript
import crypto from 'crypto';
import { FastifyRequest } from 'fastify';

// Input sanitization
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove null bytes
    input = input.replace(/\0/g, '');
    
    // Trim whitespace
    input = input.trim();
    
    // Prevent script injection
    input = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Escape HTML entities
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };
    
    input = input.replace(/[&<>"'/]/g, (match: string) => htmlEntities[match]);
  } else if (typeof input === 'object' && input !== null) {
    // Recursively sanitize objects
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        input[key] = sanitizeInput(input[key]);
      }
    }
  }
  
  return input;
}

// SQL injection prevention
export function escapeSqlIdentifier(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}

// API key generation
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Request signature validation
export function validateRequestSignature(
  request: FastifyRequest,
  secret: string
): boolean {
  const signature = request.headers['x-signature'] as string;
  if (!signature) return false;

  const timestamp = request.headers['x-timestamp'] as string;
  if (!timestamp) return false;

  // Check timestamp is within 5 minutes
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(now - requestTime) > 300000) {
    return false;
  }

  // Recreate signature
  const payload = `${timestamp}.${JSON.stringify(request.body)}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Rate limit key generation with IP anonymization
export function generateRateLimitKey(request: FastifyRequest): string {
  const ip = request.ip;
  const userId = request.user?.id;
  
  if (userId) {
    return `user:${userId}`;
  }
  
  // Anonymize IP for privacy
  const hashedIp = crypto
    .createHash('sha256')
    .update(ip + process.env.IP_SALT || 'default-salt')
    .digest('hex')
    .substring(0, 16);
  
  return `ip:${hashedIp}`;
}

// CSRF token generation
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateCsrfToken(token: string, sessionToken: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(sessionToken)
  );
}
```

### FILE: src/middleware/cors.middleware.ts
```typescript
import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('cors-middleware');

export async function setupCorsMiddleware(server: FastifyInstance) {
  await server.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, Postman, curl)
      if (!origin) {
        return callback(null, true);
      }
      
      // For development, allow all localhost origins
      if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      const allowedOrigins = config.cors.origin;
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      logger.warn({ origin }, 'Blocked by CORS policy');
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-Key',
      'X-Request-ID',
      'X-Venue-ID',
      'X-Venue-Tier',
      'X-Idempotency-Key',
      'X-Forwarded-For',
      'X-Real-IP',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
      'Location',
    ],
  });

  logger.info('CORS middleware configured');
}
```

### FILE: src/middleware/auth.middleware.ts
```typescript
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

  // TODO: Fetch from auth service when implemented
  // For now, return mock data
  const user = {
    id: userId,
    email: `user${userId}@tickettoken.com`,
    role: 'customer' as UserRole,
    venueId: null,
    metadata: {},
  };

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
  _server: FastifyInstance,
  _userId: string,
  _venueId: string,
  _permission: string
): Promise<boolean> {
  // TODO: Implement proper venue access check with venue service
  return true;
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
```

### FILE: src/middleware/validation.middleware.ts
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Joi from 'joi';
import { ValidationError } from '../types';

// Common validation schemas
export const commonSchemas = {
  // UUID validation
  uuid: Joi.string().uuid({ version: 'uuidv4' }).required(),
  
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  }),

  // Venue ID
  venueId: Joi.string().uuid({ version: 'uuidv4' }).required(),

  // Event ID
  eventId: Joi.string().uuid({ version: 'uuidv4' }).required(),

  // Ticket purchase
  ticketPurchase: Joi.object({
    eventId: Joi.string().uuid().required(),
    items: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        price: Joi.number().positive().required()
      })
    ).min(1).required()
  }),

  // Date range
  dateRange: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  }),

  // Price
  price: Joi.number().positive().precision(2).required(),

  // Email
  email: Joi.string().email().lowercase().trim().required(),

  // Phone
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
};

// Validation middleware factory
export function validateRequest(schema: {
  body?: Joi.Schema;
  query?: Joi.Schema;
  params?: Joi.Schema;
  headers?: Joi.Schema;
}) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    // Validate each part of the request
    if (schema.body) {
      try {
        const validated = await (schema.body as any).validateAsync(request.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        request.body = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Body validation failed', error.details);
        }
        throw error;
      }
    }

    if (schema.query) {
      try {
        const validated = await schema.query.validateAsync(request.query, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        request.query = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Query validation failed', error.details);
        }
        throw error;
      }
    }

    if (schema.params) {
      try {
        const validated = await schema.params.validateAsync(request.params, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        request.params = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Params validation failed', error.details);
        }
        throw error;
      }
    }

    if (schema.headers) {
      try {
        const validated = await schema.headers.validateAsync(request.headers, {
          abortEarly: false,
          stripUnknown: false, // Don't strip headers
          convert: true,
        });
        Object.assign(request.headers, validated);
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Headers validation failed', error.details);
        }
        throw error;
      }
    }
  };
}

export async function setupValidationMiddleware(server: FastifyInstance) {
  // Add schema compiler for route schemas
  server.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip validation for certain routes
    if (request.url.startsWith('/health') || request.url.startsWith('/metrics')) {
      return;
    }

    // Only validate if routeSchema exists and has Joi schemas
    const schema = request.routeOptions?.schema;
    if (schema && schema.body && schema.body && (schema.body as any).validateAsync && typeof (schema.body as any).validateAsync === 'function') {
      try {
        const validated = await (schema.body as any).validateAsync(request.body, {
          abortEarly: false,
          stripUnknown: true,
          convert: true,
        });
        // Replace request body with validated data
        request.body = validated;
      } catch (err) {
        const error = err as any;
        if (error.isJoi) {
          throw new ValidationError('Validation failed', error.details);
        }
        throw error;
      }
    }
  });

  // Add common validators
  server.decorate('validators', commonSchemas);
}

// Specific validators for TicketToken

export const venueValidators = {
  createVenue: Joi.object({
    name: Joi.string().min(3).max(100).required(),
    address: Joi.object({
      street: Joi.string().required(),
      city: Joi.string().required(),
      state: Joi.string().required(),
      country: Joi.string().required(),
      postalCode: Joi.string().required(),
    }).required(),
    capacity: Joi.number().integer().min(1).required(),
    contactEmail: commonSchemas.email,
    contactPhone: commonSchemas.phone,
    tier: Joi.string().valid('free', 'standard', 'premium').default('free'),
  }),

  updateVenue: Joi.object({
    name: Joi.string().min(3).max(100).optional(),
    address: Joi.object({
      street: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      country: Joi.string().optional(),
      postalCode: Joi.string().optional(),
    }).optional(),
    capacity: Joi.number().integer().min(1).optional(),
    contactEmail: Joi.string().email().optional(),
    contactPhone: commonSchemas.phone,
  }),
};

export const eventValidators = {
  createEvent: Joi.object({
    venueId: commonSchemas.venueId,
    name: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(2000).optional(),
    startDate: Joi.date().iso().min('now').required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
    category: Joi.string().valid('concert', 'sports', 'theater', 'conference', 'other').required(),
    ticketTiers: Joi.array().items(
      Joi.object({
        name: Joi.string().required(),
        price: commonSchemas.price,
        quantity: Joi.number().integer().min(1).required(),
        description: Joi.string().optional(),
      })
    ).min(1).required(),
    nftEnabled: Joi.boolean().default(true),
    marketplaceEnabled: Joi.boolean().default(true),
  }),

  updateEvent: Joi.object({
    name: Joi.string().min(3).max(200).optional(),
    description: Joi.string().max(2000).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    status: Joi.string().valid('draft', 'published', 'sold_out', 'cancelled').optional(),
  }),
};

export const ticketValidators = {
  purchaseTickets: commonSchemas.ticketPurchase,

  validateTicket: Joi.object({
    ticketId: Joi.string().uuid().required(),
    scannerDeviceId: Joi.string().optional(),
    entrance: Joi.string().optional(),
  }),
};

export const marketplaceValidators = {
  createListing: Joi.object({
    ticketId: Joi.string().uuid().required(),
    price: commonSchemas.price,
    expiresAt: Joi.date().iso().min('now').optional(),
  }),

  purchaseListing: Joi.object({
    listingId: Joi.string().uuid().required(),
    paymentMethodId: Joi.string().required(),
  }),
};

// Helper to format validation errors
export function formatValidationErrors(errors: any[]): any[] {
  return errors.map(error => ({
    field: error.path.join('.'),
    message: error.message,
    type: error.type,
  }));
}
```

### FILE: src/middleware/error-handler.middleware.ts
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { createRequestLogger, logError } from '../utils/logger';
import { ApiError } from '../types';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: any;
  requestId: string;
  timestamp: string;
}

export async function setupErrorHandler(server: FastifyInstance) {
  server.setErrorHandler(async (error: FastifyError | ApiError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const logger = createRequestLogger(request.id, request.headers['x-venue-id'] as string);

    // Default error response
    let response: ErrorResponse = {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    // Handle different error types
    if (error instanceof ApiError) {
      // Custom API errors
      response = {
        statusCode: (error as any).statusCode,
        error: error.name,
        message: (error as any).message,
        code: error.code,
        details: process.env.NODE_ENV !== 'production' ? error.details : undefined,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

      logger.warn({
        error: {
          name: error.name,
          message: (error as any).message,
          code: error.code,
          statusCode: (error as any).statusCode,
          stack: error.stack,
        },
        request: {
          method: request.method,
          url: request.url,
          params: request.params,
          query: request.query,
        },
      }, 'API error occurred');

    } else if ((error as any).validation) {
      // Fastify validation errors
      response = {
        statusCode: 422,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: process.env.NODE_ENV !== 'production' ? formatValidationErrors((error as any).validation) : undefined,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

      logger.warn({
        error: {
          validation: (error as any).validation,
        },
        request: {
          method: request.method,
          url: request.url,
          body: request.body,
        },
      }, 'Validation error occurred');

    } else if ((error as any).statusCode) {
      // Fastify errors
      response = {
        statusCode: (error as any).statusCode,
        error: (error as any).code || 'Error',
        message: (error as any).message,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

      // Log based on status code
      if ((error as any).statusCode >= 500) {
        logger.error({
          error: {
            message: (error as any).message,
            statusCode: (error as any).statusCode,
            stack: error.stack,
          },
        }, 'Server error occurred');
      } else {
        logger.warn({
          error: {
            message: (error as any).message,
            statusCode: (error as any).statusCode,
          },
        }, 'Client error occurred');
      }
    } else {
      // Unknown errors
      logError(error as Error, 'Unhandled error', {
        requestId: request.id,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
      });

      // Don't leak internal error details in production
      if (process.env.NODE_ENV === 'production') {
        response.message = 'An unexpected error occurred';
      } else {
        response.message = (error as Error).message;
        response.details = {
          stack: (error as Error).stack,
        };
      }
    }

    // Set appropriate headers
    reply.header('X-Request-ID', request.id);

    // Add retry headers for rate limit errors
    if (response.statusCode === 429 && response.details?.retryAfter) {
      reply.header('Retry-After', response.details.retryAfter.toString());
    }

    // Add cache headers to prevent caching errors
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // Send error response
    return reply.code(response.statusCode).send(response);
  });
}

// Helper to format validation errors
function formatValidationErrors(validation: any[]): any[] {
  return validation.map(error => ({
    field: error.dataPath || error.instancePath,
    message: error.message,
    params: error.params,
  }));
}

// Error recovery middleware for process-level errors
export function errorRecoveryMiddleware(server: FastifyInstance) {
  const logger = createRequestLogger('error-recovery');

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      reason,
      promise,
    }, 'Unhandled promise rejection');

    // In production, we might want to gracefully shutdown
    if (process.env.NODE_ENV === 'production') {
      // Give time for current requests to finish
      setTimeout(() => {
        process.exit(1);
      }, 30000);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({
      error: {
        message: error.message,
        stack: error.stack,
      },
    }, 'Uncaught exception');

    // Attempt graceful shutdown
    server.close(() => {
      process.exit(1);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      process.abort();
    }, 30000);
  });

  // Log warning for deprecations
  process.on('warning', (warning) => {
    logger.warn({
      warning: {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      },
    }, 'Node.js warning');
  });
}
```

### FILE: src/middleware/response-cache.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { createCache } from '@tickettoken/shared/cache/dist';

const cache = createCache({
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'gateway:',
  }
});

interface CacheConfig {
  ttl?: number;
  varyBy?: string[];
  condition?: (req: Request) => boolean;
}

const routeCacheConfig: Map<string, CacheConfig> = new Map([
  ['/api/events', { ttl: 600 }], // 10 minutes
  ['/api/venues', { ttl: 1800 }], // 30 minutes
  ['/api/tickets/availability', { ttl: 30 }], // 30 seconds
  ['/api/search', { ttl: 300, varyBy: ['q', 'category'] }], // 5 minutes
]);

export function responseCache() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if route should be cached
    const config = routeCacheConfig.get(req.path);
    if (!config) {
      return next();
    }

    // Check condition
    if (config.condition && !config.condition(req)) {
      return next();
    }

    // Generate cache key
    let cacheKey = `response:${req.path}`;
    if (config.varyBy) {
      const varies = config.varyBy.map(param => `${param}:${req.query[param] || ''}`).join(':');
      cacheKey += `:${varies}`;
    }

    // Try to get from cache
    const cached = await cache.service.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-TTL', config.ttl || '300');
      return res.json(cached);
    }

    // Cache miss - capture response
    const originalJson = res.json;
    res.json = function(data: any) {
      res.setHeader('X-Cache', 'MISS');
      
      // Store in cache if successful
      if (res.statusCode === 200) {
        cache.service.set(cacheKey, data, { 
          ttl: config.ttl || 300,
          level: 'BOTH'
        }).catch(err => console.error('Cache set error:', err));
      }
      
      return originalJson.call(this, data);
    };

    next();
  };
}

// Cache invalidation endpoint
export function cacheInvalidationRoutes(app: any) {
  app.post('/admin/cache/invalidate', async (req: Request, res: Response) => {
    const { patterns } = req.body;
    
    if (patterns && Array.isArray(patterns)) {
      for (const pattern of patterns) {
        await cache.service.delete(pattern);
      }
      res.json({ success: true, invalidated: patterns.length });
    } else {
      res.status(400).json({ error: 'patterns array required' });
    }
  });

  app.get('/admin/cache/stats', async (_req: Request, res: Response) => {
    const stats = cache.service.getStats();
    res.json(stats);
  });
}
```

### FILE: src/types/fastify.d.ts
```typescript
import 'fastify';
import { AuthUser, VenueContext, TimeoutBudget, ServiceContainer } from './index';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    services: ServiceContainer;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    user?: AuthUser;
    startTime?: number;
    rateLimitMax?: number;
    venueContext?: VenueContext;
    timeoutBudget?: TimeoutBudget;
    requestLogger?: any;
    routeSchema?: any;
  }

  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      type: 'access' | 'refresh';
      jti?: string;
      family?: string;
      permissions?: string[];
    };
    user: AuthUser;
  }
}

declare module '@fastify/jwt' {
  interface VerifyPayloadType {
    sub: string;
    type: 'access' | 'refresh';
    jti?: string;
    family?: string;
    permissions?: string[];
    [key: string]: any;
  }
}
```

### FILE: src/types/index.ts
```typescript
// User and authentication types
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;  // Added for multi-tenancy support
  permissions: string[];
  venueId?: string;
  metadata?: Record<string, any>;
}

export type UserRole =
  | 'venue-owner'
  | 'venue-manager'
  | 'box-office'
  | 'door-staff'
  | 'customer'
  | 'admin';

export interface VenueContext {
  venueId: string;
  userId: string;
  role: UserRole;
  permissions: string[];
}

// Service types
export interface ServiceContainer {
  proxyService: ProxyService;
  circuitBreakerService: CircuitBreakerService;
  loadBalancerService: LoadBalancerService;
  serviceDiscoveryService: ServiceDiscoveryService;
  aggregatorService: AggregatorService;
  retryService: RetryService;
  timeoutService: TimeoutService;
}

export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  healthy: boolean;
  metadata?: Record<string, any>;
}

export interface ProxyService {
  forward(request: any, service: string, options?: ProxyOptions): Promise<any>;
}

export interface ProxyOptions {
  timeout?: number;
  retries?: number;
  circuitBreaker?: boolean;
  fallback?: any;
}

export interface CircuitBreakerService {
  execute<T>(name: string, fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
  getState(name: string): CircuitBreakerState;
  getAllStats(): Record<string, any>;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface LoadBalancerService {
  selectInstance(service: string, instances: ServiceInstance[], strategy?: LoadBalancerStrategy): ServiceInstance;
}

export type LoadBalancerStrategy = 'round-robin' | 'least-connections' | 'random' | 'consistent-hash';

export interface ServiceDiscoveryService {
  discover(serviceName: string): Promise<ServiceInstance[]>;
  register(service: ServiceInstance): Promise<void>;
  deregister(serviceId: string): Promise<void>;
  getHealthyInstances(serviceName: string): Promise<ServiceInstance[]>;
  getServiceTopology(): Promise<Record<string, ServiceInstance[]>>;
}

export interface AggregatorService {
  aggregate(dataSources: DataSource[], request: any): Promise<any>;
  getEventDetails(eventId: string, request: any): Promise<any>;
  getUserDashboard(userId: string, request: any): Promise<any>;
}

export interface DataSource {
  name: string;
  service: string;
  endpoint: string;
  required: boolean;
  transform?: (data: any) => any;
  fallback?: any;
}

export interface RetryService {
  executeWithRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  multiplier?: number;
  jitter?: boolean;
  retryableErrors?: string[];
}

export interface TimeoutService {
  executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T>;
}

export interface TimeoutBudget {
  total: number;
  remaining: number;
  deadlineMs: number;
}

// Rate limiting types
export interface RateLimitConfig {
  max: number;
  timeWindow: number;
  blockDuration?: number;
  keyGenerator?: (request: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// Error types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(422, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed') {
    super(401, message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, message, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super(429, 'Too many requests', 'RATE_LIMIT_ERROR', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(service: string) {
    super(503, `Service unavailable: ${service}`, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

// Request/Response types
export interface PaginationQuery {
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset?: number;
    total?: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

// Venue types
export interface Venue {
  id: string;
  name: string;
  tier: 'free' | 'standard' | 'premium';
  settings: VenueSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface VenueSettings {
  timezone: string;
  currency: string;
  features: {
    nftEnabled: boolean;
    marketplaceEnabled: boolean;
    analyticsEnabled: boolean;
  };
}

// Event types
export interface Event {
  id: string;
  venueId: string;
  name: string;
  date: Date;
  status: 'draft' | 'published' | 'sold_out' | 'cancelled';
  ticketTypes: TicketType[];
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  available: number;
}

// Ticket types
export interface Ticket {
  id: string;
  eventId: string;
  ticketTypeId: string;
  status: 'available' | 'reserved' | 'sold' | 'used';
  nftTokenId?: string;
  nftContractAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Monitoring types
export interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    database?: 'ok' | 'error';
    redis?: 'ok' | 'error';
    services?: Record<string, 'ok' | 'error'>;
  };
}

export interface Metrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  activeConnections: number;
  queueDepth: Record<string, number>;
}
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/routes/authenticated-proxy.ts
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

interface ProxyOptions {
  serviceUrl: string;
  serviceName: string;
  publicPaths?: string[];
  timeout?: number;
}

// Headers that should never be forwarded to backend services
const BLOCKED_HEADERS = [
  'x-internal-service',
  'x-internal-signature',
  'x-internal-key',
  'x-admin-token',
  'x-privileged',
  'x-tenant-id',  // Block external tenant headers - must come from JWT
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-real-ip',
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'expect',
  'proxy-authenticate',
  'proxy-authorization',
  'www-authenticate',
  'te'
];

// Headers that are allowed to pass through
const ALLOWED_HEADERS = [
  'accept',
  'accept-language',
  'accept-encoding',
  'authorization',
  'content-type',
  'user-agent',
  'referer',
  'origin',
  'x-request-id',
  'x-correlation-id',
  // Removed x-tenant-id from allowed list
  'x-api-key',
  'idempotency-key'
];

function filterHeaders(headers: any): any {
  const filtered: any = {};

  // Only forward allowed headers
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    // Skip blocked headers (including x-tenant-id)
    if (BLOCKED_HEADERS.includes(lowerKey)) {
      continue;
    }

    // Only allow specific headers
    if (ALLOWED_HEADERS.includes(lowerKey) || lowerKey.startsWith('x-custom-')) {
      filtered[key] = value;
    }
  }

  return filtered;
}

export function createAuthenticatedProxy(server: FastifyInstance, options: ProxyOptions) {
  const { serviceUrl, serviceName, publicPaths = [], timeout = 5000 } = options;

  const proxyHandler = async (request: FastifyRequest, reply: FastifyReply, path: string = '') => {
    try {
      const targetUrl = path ? `${serviceUrl}/${path}` : serviceUrl;

      // Filter headers before forwarding
      const filteredHeaders = filterHeaders(request.headers);

      // Add service identification for internal requests
      filteredHeaders['x-gateway-forwarded'] = 'true';
      filteredHeaders['x-original-ip'] = request.ip;

      // Extract tenant_id from JWT and add as internal header
      // This is secure because it comes from the verified JWT, not from the client
      if (request.user) {
        const user = request.user as any;
        if (user.tenant_id) {
          filteredHeaders['x-tenant-id'] = user.tenant_id;
          filteredHeaders['x-tenant-source'] = 'jwt';  // Mark that this came from JWT
        }
      }

      const response = await axios({
        method: request.method as any,
        url: targetUrl,
        headers: filteredHeaders,
        data: request.body,
        params: request.query,
        timeout: timeout,
        maxRedirects: 0,
        validateStatus: () => true,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });

      // Filter response headers too
      const responseHeaders: any = {};
      for (const [key, value] of Object.entries(response.headers)) {
        const lowerKey = key.toLowerCase();
        // Don't forward internal response headers
        if (!lowerKey.startsWith('x-internal-') && !BLOCKED_HEADERS.includes(lowerKey)) {
          responseHeaders[key] = value;
        }
      }

      return reply
        .code(response.status)
        .headers(responseHeaders)
        .send(response.data);

    } catch (error: any) {
      server.log.error({
        error: error.message,
        code: error.code,
        service: serviceName,
        url: path
      }, `Proxy error to ${serviceName}`);

      // Handle specific error types
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return reply.code(504).send({
          error: 'Gateway Timeout',
          message: `${serviceName} service timeout after ${timeout}ms`
        });
      }

      if (error.code === 'ECONNREFUSED') {
        return reply.code(503).send({
          error: 'Service Unavailable',
          message: `${serviceName} service is down`
        });
      }

      return reply.code(502).send({
        error: 'Bad Gateway',
        message: `${serviceName} service error: ${error.message}`
      });
    }
  };

  return async function setupRoutes(server: FastifyInstance) {
    // Handle base route
    server.all('/', {
      preHandler: async (request, _reply) => {
        const path = request.url.replace(/\?.*$/, '');
        if (!publicPaths.some(p => path.endsWith(p))) {
          await (server as any).authenticate(request);
        }
      }
    }, async (request, reply) => {
      return proxyHandler(request, reply, '');
    });

    // Handle wildcard routes
    server.all('/*', {
      preHandler: async (request, _reply) => {
        const wildcardPath = (request.params as any)['*'] || '';
        const fullPath = '/' + wildcardPath;

        // Check if this is a public path
        const isPublic = publicPaths.some(publicPath => {
          if (publicPath.includes('*')) {
            const regex = new RegExp('^' + publicPath.replace('*', '.*') + '$');
            return regex.test(fullPath);
          }
          return fullPath === publicPath || fullPath.startsWith(publicPath + '/');
        });

        if (!isPublic) {
          await (server as any).authenticate(request);
        }
      }
    }, async (request, reply) => {
      const wildcardPath = (request.params as any)['*'] || '';
      return proxyHandler(request, reply, wildcardPath);
    });
  };
}
```

### FILE: src/routes/webhook.routes.ts
```typescript
import { serviceUrls } from '../config/services';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import axios from 'axios';

// Extend FastifyRequest to include rawBody
interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

export default async function webhookRoutes(server: FastifyInstance) {
  // Special handler for Stripe webhooks that preserves raw body
  const handleStripeWebhook = async (request: RawBodyRequest, reply: FastifyReply) => {
    try {
      // Get the raw body buffer
      const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
      
      // Preserve critical headers exactly as received
      const headers: any = {
        'stripe-signature': request.headers['stripe-signature'],
        'stripe-webhook-id': request.headers['stripe-webhook-id'],
        'content-type': request.headers['content-type'] || 'application/json',
        'content-length': Buffer.byteLength(rawBody).toString(),
        'x-forwarded-for': request.ip,
        'x-original-host': request.headers['host']
      };

      // Remove undefined headers
      Object.keys(headers).forEach(key => 
        headers[key] === undefined && delete headers[key]
      );

      // Forward to payment service with raw body
      const response = await axios({
        method: 'POST',
        url: `${serviceUrls.payment}/api/v1/webhooks/stripe`,
        data: rawBody,
        headers,
        timeout: 10000, // 10 second timeout for webhooks
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
        // Tell axios not to transform the data
        transformRequest: [(data) => data],
        // Raw response
        responseType: 'json'
      });

      return reply
        .code(response.status)
        .send(response.data);

    } catch (error: any) {
      server.log.error({ 
        error: error.message,
        code: error.code,
        path: '/webhooks/stripe'
      }, 'Stripe webhook proxy error');
      
      // Return 500 so Stripe will retry
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to process webhook'
      });
    }
  };

  // Stripe webhook endpoint - no auth, raw body preserved
  server.post('/stripe', {
    config: {
      rawBody: true
    }
  }, handleStripeWebhook);

  // Generic webhook endpoint for other providers (standard JSON parsing)
  server.all('/*', async (request, reply) => {
    const wildcardPath = (request.params as any)['*'] || '';
    
    try {
      const response = await axios({
        method: request.method as any,
        url: `${serviceUrls.payment}/api/v1/webhooks/${wildcardPath}`,
        data: request.body,
        headers: {
          'content-type': request.headers['content-type'],
          'x-forwarded-for': request.ip
        },
        timeout: 10000,
        validateStatus: () => true
      });

      return reply
        .code(response.status)
        .headers(response.headers as any)
        .send(response.data);
        
    } catch (error: any) {
      server.log.error({ error: error.message }, 'Webhook proxy error');
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Webhook processing failed'
      });
    }
  });
}
```

### FILE: src/middleware/auth.middleware.ts
```typescript
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

  // TODO: Fetch from auth service when implemented
  // For now, return mock data
  const user = {
    id: userId,
    email: `user${userId}@tickettoken.com`,
    role: 'customer' as UserRole,
    venueId: null,
    metadata: {},
  };

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
  _server: FastifyInstance,
  _userId: string,
  _venueId: string,
  _permission: string
): Promise<boolean> {
  // TODO: Implement proper venue access check with venue service
  return true;
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
```

### FILE: src/middleware/error-handler.middleware.ts
```typescript
import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { createRequestLogger, logError } from '../utils/logger';
import { ApiError } from '../types';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  code?: string;
  details?: any;
  requestId: string;
  timestamp: string;
}

export async function setupErrorHandler(server: FastifyInstance) {
  server.setErrorHandler(async (error: FastifyError | ApiError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const logger = createRequestLogger(request.id, request.headers['x-venue-id'] as string);

    // Default error response
    let response: ErrorResponse = {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      requestId: request.id,
      timestamp: new Date().toISOString(),
    };

    // Handle different error types
    if (error instanceof ApiError) {
      // Custom API errors
      response = {
        statusCode: (error as any).statusCode,
        error: error.name,
        message: (error as any).message,
        code: error.code,
        details: process.env.NODE_ENV !== 'production' ? error.details : undefined,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

      logger.warn({
        error: {
          name: error.name,
          message: (error as any).message,
          code: error.code,
          statusCode: (error as any).statusCode,
          stack: error.stack,
        },
        request: {
          method: request.method,
          url: request.url,
          params: request.params,
          query: request.query,
        },
      }, 'API error occurred');

    } else if ((error as any).validation) {
      // Fastify validation errors
      response = {
        statusCode: 422,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: process.env.NODE_ENV !== 'production' ? formatValidationErrors((error as any).validation) : undefined,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

      logger.warn({
        error: {
          validation: (error as any).validation,
        },
        request: {
          method: request.method,
          url: request.url,
          body: request.body,
        },
      }, 'Validation error occurred');

    } else if ((error as any).statusCode) {
      // Fastify errors
      response = {
        statusCode: (error as any).statusCode,
        error: (error as any).code || 'Error',
        message: (error as any).message,
        requestId: request.id,
        timestamp: new Date().toISOString(),
      };

      // Log based on status code
      if ((error as any).statusCode >= 500) {
        logger.error({
          error: {
            message: (error as any).message,
            statusCode: (error as any).statusCode,
            stack: error.stack,
          },
        }, 'Server error occurred');
      } else {
        logger.warn({
          error: {
            message: (error as any).message,
            statusCode: (error as any).statusCode,
          },
        }, 'Client error occurred');
      }
    } else {
      // Unknown errors
      logError(error as Error, 'Unhandled error', {
        requestId: request.id,
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: request.body,
      });

      // Don't leak internal error details in production
      if (process.env.NODE_ENV === 'production') {
        response.message = 'An unexpected error occurred';
      } else {
        response.message = (error as Error).message;
        response.details = {
          stack: (error as Error).stack,
        };
      }
    }

    // Set appropriate headers
    reply.header('X-Request-ID', request.id);

    // Add retry headers for rate limit errors
    if (response.statusCode === 429 && response.details?.retryAfter) {
      reply.header('Retry-After', response.details.retryAfter.toString());
    }

    // Add cache headers to prevent caching errors
    reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    // Send error response
    return reply.code(response.statusCode).send(response);
  });
}

// Helper to format validation errors
function formatValidationErrors(validation: any[]): any[] {
  return validation.map(error => ({
    field: error.dataPath || error.instancePath,
    message: error.message,
    params: error.params,
  }));
}

// Error recovery middleware for process-level errors
export function errorRecoveryMiddleware(server: FastifyInstance) {
  const logger = createRequestLogger('error-recovery');

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({
      reason,
      promise,
    }, 'Unhandled promise rejection');

    // In production, we might want to gracefully shutdown
    if (process.env.NODE_ENV === 'production') {
      // Give time for current requests to finish
      setTimeout(() => {
        process.exit(1);
      }, 30000);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({
      error: {
        message: error.message,
        stack: error.stack,
      },
    }, 'Uncaught exception');

    // Attempt graceful shutdown
    server.close(() => {
      process.exit(1);
    });

    // Force exit after 30 seconds
    setTimeout(() => {
      process.abort();
    }, 30000);
  });

  // Log warning for deprecations
  process.on('warning', (warning) => {
    logger.warn({
      warning: {
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
      },
    }, 'Node.js warning');
  });
}
```

### FILE: src/middleware/response-cache.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { createCache } from '@tickettoken/shared/cache/dist';

const cache = createCache({
  redis: {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    keyPrefix: 'gateway:',
  }
});

interface CacheConfig {
  ttl?: number;
  varyBy?: string[];
  condition?: (req: Request) => boolean;
}

const routeCacheConfig: Map<string, CacheConfig> = new Map([
  ['/api/events', { ttl: 600 }], // 10 minutes
  ['/api/venues', { ttl: 1800 }], // 30 minutes
  ['/api/tickets/availability', { ttl: 30 }], // 30 seconds
  ['/api/search', { ttl: 300, varyBy: ['q', 'category'] }], // 5 minutes
]);

export function responseCache() {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if route should be cached
    const config = routeCacheConfig.get(req.path);
    if (!config) {
      return next();
    }

    // Check condition
    if (config.condition && !config.condition(req)) {
      return next();
    }

    // Generate cache key
    let cacheKey = `response:${req.path}`;
    if (config.varyBy) {
      const varies = config.varyBy.map(param => `${param}:${req.query[param] || ''}`).join(':');
      cacheKey += `:${varies}`;
    }

    // Try to get from cache
    const cached = await cache.service.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-TTL', config.ttl || '300');
      return res.json(cached);
    }

    // Cache miss - capture response
    const originalJson = res.json;
    res.json = function(data: any) {
      res.setHeader('X-Cache', 'MISS');
      
      // Store in cache if successful
      if (res.statusCode === 200) {
        cache.service.set(cacheKey, data, { 
          ttl: config.ttl || 300,
          level: 'BOTH'
        }).catch(err => console.error('Cache set error:', err));
      }
      
      return originalJson.call(this, data);
    };

    next();
  };
}

// Cache invalidation endpoint
export function cacheInvalidationRoutes(app: any) {
  app.post('/admin/cache/invalidate', async (req: Request, res: Response) => {
    const { patterns } = req.body;
    
    if (patterns && Array.isArray(patterns)) {
      for (const pattern of patterns) {
        await cache.service.delete(pattern);
      }
      res.json({ success: true, invalidated: patterns.length });
    } else {
      res.status(400).json({ error: 'patterns array required' });
    }
  });

  app.get('/admin/cache/stats', async (_req: Request, res: Response) => {
    const stats = cache.service.getStats();
    res.json(stats);
  });
}
```

### FILE: src/types/fastify.d.ts
```typescript
import 'fastify';
import { AuthUser, VenueContext, TimeoutBudget, ServiceContainer } from './index';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    services: ServiceContainer;
    authenticate: (request: FastifyRequest) => Promise<void>;
    requirePermission: (permission: string) => (request: FastifyRequest) => Promise<void>;
  }

  interface FastifyRequest {
    user?: AuthUser;
    startTime?: number;
    rateLimitMax?: number;
    venueContext?: VenueContext;
    timeoutBudget?: TimeoutBudget;
    requestLogger?: any;
    routeSchema?: any;
  }

  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      type: 'access' | 'refresh';
      jti?: string;
      family?: string;
      permissions?: string[];
    };
    user: AuthUser;
  }
}

declare module '@fastify/jwt' {
  interface VerifyPayloadType {
    sub: string;
    type: 'access' | 'refresh';
    jti?: string;
    family?: string;
    permissions?: string[];
    [key: string]: any;
  }
}
```

### FILE: src/types/index.ts
```typescript
// User and authentication types
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string;  // Added for multi-tenancy support
  permissions: string[];
  venueId?: string;
  metadata?: Record<string, any>;
}

export type UserRole =
  | 'venue-owner'
  | 'venue-manager'
  | 'box-office'
  | 'door-staff'
  | 'customer'
  | 'admin';

export interface VenueContext {
  venueId: string;
  userId: string;
  role: UserRole;
  permissions: string[];
}

// Service types
export interface ServiceContainer {
  proxyService: ProxyService;
  circuitBreakerService: CircuitBreakerService;
  loadBalancerService: LoadBalancerService;
  serviceDiscoveryService: ServiceDiscoveryService;
  aggregatorService: AggregatorService;
  retryService: RetryService;
  timeoutService: TimeoutService;
}

export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  healthy: boolean;
  metadata?: Record<string, any>;
}

export interface ProxyService {
  forward(request: any, service: string, options?: ProxyOptions): Promise<any>;
}

export interface ProxyOptions {
  timeout?: number;
  retries?: number;
  circuitBreaker?: boolean;
  fallback?: any;
}

export interface CircuitBreakerService {
  execute<T>(name: string, fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T>;
  getState(name: string): CircuitBreakerState;
  getAllStats(): Record<string, any>;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface LoadBalancerService {
  selectInstance(service: string, instances: ServiceInstance[], strategy?: LoadBalancerStrategy): ServiceInstance;
}

export type LoadBalancerStrategy = 'round-robin' | 'least-connections' | 'random' | 'consistent-hash';

export interface ServiceDiscoveryService {
  discover(serviceName: string): Promise<ServiceInstance[]>;
  register(service: ServiceInstance): Promise<void>;
  deregister(serviceId: string): Promise<void>;
  getHealthyInstances(serviceName: string): Promise<ServiceInstance[]>;
  getServiceTopology(): Promise<Record<string, ServiceInstance[]>>;
}

export interface AggregatorService {
  aggregate(dataSources: DataSource[], request: any): Promise<any>;
  getEventDetails(eventId: string, request: any): Promise<any>;
  getUserDashboard(userId: string, request: any): Promise<any>;
}

export interface DataSource {
  name: string;
  service: string;
  endpoint: string;
  required: boolean;
  transform?: (data: any) => any;
  fallback?: any;
}

export interface RetryService {
  executeWithRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  multiplier?: number;
  jitter?: boolean;
  retryableErrors?: string[];
}

export interface TimeoutService {
  executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T>;
}

export interface TimeoutBudget {
  total: number;
  remaining: number;
  deadlineMs: number;
}

// Rate limiting types
export interface RateLimitConfig {
  max: number;
  timeWindow: number;
  blockDuration?: number;
  keyGenerator?: (request: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

// Error types
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(422, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication failed') {
    super(401, message, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, message, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, message, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(retryAfter?: number) {
    super(429, 'Too many requests', 'RATE_LIMIT_ERROR', { retryAfter });
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends ApiError {
  constructor(service: string) {
    super(503, `Service unavailable: ${service}`, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

// Request/Response types
export interface PaginationQuery {
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset?: number;
    total?: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

// Venue types
export interface Venue {
  id: string;
  name: string;
  tier: 'free' | 'standard' | 'premium';
  settings: VenueSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface VenueSettings {
  timezone: string;
  currency: string;
  features: {
    nftEnabled: boolean;
    marketplaceEnabled: boolean;
    analyticsEnabled: boolean;
  };
}

// Event types
export interface Event {
  id: string;
  venueId: string;
  name: string;
  date: Date;
  status: 'draft' | 'published' | 'sold_out' | 'cancelled';
  ticketTypes: TicketType[];
}

export interface TicketType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  available: number;
}

// Ticket types
export interface Ticket {
  id: string;
  eventId: string;
  ticketTypeId: string;
  status: 'available' | 'reserved' | 'sold' | 'used';
  nftTokenId?: string;
  nftContractAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Monitoring types
export interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  checks: {
    database?: 'ok' | 'error';
    redis?: 'ok' | 'error';
    services?: Record<string, 'ok' | 'error'>;
  };
}

export interface Metrics {
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  activeConnections: number;
  queueDepth: Record<string, number>;
}
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/api-gateway//src/utils/security.ts:71:    .update(payload)
backend/services/api-gateway//src/utils/security.ts:92:    .update(ip + process.env.IP_SALT || 'default-salt')
backend/services/api-gateway//src/middleware/auth.middleware.ts:33:      'events:create', 'events:update', 'events:delete',
backend/services/api-gateway//src/middleware/auth.middleware.ts:53:      'profile:update-own',
backend/services/api-gateway//src/middleware/validation.middleware.ts:182:  updateVenue: Joi.object({
backend/services/api-gateway//src/middleware/validation.middleware.ts:217:  updateEvent: Joi.object({
backend/services/api-gateway//src/services/service-discovery.service.ts:31:    // Update cache
backend/services/api-gateway//src/services/load-balancer.service.ts:11:  selectInstance(
backend/services/api-gateway//src/services/load-balancer.service.ts:26:      return this.selectByStrategy(service, instances, strategy, sessionKey);
backend/services/api-gateway//src/services/load-balancer.service.ts:29:    return this.selectByStrategy(service, healthyInstances, strategy, sessionKey);
backend/services/api-gateway//src/services/load-balancer.service.ts:32:  private selectByStrategy(
backend/services/api-gateway//src/services/load-balancer.service.ts:67:    const selected = instances[index];
backend/services/api-gateway//src/services/load-balancer.service.ts:68:    logger.debug({ service, instance: selected.id }, 'Selected instance (round-robin)');
backend/services/api-gateway//src/services/load-balancer.service.ts:70:    return selected;
backend/services/api-gateway//src/services/load-balancer.service.ts:81:    let selectedInstance: ServiceInstance | null = null;
backend/services/api-gateway//src/services/load-balancer.service.ts:88:        selectedInstance = instance;
backend/services/api-gateway//src/services/load-balancer.service.ts:92:    if (!selectedInstance) {
backend/services/api-gateway//src/services/load-balancer.service.ts:93:      selectedInstance = instances[0];
backend/services/api-gateway//src/services/load-balancer.service.ts:98:      selectedInstance.id,
backend/services/api-gateway//src/services/load-balancer.service.ts:99:      (connectionCounts.get(selectedInstance.id) || 0) + 1
backend/services/api-gateway//src/services/load-balancer.service.ts:104:      instance: selectedInstance.id,
backend/services/api-gateway//src/services/load-balancer.service.ts:106:    }, 'Selected instance (least-connections)');
backend/services/api-gateway//src/services/load-balancer.service.ts:108:    return selectedInstance;
backend/services/api-gateway//src/services/load-balancer.service.ts:113:    const selected = instances[index];
backend/services/api-gateway//src/services/load-balancer.service.ts:115:    logger.debug({ instance: selected.id }, 'Selected instance (random)');
backend/services/api-gateway//src/services/load-balancer.service.ts:117:    return selected;
backend/services/api-gateway//src/services/load-balancer.service.ts:122:    const hash = createHash('md5').update(key).digest('hex');
backend/services/api-gateway//src/services/load-balancer.service.ts:126:    const selected = instances[index];
backend/services/api-gateway//src/services/load-balancer.service.ts:129:      instance: selected.id,
backend/services/api-gateway//src/services/load-balancer.service.ts:132:    }, 'Selected instance (consistent-hash)');
backend/services/api-gateway//src/services/load-balancer.service.ts:134:    return selected;
backend/services/api-gateway//src/services/load-balancer.service.ts:137:  // Update connection count when request completes
backend/services/api-gateway//src/types/index.ts:67:  selectInstance(service: string, instances: ServiceInstance[], strategy?: LoadBalancerStrategy): ServiceInstance;
backend/services/api-gateway//src/types/index.ts:218:  updatedAt: Date;
backend/services/api-gateway//src/types/index.ts:258:  updatedAt: Date;

### All JOIN operations:
backend/services/api-gateway//src/utils/metrics.ts:85:      .join(',');
backend/services/api-gateway//src/middleware/validation.middleware.ts:252:    field: error.path.join('.'),
backend/services/api-gateway//src/middleware/response-cache.ts:47:      const varies = config.varyBy.map(param => `${param}:${req.query[param] || ''}`).join(':');

### All WHERE clauses:

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

### .env.example
```
# ================================================
# API-GATEWAY ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: api-gateway
# Port: 3000
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=api-gateway           # Service identifier

# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/config/services.ts
```typescript
// Service URL configuration with environment variable support
// Uses Docker service names when running in containers, localhost for local dev

export const getServiceUrl = (envVar: string, dockerService: string, port: number): string => {
  return process.env[envVar] || `http://${dockerService}:${port}`;
};

export const serviceUrls = {
  auth:         getServiceUrl('AUTH_SERVICE_URL',         'auth-service',         3001),
  venue:        getServiceUrl('VENUE_SERVICE_URL',        'venue-service',        3002),
  event:        getServiceUrl('EVENT_SERVICE_URL',        'event-service',        3003),
  ticket:       getServiceUrl('TICKET_SERVICE_URL',       'ticket-service',       3004),
  payment:      getServiceUrl('PAYMENT_SERVICE_URL',      'payment-service',      3005),
  marketplace:  getServiceUrl('MARKETPLACE_SERVICE_URL',  'marketplace-service',  3006),
  analytics:    getServiceUrl('ANALYTICS_SERVICE_URL',    'analytics-service',    3007),
  notification: getServiceUrl('NOTIFICATION_SERVICE_URL', 'notification-service', 3008),
  integration:  getServiceUrl('INTEGRATION_SERVICE_URL',  'integration-service',  3009),
  compliance:   getServiceUrl('COMPLIANCE_SERVICE_URL',   'compliance-service',   3010),
  queue:        getServiceUrl('QUEUE_SERVICE_URL',        'queue-service',        3011),
  search:       getServiceUrl('SEARCH_SERVICE_URL',       'search-service',       3012),
  file:         getServiceUrl('FILE_SERVICE_URL',         'file-service',         3013),
  monitoring:   getServiceUrl('MONITORING_SERVICE_URL',   'monitoring-service',   3014),
  blockchain:   getServiceUrl('BLOCKCHAIN_SERVICE_URL',   'blockchain-service',   3015),
  order:        getServiceUrl('ORDER_SERVICE_URL',        'order-service',        3016),
  scanning:     getServiceUrl('SCANNING_SERVICE_URL',     'scanning-service',     3020),
  minting:      getServiceUrl('MINTING_SERVICE_URL',      'minting-service',      3018),
  transfer:     getServiceUrl('TRANSFER_SERVICE_URL',     'transfer-service',     3019),
};
```

### FILE: src/services/aggregator.service.ts
```typescript
import { DataSource } from '../types';
import { ProxyService } from './proxy.service';
import { createLogger } from '../utils/logger';

const logger = createLogger('aggregator-service');

export class AggregatorService {
  constructor(private proxyService: ProxyService) {}

  async aggregate(dataSources: DataSource[], request: any): Promise<any> {
    const required = dataSources.filter(ds => ds.required);
    const optional = dataSources.filter(ds => !ds.required);

    // Execute required requests first
    const requiredResults = await this.executeRequired(required, request);

    // Execute optional requests with timeout
    const optionalResults = await this.executeOptional(optional, request);

    // Merge all results
    return this.mergeResults(requiredResults, optionalResults, dataSources);
  }

  private async executeRequired(
    dataSources: DataSource[],
    request: any
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Execute in parallel
    const promises = dataSources.map(async (ds) => {
      try {
        const response = await this.proxyService.forward(
          { ...request, url: ds.endpoint },
          ds.service
        );

        const data = ds.transform ? ds.transform(response.data) : response.data;
        return { name: ds.name, data, success: true };
      } catch (error) {
        logger.error({
          dataSource: ds.name,
          service: ds.service,
          error: (error as any).message,
        }, 'Required data source failed');
        
        throw new Error(`Failed to fetch required data: ${ds.name}`);
      }
    });

    const responses = await Promise.all(promises);

    for (const response of responses) {
      results[response.name] = response.data;
    }

    return results;
  }

  private async executeOptional(
    dataSources: DataSource[],
    request: any
  ): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Execute with timeout and fallback
    const promises = dataSources.map(async (ds) => {
      try {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 2000);
        });

        const dataPromise = this.proxyService.forward(
          { ...request, url: ds.endpoint },
          ds.service
        );

        const response = await Promise.race([dataPromise, timeoutPromise]);
        const data = ds.transform ? ds.transform(response.data) : response.data;
        
        return { name: ds.name, data, success: true };
      } catch (error) {
        logger.warn({
          dataSource: ds.name,
          service: ds.service,
          error: (error as any).message,
        }, 'Optional data source failed, using fallback');

        return { name: ds.name, data: ds.fallback, success: false };
      }
    });

    const responses = await Promise.allSettled(promises);

    for (const response of responses) {
      if (response.status === 'fulfilled') {
        results[response.value.name] = response.value.data;
      }
    }

    return results;
  }

  private mergeResults(
    required: Record<string, any>,
    optional: Record<string, any>,
    dataSources: DataSource[]
  ): any {
    const merged = {
      ...required,
      ...optional,
      _metadata: {
        timestamp: new Date().toISOString(),
        sources: dataSources.map(ds => ({
          name: ds.name,
          required: ds.required,
          success: required[ds.name] !== undefined || optional[ds.name] !== undefined,
        })),
      },
    };

    return merged;
  }

  // Pre-defined aggregation patterns for TicketToken
  async getEventDetails(eventId: string, request: any): Promise<any> {
    const dataSources: DataSource[] = [
      {
        name: 'event',
        service: 'event-service',
        endpoint: `/events/${eventId}`,
        required: true,
      },
      {
        name: 'venue',
        service: 'venue-service',
        endpoint: `/events/${eventId}/venue`,
        required: true,
      },
      {
        name: 'tickets',
        service: 'ticket-service',
        endpoint: `/events/${eventId}/availability`,
        required: true,
        transform: (data: any) => ({
          available: data.available_count,
          soldOut: data.available_count === 0,
          tiers: data.ticket_tiers,
        }),
      },
      {
        name: 'nftStatus',
        service: 'nft-service',
        endpoint: `/events/${eventId}/nft-config`,
        required: false,
        fallback: { enabled: false },
      },
      {
        name: 'analytics',
        service: 'analytics-service',
        endpoint: `/events/${eventId}/stats`,
        required: false,
        fallback: null,
      },
    ];

    return this.aggregate(dataSources, request);
  }

  async getUserDashboard(userId: string, request: any): Promise<any> {
    const dataSources: DataSource[] = [
      {
        name: 'profile',
        service: 'user-service',
        endpoint: `/users/${userId}`,
        required: true,
      },
      {
        name: 'tickets',
        service: 'ticket-service',
        endpoint: `/users/${userId}/tickets`,
        required: true,
        transform: (data: any) => ({
          upcoming: data.filter((t: any) => new Date(t.event_date) > new Date()),
          past: data.filter((t: any) => new Date(t.event_date) <= new Date()),
        }),
      },
      {
        name: 'nfts',
        service: 'nft-service',
        endpoint: `/users/${userId}/nfts`,
        required: false,
        fallback: [],
      },
      {
        name: 'transactions',
        service: 'payment-service',
        endpoint: `/users/${userId}/transactions?limit=10`,
        required: false,
        fallback: [],
      },
    ];

    return this.aggregate(dataSources, request);
  }
}
```

### FILE: src/services/timeout.service.ts
```typescript
import { FastifyRequest } from 'fastify';
import { config, timeoutConfig } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('timeout-service');

export class TimeoutService {
  async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeout}ms`));
        }, timeout);
      }),
    ]);
  }

  calculateTimeout(request: FastifyRequest, service: string): number {
    const endpoint = `${request.method} ${request.routeOptions?.url || request.url}`;
    
    // Check service-specific endpoint timeouts
    const services = timeoutConfig.services as Record<string, any>;
    const serviceConfig = services[service];
    if (serviceConfig) {
      // Check exact endpoint match
      if (serviceConfig.endpoints[endpoint]) {
        logger.debug({
          service,
          endpoint,
          timeout: serviceConfig.endpoints[endpoint],
        }, 'Using endpoint-specific timeout');
        return serviceConfig.endpoints[endpoint];
      }

      // Return service default
      logger.debug({
        service,
        timeout: serviceConfig.default,
      }, 'Using service default timeout');
      return serviceConfig.default;
    }

    // Special handling for payment operations
    if (request.url.includes('/payment') || request.url.includes('/checkout')) {
      return config.timeouts.payment;
    }

    // Special handling for NFT operations
    if (request.url.includes('/nft') || request.url.includes('/mint')) {
      return config.timeouts.nftMinting;
    }

    // Default timeout
    return config.timeouts.default;
  }

  // Create a timeout controller for cascading timeouts
  createTimeoutController(totalTimeout: number): TimeoutController {
    return new TimeoutController(totalTimeout);
  }
}

export class TimeoutController {
  private startTime: number;
  private deadline: number;
  private consumed: number = 0;

  constructor(private totalTimeout: number) {
    this.startTime = Date.now();
    this.deadline = this.startTime + totalTimeout;
  }

  getRemaining(): number {
    const now = Date.now();
    return Math.max(0, this.deadline - now);
  }

  allocate(percentage: number): number {
    const remaining = this.getRemaining();
    const allocated = Math.floor(remaining * percentage);
    this.consumed += allocated;
    
    logger.debug({
      totalTimeout: this.totalTimeout,
      remaining,
      allocated,
      consumed: this.consumed,
    }, 'Timeout allocated');

    return allocated;
  }

  hasExpired(): boolean {
    return Date.now() >= this.deadline;
  }

  getElapsed(): number {
    return Date.now() - this.startTime;
  }

  getStats() {
    return {
      totalTimeout: this.totalTimeout,
      elapsed: this.getElapsed(),
      remaining: this.getRemaining(),
      consumed: this.consumed,
      deadline: new Date(this.deadline).toISOString(),
    };
  }
}
```

### FILE: src/services/circuit-breaker.service.ts
```typescript
import CircuitBreaker from 'opossum';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { CircuitBreakerState } from '../types';

const logger = createLogger('circuit-breaker-service');

export class CircuitBreakerService {
  private breakers: Map<string, CircuitBreaker> = new Map();

  constructor() {
    this.initializeBreakers();
  }

  private initializeBreakers() {
    // Create circuit breakers for each service
    const services = Object.keys(config.services);
    
    for (const service of services) {
      const breaker = this.createBreaker(service);
      this.breakers.set(service, breaker);
    }
  }

  private createBreaker(name: string): CircuitBreaker {
    const options = {
      timeout: config.circuitBreaker.timeout,
      errorThresholdPercentage: config.circuitBreaker.errorThresholdPercentage,
      resetTimeout: config.circuitBreaker.resetTimeout,
      rollingCountTimeout: 10000,
      rollingCountBuckets: 10,
      name,
      volumeThreshold: config.circuitBreaker.volumeThreshold,
    };

    const breaker = new CircuitBreaker(async (fn: Function) => fn(), options);

    // Set up event handlers
    this.setupBreakerEvents(breaker, name);

    return breaker;
  }

  private setupBreakerEvents(breaker: CircuitBreaker, name: string) {
    breaker.on('open', () => {
      logger.error({ service: name }, `Circuit breaker OPENED for ${name}`);
    });

    breaker.on('halfOpen', () => {
      logger.info({ service: name }, `Circuit breaker HALF-OPEN for ${name}`);
    });

    breaker.on('close', () => {
      logger.info({ service: name }, `Circuit breaker CLOSED for ${name}`);
    });

    breaker.on('failure', (error) => {
      logger.warn({ service: name, error: (error as any).message }, `Circuit breaker failure for ${name}`);
    });

    breaker.on('timeout', () => {
      logger.warn({ service: name }, `Circuit breaker timeout for ${name}`);
    });

    breaker.on('reject', () => {
      logger.error({ service: name }, `Circuit breaker rejected request for ${name}`);
    });

    breaker.on('success', (elapsed) => {
      logger.debug({ service: name, elapsed }, `Circuit breaker success for ${name}`);
    });
  }

  async execute<T>(
    name: string,
    fn: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      logger.warn({ service: name }, "No circuit breaker found, executing directly");
      return fn();
    }
    
    if (fallback) {
      breaker.fallback(fallback);
    }
    
    return breaker.fire(fn) as Promise<T>;
  }

  getState(name: string): CircuitBreakerState {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      return 'CLOSED';
    }

    if (breaker.opened) {
      return 'OPEN';
    }

    if (breaker.pendingClose) {
      return 'HALF_OPEN';
    }

    return 'CLOSED';
  }

  getStats(name: string) {
    const breaker = this.breakers.get(name);
    
    if (!breaker) {
      return null;
    }

    return breaker.stats;
  }

  getAllStats() {
    const stats: Record<string, any> = {};
    
    for (const [name, breaker] of this.breakers) {
      stats[name] = {
        state: this.getState(name),
        stats: breaker.stats,
      };
    }

    return stats;
  }
}
```

### FILE: src/services/retry.service.ts
```typescript
import { createLogger } from '../utils/logger';
import { RetryOptions } from '../types';

const logger = createLogger('retry-service');

export class RetryService {
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      baseDelay = 1000,
      maxDelay = 30000,
      multiplier = 2,
      jitter = true,
      retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug({ attempt, maxRetries }, 'Executing function');
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (!this.shouldRetry(error, attempt, maxRetries, retryableErrors)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, {
          baseDelay,
          maxDelay,
          multiplier,
          jitter,
        });

        logger.warn({
          attempt,
          maxRetries,
          delay,
          error: (error as any).message,
        }, `Retry attempt ${attempt}/${maxRetries} in ${delay}ms`);

        await this.sleep(delay);
      }
    }

    logger.error({
      attempts: maxRetries,
      error: lastError?.message,
    }, 'All retry attempts exhausted');

    throw lastError;
  }

  private shouldRetry(
    error: any,
    attempt: number,
    maxRetries: number,
    retryableErrors: string[]
  ): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= maxRetries) {
      return false;
    }

    // Don't retry on client errors (4xx)
    if (error.response && error.response.status >= 400 && error.response.status < 500) {
      logger.debug({ statusCode: error.response.status }, 'Client error, not retrying');
      return false;
    }

    // Check if error code is retryable
    if (error.code && retryableErrors.includes(error.code)) {
      return true;
    }

    // Retry on server errors (5xx)
    if (error.response && error.response.status >= 500) {
      return true;
    }

    // Retry on timeout errors
    if ((error as any).message && (error as any).message.includes('timeout')) {
      return true;
    }

    return false;
  }

  private calculateDelay(
    attempt: number,
    config: {
      baseDelay: number;
      maxDelay: number;
      multiplier: number;
      jitter: boolean;
    }
  ): number {
    // Exponential backoff
    let delay = Math.min(
      config.baseDelay * Math.pow(config.multiplier, attempt - 1),
      config.maxDelay
    );

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      const randomJitter = (Math.random() * 2 - 1) * jitterAmount;
      delay = Math.round(delay + randomJitter);
    }

    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Service-specific retry configurations
  getServiceRetryConfig(service: string): RetryOptions {
    const configs: Record<string, RetryOptions> = {
      'nft-service': {
        maxRetries: 5,
        baseDelay: 5000,
        maxDelay: 600000, // 10 minutes
        multiplier: 2.5,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'GAS_PRICE_HIGH'],
      },
      'payment-service': {
        maxRetries: 3,
        baseDelay: 2000,
        maxDelay: 60000, // 1 minute
        multiplier: 2,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'GATEWAY_TIMEOUT'],
      },
      'ticket-service': {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        multiplier: 2,
        jitter: true,
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
      },
    };

    return configs[service] || {};
  }
}
```

### FILE: src/services/proxy.service.ts
```typescript
import { serviceUrls } from '../config/services';
import axios, { AxiosRequestConfig } from 'axios';

export class ProxyService {
  private serviceMap: Record<string, string>;

  constructor() {
    this.serviceMap = {
      'auth-service': serviceUrls.auth,
      'venue-service': serviceUrls.venue,
      'event-service': serviceUrls.event,
      'ticket-service': serviceUrls.ticket,
      'payment-service': serviceUrls.payment,
      'nft-service': serviceUrls.marketplace,
      'notification-service': serviceUrls.notification,
      'analytics-service': serviceUrls.analytics,
      'marketplace-service': serviceUrls.marketplace,
      'integration-service': serviceUrls.integration,
      'compliance-service': serviceUrls.compliance,
      'queue-service': serviceUrls.queue,
      'search-service': serviceUrls.search,
      'file-service': serviceUrls.file,
      'monitoring-service': serviceUrls.monitoring,
      'blockchain-service': serviceUrls.blockchain,
      'order-service': serviceUrls.order,
      'scanning-service': serviceUrls.scanning,
      'minting-service': serviceUrls.minting,
      'transfer-service': serviceUrls.transfer,
    };
  }

  getServiceUrl(serviceName: string): string {
    return this.serviceMap[serviceName];
  }

  setForwardedHeaders(request: any, headers: any): void {
    headers['x-forwarded-for'] = request.ip;
    headers['x-forwarded-proto'] = request.protocol;
    headers['x-forwarded-host'] = request.hostname || request.headers.host || 'api-gateway';
    headers['x-forwarded-port'] = request.socket.localPort;
  }

  async forward(request: any, service: string, options?: any): Promise<any> {
    const serviceUrl = this.getServiceUrl(service);
    if (!serviceUrl) {
      throw new Error(`Service ${service} not found`);
    }

    const headers = { ...request.headers };
    this.setForwardedHeaders(request, headers);

    const config: AxiosRequestConfig = {
      method: request.method || 'GET',
      url: `${serviceUrl}${request.url || ''}`,
      headers,
      data: request.body || request.data,
      timeout: options?.timeout || 10000,
      ...options
    };

    try {
      const response = await axios(config);
      return response;
    } catch (error) {
      throw error;
    }
  }
}
```

### FILE: src/services/service-discovery.service.ts
```typescript
import { ServiceInstance } from '../types';
import { REDIS_KEYS } from '../config/redis';
import { createLogger } from '../utils/logger';
import axios from 'axios';
import { config } from '../config';

const logger = createLogger('service-discovery');

export class ServiceDiscoveryService {
  private cache = new Map<string, { instances: ServiceInstance[]; timestamp: number }>();
  private redis: any;

  constructor(dependencies: any = {}) {
    this.redis = dependencies.redis;
    if (!this.redis) {
      logger.warn('Redis not available for service discovery - using in-memory cache only');
    }
    this.startHealthCheckInterval();
  }

  async discover(serviceName: string): Promise<ServiceInstance[]> {
    // Check cache first
    const cached = this.cache.get(serviceName);
    if (cached && Date.now() - cached.timestamp < 30000) {
      return cached.instances;
    }

    // For now, return static instances
    const instances = this.getStaticInstances(serviceName);

    // Update cache
    this.cache.set(serviceName, {
      instances,
      timestamp: Date.now(),
    });

    return instances;
  }

  async register(service: ServiceInstance): Promise<void> {
    if (!this.redis) {
      logger.debug('Skipping Redis registration - Redis not available');
      return;
    }

    const key = `${REDIS_KEYS.SERVICE_DISCOVERY}${service.name}:${service.id}`;

    await this.redis.setex(
      key,
      REDIS_KEYS.SERVICE_DISCOVERY,
      JSON.stringify({
        ...service,
        registeredAt: Date.now(),
      })
    );

    logger.info({
      service: service.name,
      id: service.id,
      address: `${service.address}:${service.port}`,
    }, 'Service instance registered');
  }

  async deregister(serviceId: string): Promise<void> {
    if (!this.redis) return;
    
    const keys = await this.redis.keys(`${REDIS_KEYS.SERVICE_DISCOVERY}*:${serviceId}`);

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async getHealthyInstances(serviceName: string): Promise<ServiceInstance[]> {
    const allInstances = await this.discover(serviceName);
    const healthyInstances: ServiceInstance[] = [];

    for (const instance of allInstances) {
      if (await this.checkInstanceHealth(instance)) {
        healthyInstances.push(instance);
      }
    }

    return healthyInstances;
  }

  private getStaticInstances(serviceName: string): ServiceInstance[] {
    const services = config.services as Record<string, string>;
    const serviceUrl = services[serviceName];

    if (!serviceUrl) {
      return [];
    }

    try {
      const url = new URL(serviceUrl);
      return [{
        id: `${serviceName}-static`,
        name: serviceName,
        address: url.hostname,
        port: parseInt(url.port) || 80,
        healthy: true,
        metadata: {
          static: true,
        },
      }];
    } catch (error) {
      logger.error({ error, serviceName }, 'Invalid service URL');
      return [];
    }
  }

  private async checkInstanceHealth(instance: ServiceInstance): Promise<boolean> {
    if (!this.redis) {
      // Without Redis, just return true for now
      return true;
    }

    const healthKey = `${REDIS_KEYS.SERVICE_HEALTH}${instance.name}:${instance.id}`;
    const health = await this.redis.get(healthKey);

    if (health === null) {
      // No health data, perform health check
      await this.performHealthCheck(instance);
      return true; // Assume healthy on first check
    }

    const healthData = JSON.parse(health);
    return healthData.status === 'healthy';
  }

  private startHealthCheckInterval() {
    setInterval(async () => {
      try {
        const allServices = await this.getAllServices();

        for (const instance of allServices) {
          await this.performHealthCheck(instance);
        }
      } catch (error) {
        logger.error({ error }, 'Health check cycle failed');
      }
    }, 30000); // Every 30 seconds
  }

  private async performHealthCheck(instance: ServiceInstance): Promise<void> {
    const healthKey = `${REDIS_KEYS.SERVICE_HEALTH}${instance.name}:${instance.id}`;

    try {
      // Perform HTTP health check
      const response = await axios.get(`http://${instance.address}:${instance.port}/health`, {
        timeout: 5000,
      });

      const healthData = {
        status: response.status === 200 ? 'healthy' : 'unhealthy',
        lastCheck: Date.now(),
        responseTime: response.headers['x-response-time'],
      };

      // Only store in Redis if available
      if (this.redis) {
        await this.redis.setex(
          healthKey,
          60, // 1 minute TTL
          JSON.stringify(healthData)
        );
      }
    } catch (error) {
      logger.error({
        instance: instance.name,
        id: instance.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Health check failed');

      // Mark as unhealthy - only if Redis available
      if (this.redis) {
        await this.redis.setex(
          healthKey,
          60,
          JSON.stringify({
            status: 'unhealthy',
            lastCheck: Date.now(),
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        );
      }
    }
  }

  private async getAllServices(): Promise<ServiceInstance[]> {
    const services = ['auth', 'venue', 'ticket', 'payment', 'nft', 'notification'];
    const allInstances: ServiceInstance[] = [];

    for (const service of services) {
      const instances = await this.discover(service);
      allInstances.push(...instances);
    }

    return allInstances;
  }

  async getServiceTopology(): Promise<Record<string, ServiceInstance[]>> {
    const topology: Record<string, ServiceInstance[]> = {};
    const services = ['auth', 'venue', 'ticket', 'payment', 'nft', 'notification'];

    for (const service of services) {
      topology[service] = await this.discover(service);
    }

    return topology;
  }
}
```

### FILE: src/services/load-balancer.service.ts
```typescript
import { createHash } from 'crypto';
import { ServiceInstance, LoadBalancerStrategy } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('load-balancer-service');

export class LoadBalancerService {
  private roundRobinCounters: Map<string, number> = new Map();
  private leastConnectionsMap: Map<string, Map<string, number>> = new Map();

  selectInstance(
    service: string,
    instances: ServiceInstance[],
    strategy: LoadBalancerStrategy = 'round-robin',
    sessionKey?: string
  ): ServiceInstance {
    if (instances.length === 0) {
      throw new Error(`No instances available for service: ${service}`);
    }

    // Filter healthy instances
    const healthyInstances = instances.filter(instance => instance.healthy);
    
    if (healthyInstances.length === 0) {
      logger.warn({ service }, 'No healthy instances available, using all instances');
      return this.selectByStrategy(service, instances, strategy, sessionKey);
    }

    return this.selectByStrategy(service, healthyInstances, strategy, sessionKey);
  }

  private selectByStrategy(
    service: string,
    instances: ServiceInstance[],
    strategy: LoadBalancerStrategy,
    sessionKey?: string
  ): ServiceInstance {
    switch (strategy) {
      case 'round-robin':
        return this.roundRobin(service, instances);
      
      case 'least-connections':
        return this.leastConnections(service, instances);
      
      case 'random':
        return this.random(instances);
      
      case 'consistent-hash':
        if (!sessionKey) {
          logger.warn({ service }, 'No session key provided for consistent hash, falling back to random');
          return this.random(instances);
        }
        return this.consistentHash(instances, sessionKey);
      
      default:
        logger.warn({ service, strategy }, 'Unknown strategy, falling back to round-robin');
        return this.roundRobin(service, instances);
    }
  }

  private roundRobin(service: string, instances: ServiceInstance[]): ServiceInstance {
    const counter = this.roundRobinCounters.get(service) || 0;
    const index = counter % instances.length;
    
    this.roundRobinCounters.set(service, counter + 1);
    
    const selected = instances[index];
    logger.debug({ service, instance: selected.id }, 'Selected instance (round-robin)');
    
    return selected;
  }

  private leastConnections(service: string, instances: ServiceInstance[]): ServiceInstance {
    if (!this.leastConnectionsMap.has(service)) {
      this.leastConnectionsMap.set(service, new Map());
    }
    
    const connectionCounts = this.leastConnectionsMap.get(service)!;
    
    let leastConnections = Infinity;
    let selectedInstance: ServiceInstance | null = null;
    
    for (const instance of instances) {
      const connections = connectionCounts.get(instance.id) || 0;
      
      if (connections < leastConnections) {
        leastConnections = connections;
        selectedInstance = instance;
      }
    }
    
    if (!selectedInstance) {
      selectedInstance = instances[0];
    }
    
    // Increment connection count
    connectionCounts.set(
      selectedInstance.id,
      (connectionCounts.get(selectedInstance.id) || 0) + 1
    );
    
    logger.debug({ 
      service, 
      instance: selectedInstance.id,
      connections: leastConnections + 1
    }, 'Selected instance (least-connections)');
    
    return selectedInstance;
  }

  private random(instances: ServiceInstance[]): ServiceInstance {
    const index = Math.floor(Math.random() * instances.length);
    const selected = instances[index];
    
    logger.debug({ instance: selected.id }, 'Selected instance (random)');
    
    return selected;
  }

  private consistentHash(instances: ServiceInstance[], key: string): ServiceInstance {
    // Simple consistent hash implementation
    const hash = createHash('md5').update(key).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    const index = hashInt % instances.length;
    
    const selected = instances[index];
    
    logger.debug({ 
      instance: selected.id,
      key,
      hash: hash.substring(0, 8)
    }, 'Selected instance (consistent-hash)');
    
    return selected;
  }

  // Update connection count when request completes
  releaseConnection(service: string, instanceId: string) {
    const connectionCounts = this.leastConnectionsMap.get(service);
    
    if (connectionCounts) {
      const current = connectionCounts.get(instanceId) || 0;
      if (current > 0) {
        connectionCounts.set(instanceId, current - 1);
      }
    }
  }

  // Reset counters
  reset(service?: string) {
    if (service) {
      this.roundRobinCounters.delete(service);
      this.leastConnectionsMap.delete(service);
    } else {
      this.roundRobinCounters.clear();
      this.leastConnectionsMap.clear();
    }
    
    logger.info({ service }, 'Load balancer counters reset');
  }

  // Get current state for monitoring
  getState() {
    const state: Record<string, any> = {};
    
    for (const [service, counter] of this.roundRobinCounters) {
      state[service] = {
        roundRobinCounter: counter,
        connections: Object.fromEntries(
          this.leastConnectionsMap.get(service) || new Map()
        ),
      };
    }
    
    return state;
  }
}
```

