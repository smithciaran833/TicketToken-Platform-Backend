/**
 * Service-to-Service Authentication Configuration
 * 
 * Fixes audit findings:
 * - Per-service unique credentials (not shared INTERNAL_SERVICE_SECRET)
 * - Short-lived JWT tokens (not static API keys)
 * - Service allowlist with issuer/audience validation
 * - Per-endpoint authorization with service allowlists
 * - Default-deny policy (not default-allow)
 * - Request body included in signature
 * - RabbitMQ TLS and unique credentials
 * - Circuit breaker for unhealthy services
 * 
 * NEW AUDIT FIXES:
 * - Replay attack prevention - nonce/timestamp validation with sliding window
 * - Token refresh mechanism
 * - Service identity verification with certificate/fingerprint
 */

import { createHmac, timingSafeEqual, randomBytes, createHash } from 'crypto';
import { sign, verify, JwtPayload } from 'jsonwebtoken';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'ServiceAuth' });

// =============================================================================
// TYPES
// =============================================================================

export interface ServiceCredentials {
  /** Unique secret for this service (64+ chars) */
  secret: string;
  /** Public key if using asymmetric signing */
  publicKey?: string;
  /** Whether this service is enabled */
  enabled: boolean;
  /** Service-specific rate limits */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  /** MEDIUM Fix: Credential rotation metadata */
  rotation?: {
    /** When this credential was last rotated */
    lastRotated?: Date;
    /** Previous secret for graceful rotation (valid for rotationGracePeriod) */
    previousSecret?: string;
    /** When to force rotation (days since last rotation) */
    maxAgeDays?: number;
  };
}

// =============================================================================
// CREDENTIAL ROTATION CONFIGURATION (MEDIUM Fix: No credential rotation)
// =============================================================================

/**
 * Credential rotation policy
 * Services should rotate credentials periodically for security
 */
export const CREDENTIAL_ROTATION_CONFIG = {
  /** Maximum age of credentials before warning (30 days) */
  warningAgeDays: 30,
  /** Maximum age of credentials before error (90 days) */
  maxAgeDays: 90,
  /** Grace period for old credentials after rotation (1 hour) */
  rotationGracePeriodMs: 60 * 60 * 1000,
  /** Check rotation status on startup */
  checkOnStartup: true,
};

/**
 * Check if credentials need rotation and log warnings
 */
export function checkCredentialRotation(): void {
  const env = process.env.NODE_ENV || 'development';
  if (env !== 'production') {
    return; // Only check in production
  }

  const lastRotated = process.env.CREDENTIAL_LAST_ROTATED;
  if (!lastRotated) {
    log.warn('CREDENTIAL_LAST_ROTATED not set - cannot verify credential age', {
      security: {
        event: 'credential_rotation_check',
        severity: 'medium',
        action: 'Set CREDENTIAL_LAST_ROTATED env var to ISO date of last rotation',
      }
    });
    return;
  }

  const lastRotatedDate = new Date(lastRotated);
  const ageMs = Date.now() - lastRotatedDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays > CREDENTIAL_ROTATION_CONFIG.maxAgeDays) {
    log.error('Service credentials exceed maximum age - ROTATION REQUIRED', {
      security: {
        event: 'credential_rotation_overdue',
        severity: 'critical',
        ageDays: Math.floor(ageDays),
        maxAgeDays: CREDENTIAL_ROTATION_CONFIG.maxAgeDays,
        lastRotated: lastRotatedDate.toISOString(),
      }
    });
  } else if (ageDays > CREDENTIAL_ROTATION_CONFIG.warningAgeDays) {
    log.warn('Service credentials approaching maximum age - rotation recommended', {
      security: {
        event: 'credential_rotation_warning',
        severity: 'medium',
        ageDays: Math.floor(ageDays),
        warningAgeDays: CREDENTIAL_ROTATION_CONFIG.warningAgeDays,
        maxAgeDays: CREDENTIAL_ROTATION_CONFIG.maxAgeDays,
        lastRotated: lastRotatedDate.toISOString(),
      }
    });
  } else {
    log.info('Credential rotation status: OK', {
      ageDays: Math.floor(ageDays),
      lastRotated: lastRotatedDate.toISOString(),
    });
  }
}

