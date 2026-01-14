/**
 * Authentication Audit Logging Middleware
 * 
 * AUDIT FIX: S2S-11 - No S2S audit logging
 * AUDIT FIX: S2S-10 - Per-endpoint authorization rules
 * 
 * Provides comprehensive audit logging for all authentication events
 * and enforces per-endpoint authorization rules.
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import logger from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

export enum AuthAuditEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  TOKEN_VALIDATED = 'TOKEN_VALIDATED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_MISSING = 'TOKEN_MISSING',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  SERVICE_TO_SERVICE = 'SERVICE_TO_SERVICE',
  RATE_LIMITED = 'RATE_LIMITED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY'
}

export interface AuthAuditEvent {
  timestamp: Date;
  eventType: AuthAuditEventType;
  requestId: string;
  correlationId?: string;
  userId?: string;
  serviceId?: string;
  tenantId?: string;
  endpoint: string;
  method: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface EndpointAuthRule {
  /** Required roles for this endpoint */
  roles?: string[];
  /** Required scopes for this endpoint */
  scopes?: string[];
  /** Allow service-to-service calls */
  allowS2S?: boolean;
  /** Allow anonymous access */
  allowAnonymous?: boolean;
  /** Custom authorization function */
  customCheck?: (request: FastifyRequest) => boolean | Promise<boolean>;
}

// =============================================================================
// ENDPOINT AUTHORIZATION RULES
// AUDIT FIX: S2S-10 - Per-endpoint authorization rules
// =============================================================================

const endpointAuthRules: Record<string, EndpointAuthRule> = {
  // Public endpoints (no auth required)
  'GET:/health': { allowAnonymous: true },
  'GET:/live': { allowAnonymous: true },
  'GET:/ready': { allowAnonymous: true },
  'GET:/startup': { allowAnonymous: true },
  'GET:/metrics': { allowAnonymous: true },
  
  // Read endpoints (authenticated users)
  'GET:/api/v1/transactions/*': { allowS2S: true },
  'GET:/api/v1/wallets/*': { allowS2S: true },
  'GET:/api/v1/nfts/*': { allowS2S: true },
  'GET:/api/v1/marketplace/*': { allowS2S: true },
  'GET:/api/v1/sync/*': { allowS2S: true },
  'GET:/api/v1/reconciliation/*': { allowS2S: true },
  
  // Internal service endpoints
  'POST:/internal/*': { allowS2S: true, roles: ['service'] },
  
  // Admin endpoints
  'POST:/admin/*': { roles: ['admin'] },
  'DELETE:/admin/*': { roles: ['admin'] }
};

// =============================================================================
// AUDIT LOGGER
// =============================================================================

/**
 * Log an authentication audit event
 */
export function logAuthAuditEvent(event: AuthAuditEvent): void {
  const logData = {
    auditType: 'AUTH',
    ...event,
    timestamp: event.timestamp.toISOString()
  };

  if (event.success) {
    logger.info(logData, `Auth audit: ${event.eventType}`);
  } else {
    logger.warn(logData, `Auth audit failure: ${event.eventType}`);
  }

  // In production, you might want to:
  // 1. Send to a dedicated audit log system
  // 2. Store in database for compliance
  // 3. Send to SIEM system
  // 4. Trigger alerts on suspicious activity
}

/**
 * Log a suspicious activity event
 */
export function logSuspiciousActivity(
  request: FastifyRequest,
  reason: string,
  metadata?: Record<string, any>
): void {
  logAuthAuditEvent({
    timestamp: new Date(),
    eventType: AuthAuditEventType.SUSPICIOUS_ACTIVITY,
    requestId: (request as any).requestId || 'unknown',
    correlationId: (request as any).correlationId,
    userId: (request as any).user?.userId,
    serviceId: (request as any).user?.serviceId,
    tenantId: (request as any).user?.tenant_id,
    endpoint: request.url,
    method: request.method,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    success: false,
    errorMessage: reason,
    metadata
  });
}

// =============================================================================
// AUTH AUDIT MIDDLEWARE
// =============================================================================

/**
 * Create auth audit middleware for Fastify
 */