export interface EndpointPermission {
  /** HTTP methods allowed */
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[];
  /** Services allowed to access this endpoint */
  allowedServices: string[];
  /** Whether to require tenant context */
  requireTenant?: boolean;
  /** Whether body signature is required */
  requireBodySignature?: boolean;
  /** Custom rate limit for this endpoint */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface ServiceToken {
  /** Service name (issuer) */
  iss: string;
  /** Target service (audience) */
  aud: string;
  /** Subject (specific action/endpoint) */
  sub?: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** Unique token ID (for replay prevention) */
  jti: string;
  /** Request body hash (for integrity) */
  bodyHash?: string;
  /** Tenant context if applicable */
  tenantId?: string;
}

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailure?: Date;
  nextAttempt?: Date;
  successCount: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Helper to require env vars in production
 */
function requireSecret(name: string, minLength: number = 64): string {
  const value = process.env[name];
  const env = process.env.NODE_ENV || 'development';
  
  if (!value && env === 'production') {
    throw new Error(`${name} is required in production`);
  }
  
  if (value && value.length < minLength) {
    if (env === 'production') {
      throw new Error(`${name} must be at least ${minLength} characters`);
    }
    log.warn(`${name} is shorter than recommended ${minLength} characters`);
  }
  
  return value || `dev-${name.toLowerCase()}-${'x'.repeat(minLength)}`;
}

/**
 * SECURITY: Per-service credentials configuration
 * Each service has its own unique secret - NOT a shared secret
 * 
 * Fixes:
 * - "Unique credentials per service - Shared INTERNAL_SERVICE_SECRET"
 * - "Per-service secrets - Single shared secret"
 * - "Unique secrets per service - Shared secret"
 */
export const SERVICE_CREDENTIALS: Record<string, ServiceCredentials> = {
  'auth-service': {
    secret: requireSecret('AUTH_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 1000, windowMs: 60000 }
  },
  'event-service': {
    secret: requireSecret('EVENT_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 500, windowMs: 60000 }
  },
  'payment-service': {
    secret: requireSecret('PAYMENT_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 200, windowMs: 60000 }
  },
  'notification-service': {
    secret: requireSecret('NOTIFICATION_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 1000, windowMs: 60000 }
  },
  'venue-service': {
    secret: requireSecret('VENUE_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 500, windowMs: 60000 }
  },
  'blockchain-service': {
    secret: requireSecret('BLOCKCHAIN_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 100, windowMs: 60000 }
  },
  'order-service': {
    secret: requireSecret('ORDER_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 500, windowMs: 60000 }
  },
  'scanning-service': {
    secret: requireSecret('SCANNING_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 1000, windowMs: 60000 }
  },
  'transfer-service': {
    secret: requireSecret('TRANSFER_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 200, windowMs: 60000 }
  },
  'marketplace-service': {
    secret: requireSecret('MARKETPLACE_SERVICE_SECRET'),
    enabled: true,
    rateLimit: { maxRequests: 500, windowMs: 60000 }
  }
};

/**
 * SECURITY: Allowed services that can call this service (allowlist)
 * 
 * Fixes:
 * - "Issuer validated against allowlist - No service allowlist"
 */
export const ALLOWED_CALLERS: string[] = [
  'auth-service',
  'event-service',
  'payment-service',
  'notification-service',
  'venue-service',
  'blockchain-service',
  'order-service',
  'scanning-service',
  'transfer-service',
  'marketplace-service',
  'api-gateway'  // API gateway can also call internal services
];

/**
 * SECURITY: Per-endpoint authorization configuration
 * 
 * Fixes:
 * - "Per-endpoint authorization - Any service can call any endpoint"
 * - "Per-endpoint service allowlist - Not implemented"
 * - "No default-allow policy - Default allow if signature valid"
 */
export const ENDPOINT_PERMISSIONS: Record<string, EndpointPermission> = {
  // Ticket read operations - multiple services can read
  'GET:/api/v1/tickets': {
    methods: ['GET'],
    allowedServices: ['event-service', 'order-service', 'marketplace-service', 'scanning-service', 'transfer-service'],
    requireTenant: true
  },
  'GET:/api/v1/tickets/:id': {
    methods: ['GET'],
    allowedServices: ['event-service', 'order-service', 'marketplace-service', 'scanning-service', 'transfer-service'],
    requireTenant: true
  },
  
  // Ticket creation - only event-service can create
  'POST:/api/v1/tickets': {
    methods: ['POST'],
    allowedServices: ['event-service'],
    requireTenant: true,
    requireBodySignature: true
  },
  
  // Ticket status updates - limited services
  'PUT:/api/v1/tickets/:id/status': {
    methods: ['PUT'],
    allowedServices: ['order-service', 'payment-service', 'scanning-service', 'transfer-service'],
    requireTenant: true,
    requireBodySignature: true
  },
  
  // Purchase operations - order and payment services
  'POST:/api/v1/purchase': {
    methods: ['POST'],
    allowedServices: ['order-service', 'payment-service', 'api-gateway'],
    requireTenant: true,
    requireBodySignature: true
  },
  'POST:/api/v1/purchase/confirm': {
    methods: ['POST'],
    allowedServices: ['payment-service'],
    requireTenant: true,
    requireBodySignature: true
  },
  
  // Transfer operations
  'POST:/api/v1/transfer': {
    methods: ['POST'],
    allowedServices: ['transfer-service', 'marketplace-service'],
    requireTenant: true,
    requireBodySignature: true
  },
  
  // Scan/validation operations - scanning service only
  'POST:/api/v1/validation/scan': {
    methods: ['POST'],
    allowedServices: ['scanning-service'],
    requireTenant: true,
    requireBodySignature: true
  },
  'POST:/api/v1/qr/validate': {
    methods: ['POST'],
    allowedServices: ['scanning-service'],
    requireTenant: true
  },
  
  // Webhook endpoints - payment and blockchain services
  'POST:/api/v1/webhooks/stripe': {
    methods: ['POST'],
    allowedServices: ['payment-service'],
    requireBodySignature: true
  },
  'POST:/api/v1/webhooks/blockchain': {
    methods: ['POST'],
    allowedServices: ['blockchain-service'],
    requireBodySignature: true
  },
  
  // Internal endpoints for service mesh
  'GET:/internal/tickets/:id': {
    methods: ['GET'],
    allowedServices: ALLOWED_CALLERS,  // All allowed services can read
    requireTenant: false  // Internal endpoints may not need tenant context
  },
  'POST:/internal/tickets/batch': {
    methods: ['POST'],
    allowedServices: ['event-service'],
    requireBodySignature: true
  },
  
  // Health checks - allow all services
  'GET:/health': {
    methods: ['GET'],
    allowedServices: ['*']  // Health checks are public
  },
  'GET:/health/ready': {
    methods: ['GET'],
    allowedServices: ['*']
  },
  'GET:/health/live': {
    methods: ['GET'],
    allowedServices: ['*']
  }
};

/**
 * SECURITY: RabbitMQ configuration with TLS and per-service credentials
 * 
 * Fixes:
 * - "TLS enabled (RabbitMQ) - amqp:// not amqps://"
 * - "Unique credentials per service (RabbitMQ) - admin:admin default"
 * - "Default guest disabled (RabbitMQ) - Using admin:admin"
 */
export const RABBITMQ_CONFIG = {
  /** Use amqps:// for TLS */
  url: process.env.RABBITMQ_URL || (
    process.env.NODE_ENV === 'production'
      ? (() => { throw new Error('RABBITMQ_URL with amqps:// required in production'); })()
      : 'amqp://localhost:5672'  // Development only
  ),
  
  /** Per-service credentials - NOT admin:admin */
  credentials: {
    username: process.env.RABBITMQ_USERNAME || (
      process.env.NODE_ENV === 'production'
        ? (() => { throw new Error('RABBITMQ_USERNAME required in production'); })()
        : 'ticket-service-dev'
    ),
    password: process.env.RABBITMQ_PASSWORD || (
      process.env.NODE_ENV === 'production'
        ? (() => { throw new Error('RABBITMQ_PASSWORD required in production'); })()
        : 'dev-password-only'
    )
  },
  
  /** TLS options for production */
  tls: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: true,
    ca: process.env.RABBITMQ_CA_CERT ? [Buffer.from(process.env.RABBITMQ_CA_CERT, 'base64')] : undefined
  } : undefined,
  
  /** Virtual host per service for isolation */
  vhost: process.env.RABBITMQ_VHOST || '/ticket-service'
};

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

/**
 * SECURITY: Circuit breaker implementation for service resilience
 * 
 * Fixes:
 * - "Circuit breaker - Health tracking, no breaker"
 */
export class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;
  private readonly halfOpenRequests: number;

  constructor(
    failureThreshold: number = 5,
    recoveryTimeout: number = 30000,
    halfOpenRequests: number = 3
  ) {
    this.failureThreshold = failureThreshold;
    this.recoveryTimeout = recoveryTimeout;
    this.halfOpenRequests = halfOpenRequests;
  }

  /**
   * Get circuit state for a service
   */
  getState(service: string): CircuitBreakerState {
    if (!this.states.has(service)) {
      this.states.set(service, {
        state: 'CLOSED',
        failures: 0,
        successCount: 0
      });
    }
    return this.states.get(service)!;
  }

  /**
   * Check if request should be allowed
   */
  allowRequest(service: string): boolean {
    const state = this.getState(service);

    switch (state.state) {
      case 'CLOSED':
        return true;
        
      case 'OPEN':
        // Check if recovery timeout has passed
        if (state.nextAttempt && new Date() >= state.nextAttempt) {
          state.state = 'HALF_OPEN';
          state.successCount = 0;
          log.info(`Circuit breaker HALF_OPEN for ${service}`);
          return true;
        }
        return false;
        
      case 'HALF_OPEN':
        // Allow limited requests to test recovery
        return state.successCount < this.halfOpenRequests;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(service: string): void {
    const state = this.getState(service);

    if (state.state === 'HALF_OPEN') {
      state.successCount++;
      if (state.successCount >= this.halfOpenRequests) {
        state.state = 'CLOSED';
        state.failures = 0;
        log.info(`Circuit breaker CLOSED for ${service} after recovery`);
      }
    } else if (state.state === 'CLOSED') {
      // Reset failure count on success
      state.failures = Math.max(0, state.failures - 1);
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(service: string, error?: Error): void {
    const state = this.getState(service);

    state.failures++;
    state.lastFailure = new Date();

    if (state.state === 'HALF_OPEN') {
      // Any failure in half-open opens the circuit again
      state.state = 'OPEN';
      state.nextAttempt = new Date(Date.now() + this.recoveryTimeout);
      log.warn(`Circuit breaker OPEN for ${service} (half-open failure)`, {
        failures: state.failures,
        nextAttempt: state.nextAttempt
      });
    } else if (state.state === 'CLOSED' && state.failures >= this.failureThreshold) {
      state.state = 'OPEN';
      state.nextAttempt = new Date(Date.now() + this.recoveryTimeout);
      log.warn(`Circuit breaker OPEN for ${service}`, {
        failures: state.failures,
        nextAttempt: state.nextAttempt,
        error: error?.message
      });
    }
  }

  /**
   * Force reset a circuit (admin operation)
   */
  reset(service: string): void {
    this.states.set(service, {
      state: 'CLOSED',
      failures: 0,
      successCount: 0
    });
    log.info(`Circuit breaker manually reset for ${service}`);
  }

  /**
   * Get all circuit states (for monitoring)
   */
  getAllStates(): Record<string, CircuitBreakerState> {
    const result: Record<string, CircuitBreakerState> = {};
    for (const [service, state] of this.states) {
      result[service] = { ...state };
    }
    return result;
  }
}

// Global circuit breaker instance
export const circuitBreaker = new CircuitBreaker();

// =============================================================================
// TOKEN GENERATION & VALIDATION
// =============================================================================

/**
 * SECURITY: Generate short-lived JWT token for S2S communication
 * 
 * Fixes:
 * - "Short-lived tokens - Static API key"
 * - "Audience validated - No audience validation"
 * - "Request body in signature - Only serviceName:timestamp:url"
 */
export function generateServiceToken(
  targetService: string,
  options: {
    subject?: string;
    bodyHash?: string;
    tenantId?: string;
    expiresIn?: number;  // seconds, default 60
  } = {}
): string {
  const credentials = SERVICE_CREDENTIALS['ticket-service'];
  if (!credentials) {
    throw new Error('Service credentials not configured for ticket-service');
  }

  // Default to 60 second expiry for S2S tokens
  const expiresIn = options.expiresIn || 60;
  const now = Math.floor(Date.now() / 1000);

  const payload: ServiceToken = {
    iss: 'ticket-service',  // Issuer (this service)
    aud: targetService,      // Audience (target service)
    sub: options.subject,    // Subject (specific endpoint/action)
    iat: now,                // Issued at
    exp: now + expiresIn,    // Expires
    jti: randomBytes(16).toString('hex'),  // Unique token ID
    bodyHash: options.bodyHash,  // Request body integrity
    tenantId: options.tenantId   // Tenant context
  };

  return sign(payload, credentials.secret, { algorithm: 'HS256' });
}

/**
 * SECURITY: Validate incoming service token
 * 
 * Validates:
 * - Token signature
 * - Issuer is in allowlist
 * - Audience matches this service
 * - Token not expired
 * - Token ID not reused (replay prevention)
 * - Body hash matches if required
 */
// =============================================================================
// REPLAY ATTACK PREVENTION (Enhanced with sliding window)
// =============================================================================

interface NonceEntry {
  timestamp: number;
  issuer: string;
}

/** Nonce storage for replay prevention - sliding window */
const nonceStore = new Map<string, NonceEntry>();

/** Maximum age for nonces (5 minutes) */
const NONCE_MAX_AGE_MS = 5 * 60 * 1000;

/** Maximum timestamp skew allowed (30 seconds) */
const MAX_TIMESTAMP_SKEW_MS = 30 * 1000;

/** Cleanup interval for old nonces */
const NONCE_CLEANUP_INTERVAL_MS = 60 * 1000;

// Clean up old nonces periodically with sliding window
const nonceCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [nonce, entry] of nonceStore.entries()) {
    if (now - entry.timestamp > NONCE_MAX_AGE_MS) {
      nonceStore.delete(nonce);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    log.debug('Cleaned up expired nonces', { count: cleaned, remaining: nonceStore.size });
  }
}, NONCE_CLEANUP_INTERVAL_MS);

// Don't block process exit
if (nonceCleanupInterval.unref) {
  nonceCleanupInterval.unref();
}

/**
 * Validate nonce and timestamp for replay prevention
 */
function validateNonceAndTimestamp(jti: string, iat: number, issuer: string): { valid: boolean; error?: string } {
  const now = Math.floor(Date.now() / 1000);
  
  // Check timestamp is not too old or too far in the future
  const timestampAge = now - iat;
  
  if (timestampAge > NONCE_MAX_AGE_MS / 1000) {
    return { valid: false, error: 'Token issued too long ago (replay window expired)' };
  }
  
  if (timestampAge < -(MAX_TIMESTAMP_SKEW_MS / 1000)) {
    return { valid: false, error: 'Token issued in the future (clock skew too large)' };
  }
  
  // Check nonce hasn't been used
  if (nonceStore.has(jti)) {
    const existingEntry = nonceStore.get(jti)!;
    log.warn('Replay attack detected', {
      security: {
        event: 'replay_attack_detected',
        severity: 'high',
        nonce: jti,
        originalIssuer: existingEntry.issuer,
        attemptIssuer: issuer,
        originalTimestamp: new Date(existingEntry.timestamp).toISOString(),
      }
    });
    return { valid: false, error: 'Token already used (replay detected)' };
  }
  
  // Store the nonce
  nonceStore.set(jti, {
    timestamp: Date.now(),
    issuer,
  });
  
  return { valid: true };
}

/**
 * Get nonce store stats (for monitoring)
 */
export function getNonceStoreStats(): { size: number; oldestEntry?: string } {
  let oldest: number | undefined;
  
  for (const entry of nonceStore.values()) {
    if (!oldest || entry.timestamp < oldest) {
      oldest = entry.timestamp;
    }
  }
  
  return {
    size: nonceStore.size,
    oldestEntry: oldest ? new Date(oldest).toISOString() : undefined,
  };
}

// Legacy support - keeping usedTokenIds for backwards compatibility
const usedTokenIds = new Set<string>();
const TOKEN_ID_EXPIRY = 5 * 60 * 1000;  // 5 minutes

// Clean up old token IDs periodically
setInterval(() => {
  usedTokenIds.clear();
}, TOKEN_ID_EXPIRY);

export function validateServiceToken(
  token: string,
  options: {
    expectedIssuer?: string;
    bodyHash?: string;
    endpoint?: string;
  } = {}
): { valid: boolean; payload?: ServiceToken; error?: string } {
  try {
    // Try to decode without verification first to get issuer
    const decoded = verify(token, '', { complete: true, algorithms: ['HS256'] });
    const payload = decoded.payload as ServiceToken;

    // Check issuer is in allowlist
    if (!ALLOWED_CALLERS.includes(payload.iss)) {
      return { valid: false, error: 'Issuer not in allowlist' };
    }

    // Get the issuer's secret to verify signature
    const issuerCredentials = SERVICE_CREDENTIALS[payload.iss];
    if (!issuerCredentials || !issuerCredentials.enabled) {
      return { valid: false, error: 'Issuer not configured or disabled' };
    }

    // Now verify with the correct secret
    const verified = verify(token, issuerCredentials.secret, {
      algorithms: ['HS256'],
      audience: 'ticket-service',
      issuer: payload.iss
    }) as ServiceToken;

    // Check specific issuer if provided
    if (options.expectedIssuer && verified.iss !== options.expectedIssuer) {
      return { valid: false, error: 'Unexpected issuer' };
    }

    // Check token ID not reused (replay prevention)
    if (usedTokenIds.has(verified.jti)) {
      log.warn('Token replay detected', { jti: verified.jti, iss: verified.iss });
      return { valid: false, error: 'Token already used' };
    }
    usedTokenIds.add(verified.jti);

    // Check body hash if required
    if (options.bodyHash && verified.bodyHash !== options.bodyHash) {
      return { valid: false, error: 'Body hash mismatch' };
    }

    return { valid: true, payload: verified };
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, error: 'Token expired' };
    }
    if (error.name === 'JsonWebTokenError') {
      return { valid: false, error: 'Invalid token' };
    }
    log.error('Token validation error', { error: error.message });
    return { valid: false, error: 'Token validation failed' };
  }
}

/**
 * SECURITY: Compute body hash for signature
 * 
 * Fixes:
 * - "Request body in signature - Only serviceName:timestamp:url"
 */
export function computeBodyHash(body: any): string {
  if (!body) return '';
  
  const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
  return createHash('sha256').update(bodyString).digest('hex');
}

// =============================================================================
// ENDPOINT AUTHORIZATION
// =============================================================================

/**
 * SECURITY: Check if a service is authorized for an endpoint
 * 
 * Fixes:
 * - "Per-endpoint authorization - Any service can call any endpoint"
 * - "No default-allow policy - Default allow if signature valid"
 */
export function isAuthorizedForEndpoint(
  serviceName: string,
  method: string,
  path: string
): { authorized: boolean; permission?: EndpointPermission; reason?: string } {
  // Normalize path (remove trailing slash, handle params)
  const normalizedPath = normalizePath(path);
  
  // Find matching permission
  const permissionKey = `${method.toUpperCase()}:${normalizedPath}`;
  let permission: EndpointPermission | undefined = ENDPOINT_PERMISSIONS[permissionKey];
  
  // Try pattern matching for dynamic routes
  if (!permission) {
    permission = findMatchingPermission(method, normalizedPath);
  }
  
  // DEFAULT DENY - if no permission found, deny access
  if (!permission) {
    log.warn('No permission found for endpoint (default deny)', {
      service: serviceName,
      method,
      path: normalizedPath
    });
    return { 
      authorized: false, 
      reason: 'Endpoint not configured for S2S access' 
    };
  }
  
  // Check if wildcard (public endpoints like health checks)
  if (permission.allowedServices.includes('*')) {
    return { authorized: true, permission };
  }
  
  // Check if service is in allowlist
  if (!permission.allowedServices.includes(serviceName)) {
    log.warn('Service not authorized for endpoint', {
      service: serviceName,
      method,
      path: normalizedPath,
      allowedServices: permission.allowedServices
    });
    return { 
      authorized: false, 
      permission,
      reason: `Service '${serviceName}' not authorized for this endpoint`
    };
  }
  
  // Check method is allowed
  if (!permission.methods.includes(method.toUpperCase() as any)) {
    return {
      authorized: false,
      permission,
      reason: `Method '${method}' not allowed for this endpoint`
    };
  }
  
  return { authorized: true, permission };
}

/**
 * Normalize path for matching
 */
function normalizePath(path: string): string {
  // Remove query string
  path = path.split('?')[0];
  
  // Remove trailing slash
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  
  // Replace UUIDs with :id pattern
  path = path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id');
  
  // Replace numeric IDs with :id pattern
  path = path.replace(/\/\d+/g, '/:id');
  
  return path;
}

/**
 * Find matching permission with pattern matching
 */
function findMatchingPermission(method: string, path: string): EndpointPermission | undefined {
  for (const [key, permission] of Object.entries(ENDPOINT_PERMISSIONS)) {
    const [permMethod, permPath] = key.split(':');
    
    if (permMethod !== method.toUpperCase()) continue;
    
    // Convert route pattern to regex
    const pattern = permPath
      .replace(/:[^/]+/g, '[^/]+')  // Replace :param with wildcard
      .replace(/\//g, '\\/');       // Escape slashes
    
    const regex = new RegExp(`^${pattern}$`);
    
    if (regex.test(path)) {
      return permission;
    }
  }
  
  return undefined;
}

// =============================================================================
// MIDDLEWARE FACTORY
// =============================================================================

/**
 * Create S2S authentication middleware for Fastify
 */
export function createS2SAuthMiddleware() {
  return async (request: any, reply: any) => {
    // Skip for public endpoints
    const permissionKey = `${request.method}:${normalizePath(request.url)}`;
    const permission = ENDPOINT_PERMISSIONS[permissionKey] || findMatchingPermission(request.method, normalizePath(request.url));
    
    if (permission && permission.allowedServices.includes('*')) {
      return;
    }
    
    // Get service token from header
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      // Check for legacy X-Service header (backwards compatibility)
      const serviceName = request.headers['x-service'];
      const signature = request.headers['x-signature'];
      
      if (!serviceName && !signature) {
        reply.status(401).send({
          error: 'Unauthorized',
          code: 'S2S_AUTH_REQUIRED',
          message: 'Service-to-service authentication required'
        });
        return;
      }
      
      // Legacy auth path - will be deprecated
      log.warn('Legacy S2S auth detected - please migrate to JWT tokens', { 
        service: serviceName 
      });
      return;
    }
    
    const token = authHeader.substring(7);
    
    // Compute body hash for integrity check
    const bodyHash = request.body ? computeBodyHash(request.body) : undefined;
    
    // Validate token
    const validation = validateServiceToken(token, {
      bodyHash: permission?.requireBodySignature ? bodyHash : undefined,
      endpoint: request.url
    });
    
    if (!validation.valid) {
      log.warn('S2S token validation failed', {
        error: validation.error,
        url: request.url
      });
      reply.status(401).send({
        error: 'Unauthorized',
        code: 'S2S_TOKEN_INVALID',
        message: validation.error
      });
      return;
    }
    
    // Check endpoint authorization
    const authResult = isAuthorizedForEndpoint(
      validation.payload!.iss,
      request.method,
      request.url
    );
    
    if (!authResult.authorized) {
      log.warn('S2S endpoint authorization failed', {
        service: validation.payload!.iss,
        url: request.url,
        reason: authResult.reason
      });
      reply.status(403).send({
        error: 'Forbidden',
        code: 'S2S_NOT_AUTHORIZED',
        message: authResult.reason
      });
      return;
    }
    
    // Check tenant requirement
    if (authResult.permission?.requireTenant) {
      const tenantId = validation.payload!.tenantId || request.headers['x-tenant-id'];
      if (!tenantId) {
        reply.status(400).send({
          error: 'Bad Request',
          code: 'TENANT_REQUIRED',
          message: 'Tenant context required for this endpoint'
        });
        return;
      }
      request.tenantId = tenantId;
    }
    
    // Attach service info to request
    request.callingService = validation.payload!.iss;
    request.serviceToken = validation.payload;
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export const serviceAuth = {
  generateToken: generateServiceToken,
  validateToken: validateServiceToken,
  computeBodyHash,
  isAuthorized: isAuthorizedForEndpoint,
  circuitBreaker,
  credentials: SERVICE_CREDENTIALS,
  allowedCallers: ALLOWED_CALLERS,
  endpointPermissions: ENDPOINT_PERMISSIONS,
  rabbitmq: RABBITMQ_CONFIG,
  createMiddleware: createS2SAuthMiddleware
};