export function authAuditMiddleware(fastify: FastifyInstance): void {
  // Hook into authentication events
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip audit for health endpoints
    if (isHealthEndpoint(request.url)) {
      return;
    }

    // Log incoming request (will be completed after auth)
    (request as any).authAuditStartTime = Date.now();
  });

  // Hook after authentication
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip for health endpoints
    if (isHealthEndpoint(request.url)) {
      return;
    }

    const user = (request as any).user;
    const endpointKey = `${request.method}:${normalizeEndpoint(request.url)}`;
    const rule = getAuthRule(endpointKey);

    // Check if user is authenticated when required
    if (!rule.allowAnonymous && !user) {
      logAuthAuditEvent({
        timestamp: new Date(),
        eventType: AuthAuditEventType.TOKEN_MISSING,
        requestId: (request as any).requestId || 'unknown',
        endpoint: request.url,
        method: request.method,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: false,
        errorMessage: 'Authentication required'
      });
      return; // Auth middleware will handle response
    }

    // Check authorization rules
    if (user) {
      const authorized = await checkAuthorization(request, rule);
      
      logAuthAuditEvent({
        timestamp: new Date(),
        eventType: authorized ? AuthAuditEventType.PERMISSION_GRANTED : AuthAuditEventType.PERMISSION_DENIED,
        requestId: (request as any).requestId || 'unknown',
        correlationId: (request as any).correlationId,
        userId: user.userId,
        serviceId: user.serviceId,
        tenantId: user.tenant_id,
        endpoint: request.url,
        method: request.method,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        success: authorized,
        errorMessage: authorized ? undefined : 'Insufficient permissions',
        metadata: {
          roles: user.roles,
          scopes: user.scopes,
          requiredRoles: rule.roles,
          requiredScopes: rule.scopes
        }
      });

      if (!authorized) {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Insufficient permissions for this endpoint'
        });
      }
    }
  });
}

/**
 * Standalone function to log successful token validation
 */
export function logTokenValidated(request: FastifyRequest, user: any): void {
  logAuthAuditEvent({
    timestamp: new Date(),
    eventType: user.serviceId ? AuthAuditEventType.SERVICE_TO_SERVICE : AuthAuditEventType.TOKEN_VALIDATED,
    requestId: (request as any).requestId || 'unknown',
    correlationId: (request as any).correlationId,
    userId: user.userId,
    serviceId: user.serviceId,
    tenantId: user.tenant_id,
    endpoint: request.url,
    method: request.method,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    success: true,
    metadata: {
      tokenType: user.serviceId ? 's2s' : 'user',
      issuer: user.iss
    }
  });
}

/**
 * Log token validation failure
 */
export function logTokenValidationFailed(
  request: FastifyRequest,
  eventType: AuthAuditEventType,
  errorMessage: string
): void {
  logAuthAuditEvent({
    timestamp: new Date(),
    eventType,
    requestId: (request as any).requestId || 'unknown',
    endpoint: request.url,
    method: request.method,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    success: false,
    errorMessage
  });
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if endpoint is a health check
 */
function isHealthEndpoint(url: string): boolean {
  const healthPaths = ['/health', '/live', '/ready', '/startup', '/metrics'];
  return healthPaths.some(path => url.startsWith(path));
}

/**
 * Normalize endpoint for rule matching
 */
function normalizeEndpoint(url: string): string {
  // Remove query string
  const path = url.split('?')[0];
  
  // Replace IDs with wildcards for matching
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/*')
    .replace(/\/[A-HJ-NP-Za-km-z1-9]{32,44}/g, '/*'); // Base58 addresses
}

/**
 * Get auth rule for endpoint
 */
function getAuthRule(endpointKey: string): EndpointAuthRule {
  // Exact match first
  if (endpointAuthRules[endpointKey]) {
    return endpointAuthRules[endpointKey];
  }

  // Try wildcard match
  for (const [pattern, rule] of Object.entries(endpointAuthRules)) {
    if (matchEndpoint(pattern, endpointKey)) {
      return rule;
    }
  }

  // Default: require authentication, no special roles
  return { allowAnonymous: false, allowS2S: true };
}

/**
 * Match endpoint pattern
 */
function matchEndpoint(pattern: string, endpoint: string): boolean {
  const [patternMethod, patternPath] = pattern.split(':');
  const [endpointMethod, endpointPath] = endpoint.split(':');

  if (patternMethod !== endpointMethod) {
    return false;
  }

  // Convert pattern to regex
  const regexPattern = patternPath
    .replace(/\*/g, '.*')
    .replace(/\//g, '\\/');

  return new RegExp(`^${regexPattern}$`).test(endpointPath);
}

/**
 * Check authorization rules
 */
async function checkAuthorization(
  request: FastifyRequest,
  rule: EndpointAuthRule
): Promise<boolean> {
  const user = (request as any).user;

  if (!user) {
    return rule.allowAnonymous === true;
  }

  // Service-to-service check
  if (user.serviceId) {
    return rule.allowS2S !== false;
  }

  // Role check
  if (rule.roles && rule.roles.length > 0) {
    const userRoles = user.roles || [];
    const hasRequiredRole = rule.roles.some(role => userRoles.includes(role));
    if (!hasRequiredRole) {
      return false;
    }
  }

  // Scope check
  if (rule.scopes && rule.scopes.length > 0) {
    const userScopes = user.scopes || [];
    const hasRequiredScope = rule.scopes.some(scope => userScopes.includes(scope));
    if (!hasRequiredScope) {
      return false;
    }
  }

  // Custom check
  if (rule.customCheck) {
    return await rule.customCheck(request);
  }

  return true;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  endpointAuthRules,
  isHealthEndpoint,
  normalizeEndpoint,
  getAuthRule,
  checkAuthorization
};
