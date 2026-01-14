import { logger } from '../utils/logger';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { trace, context, SpanContext } from '@opentelemetry/api';

/**
 * Service-to-Service (S2S) Authentication Configuration
 *
 * CRITICAL FIX for audit findings:
 * - SI1: Cryptographic identity (UUID + signature)
 * - SI2: Identity from env/secrets
 * - SI3: Service certificate/token
 * - SI4: Identity validated at startup
 * - SI5: Identity rotation mechanism
 * - OR1: S2S calls authenticated
 * - OR2: Dedicated service credentials
 * - TM6: Token scope validation
 * - TM8: Compromised token revocation
 *
 * This module provides service identity and token management for
 * authenticating service-to-service calls.
 */

// ============================================================
// TM6: Token Scope Definitions
// ============================================================

/**
 * Available permission scopes for service tokens
 */
export type TokenScope =
  | 'events:read'
  | 'events:write'
  | 'events:delete'
  | 'venues:read'
  | 'tickets:read'
  | 'tickets:write'
  | 'orders:read'
  | 'orders:write'
  | 'admin:*';

/**
 * Service-to-scope mapping - what each service is allowed to do
 */
const SERVICE_SCOPES: Record<string, TokenScope[]> = {
  'auth-service': ['events:read', 'venues:read', 'admin:*'],
  'venue-service': ['events:read', 'events:write', 'venues:read'],
  'ticket-service': ['events:read', 'tickets:read', 'tickets:write'],
  'order-service': ['events:read', 'tickets:read', 'orders:read', 'orders:write'],
  'payment-service': ['events:read', 'orders:read', 'orders:write'],
  'notification-service': ['events:read', 'tickets:read', 'orders:read'],
  'search-service': ['events:read', 'venues:read'],
  'analytics-service': ['events:read', 'tickets:read', 'orders:read'],
};

/**
 * Get allowed scopes for a service
 */
export function getServiceScopes(serviceId: string): TokenScope[] {
  return SERVICE_SCOPES[serviceId] || ['events:read']; // Default: read-only
}

/**
 * Check if a service has a specific scope
 */
export function hasScope(serviceId: string, requiredScope: TokenScope): boolean {
  const scopes = getServiceScopes(serviceId);
  
  // Admin scope grants all permissions
  if (scopes.includes('admin:*')) {
    return true;
  }
  
  return scopes.includes(requiredScope);
}

/**
 * Validate that a token's scopes allow the requested operation
 */
export function validateTokenScopes(
  tokenScopes: TokenScope[],
  requiredScopes: TokenScope[]
): { valid: boolean; missing?: TokenScope[] } {
  // Admin scope grants all
  if (tokenScopes.includes('admin:*')) {
    return { valid: true };
  }

  const missing = requiredScopes.filter(scope => !tokenScopes.includes(scope));
  
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  
  return { valid: true };
}

// ============================================================
// TM8: Token Revocation
// ============================================================

/**
 * In-memory revocation list for compromised tokens
 * In production, this should be backed by Redis for cluster-wide revocation
 */
class TokenRevocationManager {
  private revokedTokens: Map<string, { revokedAt: Date; reason: string; expiresAt: Date }> = new Map();
  private revokedServices: Map<string, { revokedAt: Date; reason: string }> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired revocations every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    logger.info('Token revocation manager initialized');
  }

  /**
   * Revoke a specific token
   */
  revokeToken(tokenHash: string, reason: string, expiresAt: Date): void {
    this.revokedTokens.set(tokenHash, {
      revokedAt: new Date(),
      reason,
      expiresAt,
    });
    logger.warn({ tokenHash: tokenHash.substring(0, 8) + '...', reason }, 'Token revoked');
  }

  /**
   * Revoke all tokens from a service (emergency)
   */
  revokeService(serviceId: string, reason: string): void {
    this.revokedServices.set(serviceId, {
      revokedAt: new Date(),
      reason,
    });
    logger.warn({ serviceId, reason }, 'All tokens from service revoked');
  }

  /**
   * Unrevoke a service (after incident resolution)
   */
  unrevokeService(serviceId: string): void {
    this.revokedServices.delete(serviceId);
    logger.info({ serviceId }, 'Service unrevoked');
  }

  /**
   * Check if a token is revoked
   */
  isTokenRevoked(tokenHash: string): boolean {
    return this.revokedTokens.has(tokenHash);
  }

  /**
   * Check if a service is revoked
   */
  isServiceRevoked(serviceId: string): boolean {
    return this.revokedServices.has(serviceId);
  }

  /**
   * Get revocation info for a token
   */
  getTokenRevocationInfo(tokenHash: string): { revokedAt: Date; reason: string } | null {
    const info = this.revokedTokens.get(tokenHash);
    return info ? { revokedAt: info.revokedAt, reason: info.reason } : null;
  }

  /**
   * Get revocation info for a service
   */
  getServiceRevocationInfo(serviceId: string): { revokedAt: Date; reason: string } | null {
    return this.revokedServices.get(serviceId) || null;
  }

  /**
   * Get revocation statistics
   */
  getStats(): { revokedTokens: number; revokedServices: number } {
    return {
      revokedTokens: this.revokedTokens.size,
      revokedServices: this.revokedServices.size,
    };
  }

  /**
   * Clean up expired revocations
   */
  private cleanup(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [hash, info] of this.revokedTokens) {
      if (info.expiresAt < now) {
        this.revokedTokens.delete(hash);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, 'Cleaned up expired token revocations');
    }
  }

  /**
   * Shutdown - clean up timers
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    logger.info('Token revocation manager shutdown');
  }
}

// Singleton revocation manager
const revocationManager = new TokenRevocationManager();

// Export revocation functions
export const revokeToken = (tokenHash: string, reason: string, expiresAt: Date) =>
  revocationManager.revokeToken(tokenHash, reason, expiresAt);
export const revokeService = (serviceId: string, reason: string) =>
  revocationManager.revokeService(serviceId, reason);
export const unrevokeService = (serviceId: string) =>
  revocationManager.unrevokeService(serviceId);
export const isTokenRevoked = (tokenHash: string) =>
  revocationManager.isTokenRevoked(tokenHash);
export const isServiceRevoked = (serviceId: string) =>
  revocationManager.isServiceRevoked(serviceId);
export const getRevocationStats = () => revocationManager.getStats();

// ============================================================
// Service Identity
// ============================================================

export interface ServiceIdentity {
  /** Unique service instance ID (UUID) */
  serviceId: string;
  /** Logical service name */
  serviceName: string;
  /** Cryptographic instance ID - unique per deployment */
  instanceId: string;
  /** Public key fingerprint for verification */
  publicKeyFingerprint: string;
  environment: string;
  version: string;
  /** Full public key (PEM format) */
  publicKey?: string;
  /** Identity creation timestamp */
  createdAt: Date;
  /** Identity valid until (for rotation) */
  validUntil: Date;
}

/**
 * Credential version for rotation support
 */
interface CredentialVersion {
  version: number;
  secret: string;
  validFrom: Date;
  validUntil: Date;
  isPrimary: boolean;
}

export interface ServiceToken {
  token: string;
  expiresAt: Date;
  serviceId: string;
  scopes: TokenScope[];
}

// Service configuration from environment
const SERVICE_CONFIG = {
  serviceId: process.env.SERVICE_ID || 'event-service',
  serviceName: process.env.SERVICE_NAME || 'event-service',
  serviceSecret: process.env.SERVICE_SECRET || '',
  // SI5: Support for rotated secrets (old secret for validation during rotation)
  serviceSecretPrevious: process.env.SERVICE_SECRET_PREVIOUS || '',
  environment: process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '1.0.0',

  // Trusted services
  trustedServices: (process.env.TRUSTED_SERVICES || 'auth-service,venue-service,ticket-service,order-service').split(','),

  // Token settings - CRITICAL FIX (TM3): Short-lived tokens (5 minutes default)
  tokenExpirySecs: parseInt(process.env.SERVICE_TOKEN_EXPIRY_SECS || '300', 10),

  // CRITICAL FIX (TM2): Token refresh buffer (refresh when 60 seconds left)
  tokenRefreshBufferSecs: parseInt(process.env.TOKEN_REFRESH_BUFFER_SECS || '60', 10),

  // API Keys for inbound requests from other services
  apiKeys: parseApiKeys(process.env.SERVICE_API_KEYS || ''),

  // SI5: Identity rotation window (24 hours default - both old and new creds valid)
  identityRotationWindowHours: parseInt(process.env.IDENTITY_ROTATION_WINDOW_HOURS || '24', 10),

  // SI1: Identity validity period (30 days default)
  identityValidityDays: parseInt(process.env.IDENTITY_VALIDITY_DAYS || '30', 10),
};

/**
 * SI1: Generate cryptographic instance ID
 * Creates a unique identifier for this service instance using UUID + machine fingerprint
 */
function generateInstanceId(): string {
  const machineId = process.env.HOSTNAME || process.env.POD_NAME || crypto.randomBytes(8).toString('hex');
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${SERVICE_CONFIG.serviceId}-${machineId}-${timestamp}-${random}`;
}

/**
 * SI1: Generate public key fingerprint from service secret
 * In production, this would use actual PKI certificates
 */
function generatePublicKeyFingerprint(): string {
  const secret = SERVICE_CONFIG.serviceSecret || 'dev-secret';
  return crypto.createHash('sha256').update(secret).digest('hex').substring(0, 16);
}

// SI1: Cached service identity (generated once at startup)
let cachedServiceIdentity: ServiceIdentity | null = null;

/**
 * SI5: Credential Rotation Manager
 *
 * Supports graceful credential rotation:
 * 1. New secret is added to SERVICE_SECRET
 * 2. Old secret moved to SERVICE_SECRET_PREVIOUS
 * 3. Both secrets are valid during rotation window
 * 4. After rotation window, old secret is removed
 */
class CredentialRotationManager {
  private credentials: CredentialVersion[] = [];

  constructor() {
    this.initializeCredentials();
  }

  private initializeCredentials(): void {
    const now = new Date();
    const rotationWindowMs = SERVICE_CONFIG.identityRotationWindowHours * 60 * 60 * 1000;

    // Primary (current) credential
    if (SERVICE_CONFIG.serviceSecret) {
      this.credentials.push({
        version: 2,
        secret: SERVICE_CONFIG.serviceSecret,
        validFrom: now,
        validUntil: new Date(now.getTime() + SERVICE_CONFIG.identityValidityDays * 24 * 60 * 60 * 1000),
        isPrimary: true,
      });
    }

    // Previous credential (for rotation)
    if (SERVICE_CONFIG.serviceSecretPrevious) {
      this.credentials.push({
        version: 1,
        secret: SERVICE_CONFIG.serviceSecretPrevious,
        validFrom: new Date(now.getTime() - rotationWindowMs),
        validUntil: new Date(now.getTime() + rotationWindowMs), // Valid for rotation window
        isPrimary: false,
      });
    }

    logger.info({
      credentialCount: this.credentials.length,
      hasRotationCredential: !!SERVICE_CONFIG.serviceSecretPrevious,
    }, 'Credential rotation manager initialized');
  }

  /**
   * Get the primary secret for signing
   */
  getPrimarySecret(): string {
    const primary = this.credentials.find(c => c.isPrimary);
    return primary?.secret || 'dev-secret';
  }

  /**
   * Verify a signature against all valid credentials
   * Used during rotation when both old and new secrets should be accepted
   */
  verifyWithAnyValidCredential(payload: string, signature: string): boolean {
    const now = new Date();

    for (const cred of this.credentials) {
      // Skip expired credentials
      if (cred.validUntil < now) continue;

      const expectedSig = crypto
        .createHmac('sha256', cred.secret)
        .update(payload)
        .digest('hex');

      if (timingSafeEqual(signature, expectedSig)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get rotation status for monitoring
   */
  getRotationStatus(): { isRotating: boolean; primaryVersion: number; validCredentials: number } {
    const now = new Date();
    const validCreds = this.credentials.filter(c => c.validUntil > now);
    const primary = this.credentials.find(c => c.isPrimary);

    return {
      isRotating: validCreds.length > 1,
      primaryVersion: primary?.version || 0,
      validCredentials: validCreds.length,
    };
  }
}

// Singleton credential rotation manager
const credentialManager = new CredentialRotationManager();

/**
 * Token Manager - CRITICAL FIX for TM1, TM2, TM3
 *
 * Manages service token lifecycle:
 * - TM1: Tokens have expiration (expiresAt field)
 * - TM2: Automatic refresh mechanism (refreshes before expiry)
 * - TM3: Short-lived tokens (5 minutes by default)
 */
class ServiceTokenManager {
  private currentToken: ServiceToken | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  /**
   * Get a valid service token, refreshing if needed
   */
  getToken(): ServiceToken {
    // If no token or token is expired/expiring soon, generate new one
    if (!this.currentToken || this.isTokenExpiring(this.currentToken)) {
      this.refreshToken();
    }
    return this.currentToken!;
  }

  /**
   * Check if token is expired or expiring soon
   */
  private isTokenExpiring(token: ServiceToken): boolean {
    const now = new Date();
    const bufferMs = SERVICE_CONFIG.tokenRefreshBufferSecs * 1000;
    return token.expiresAt.getTime() - now.getTime() <= bufferMs;
  }

  /**
   * Refresh the current token
   */
  refreshToken(): ServiceToken {
    const token = generateServiceToken();
    this.currentToken = token;

    // Schedule automatic refresh before expiry
    this.scheduleRefresh(token);

    logger.debug({
      serviceId: token.serviceId,
      expiresAt: token.expiresAt.toISOString(),
      scopes: token.scopes,
    }, 'Service token refreshed');

    return token;
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleRefresh(token: ServiceToken): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    // Calculate when to refresh (before expiry buffer)
    const now = new Date();
    const refreshAt = token.expiresAt.getTime() - now.getTime() - (SERVICE_CONFIG.tokenRefreshBufferSecs * 1000);

    if (refreshAt > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshToken();
      }, refreshAt);
    }
  }

  /**
   * Get token expiration info
   */
  getTokenInfo(): { hasToken: boolean; expiresAt?: string; expiresInSecs?: number; scopes?: TokenScope[] } {
    if (!this.currentToken) {
      return { hasToken: false };
    }

    const now = new Date();
    const expiresInMs = this.currentToken.expiresAt.getTime() - now.getTime();

    return {
      hasToken: true,
      expiresAt: this.currentToken.expiresAt.toISOString(),
      expiresInSecs: Math.max(0, Math.floor(expiresInMs / 1000)),
      scopes: this.currentToken.scopes,
    };
  }

  /**
   * Shutdown - clean up timers
   */
  shutdown(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.currentToken = null;
    logger.info('Service token manager shutdown');
  }
}

// Singleton token manager
const tokenManager = new ServiceTokenManager();

/**
 * Parse API keys from environment variable
 * Format: "service1:key1,service2:key2"
 */
function parseApiKeys(keysStr: string): Map<string, string> {
  const keys = new Map<string, string>();
  if (!keysStr) return keys;

  keysStr.split(',').forEach(pair => {
    const [service, key] = pair.split(':');
    if (service && key) {
      keys.set(key.trim(), service.trim());
    }
  });

  return keys;
}

/**
 * SI1: Get the current service identity with cryptographic identity
 * Creates identity once and caches it for the service lifetime
 */
export function getServiceIdentity(): ServiceIdentity {
  // Return cached identity if available
  if (cachedServiceIdentity) {
    return cachedServiceIdentity;
  }

  // Generate new cryptographic identity
  const now = new Date();
  const validityMs = SERVICE_CONFIG.identityValidityDays * 24 * 60 * 60 * 1000;

  cachedServiceIdentity = {
    serviceId: SERVICE_CONFIG.serviceId,
    serviceName: SERVICE_CONFIG.serviceName,
    instanceId: generateInstanceId(),
    publicKeyFingerprint: generatePublicKeyFingerprint(),
    environment: SERVICE_CONFIG.environment,
    version: SERVICE_CONFIG.version,
    createdAt: now,
    validUntil: new Date(now.getTime() + validityMs),
  };

  logger.info({
    serviceId: cachedServiceIdentity.serviceId,
    instanceId: cachedServiceIdentity.instanceId,
    fingerprint: cachedServiceIdentity.publicKeyFingerprint,
    validUntil: cachedServiceIdentity.validUntil.toISOString(),
  }, 'Cryptographic service identity generated');

  return cachedServiceIdentity;
}

/**
 * SI5: Get credential rotation status
 */
export function getCredentialRotationStatus(): { isRotating: boolean; primaryVersion: number; validCredentials: number } {
  return credentialManager.getRotationStatus();
}

/**
 * Validate service identity on startup
 * Throws if required configuration is missing
 */
export function validateServiceIdentity(): void {
  const errors: string[] = [];

  if (!SERVICE_CONFIG.serviceId) {
    errors.push('SERVICE_ID is required');
  }

  if (!SERVICE_CONFIG.serviceName) {
    errors.push('SERVICE_NAME is required');
  }

  if (SERVICE_CONFIG.environment === 'production' && !SERVICE_CONFIG.serviceSecret) {
    errors.push('SERVICE_SECRET is required in production');
  }

  if (errors.length > 0) {
    logger.error({ errors }, 'Service identity validation failed');
    throw new Error(`Service identity validation failed: ${errors.join(', ')}`);
  }

  logger.info({
    serviceId: SERVICE_CONFIG.serviceId,
    serviceName: SERVICE_CONFIG.serviceName,
    environment: SERVICE_CONFIG.environment,
  }, 'Service identity validated');
}

/**
 * Generate a service token for outbound S2S requests
 *
 * Token format: base64(JSON({ serviceId, timestamp, nonce, scopes, signature }))
 * TM6: Includes scopes in token
 */
export function generateServiceToken(): ServiceToken {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SERVICE_CONFIG.tokenExpirySecs * 1000);
  const nonce = crypto.randomBytes(16).toString('hex');
  const scopes = getServiceScopes(SERVICE_CONFIG.serviceId);

  const payload = {
    iss: SERVICE_CONFIG.serviceId,
    sub: SERVICE_CONFIG.serviceName,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    nonce,
    env: SERVICE_CONFIG.environment,
    scopes, // TM6: Include scopes in token
  };

  // Sign the payload
  const payloadStr = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', SERVICE_CONFIG.serviceSecret || 'dev-secret')
    .update(payloadStr)
    .digest('hex');

  const token = Buffer.from(JSON.stringify({
    ...payload,
    sig: signature,
  })).toString('base64');

  return {
    token,
    expiresAt,
    serviceId: SERVICE_CONFIG.serviceId,
    scopes,
  };
}

/**
 * Hash a token for revocation lookup
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify an incoming service token
 * TM6: Returns scopes for authorization
 * TM8: Checks revocation list
 */
export function verifyServiceToken(token: string): {
  valid: boolean;
  serviceId?: string;
  scopes?: TokenScope[];
  error?: string;
} {
  try {
    // TM8: Check if token is revoked
    const tokenHash = hashToken(token);
    if (isTokenRevoked(tokenHash)) {
      const info = revocationManager.getTokenRevocationInfo(tokenHash);
      logger.warn({ tokenHash: tokenHash.substring(0, 8) }, 'Revoked token used');
      return { valid: false, error: `Token revoked: ${info?.reason || 'unknown'}` };
    }

    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));

    // TM8: Check if service is revoked
    if (isServiceRevoked(decoded.iss)) {
      const info = revocationManager.getServiceRevocationInfo(decoded.iss);
      logger.warn({ serviceId: decoded.iss }, 'Revoked service attempted access');
      return { valid: false, error: `Service revoked: ${info?.reason || 'unknown'}` };
    }

    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }

    // Check issuer is a trusted service
    if (!SERVICE_CONFIG.trustedServices.includes(decoded.iss)) {
      return { valid: false, error: 'Untrusted service' };
    }

    // Verify signature (requires shared secret or public key)
    const { sig, ...payload } = decoded;
    const expectedSig = crypto
      .createHmac('sha256', SERVICE_CONFIG.serviceSecret || 'dev-secret')
      .update(JSON.stringify(payload))
      .digest('hex');

    // Use timing-safe comparison
    if (!timingSafeEqual(sig, expectedSig)) {
      return { valid: false, error: 'Invalid signature' };
    }

    // TM6: Return scopes from token
    const scopes = decoded.scopes || getServiceScopes(decoded.iss);

    return { valid: true, serviceId: decoded.iss, scopes };
  } catch (error: any) {
    logger.warn({ error: error.message }, 'Failed to verify service token');
    return { valid: false, error: 'Invalid token format' };
  }
}

/**
 * Verify an API key for inbound service requests
 */
export function verifyApiKey(apiKey: string): { valid: boolean; serviceId?: string; error?: string } {
  if (!apiKey) {
    return { valid: false, error: 'API key required' };
  }

  // Hash the incoming key for comparison
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Check against configured keys
  const serviceId = SERVICE_CONFIG.apiKeys.get(apiKey);
  if (serviceId) {
    // TM8: Check if service is revoked
    if (isServiceRevoked(serviceId)) {
      return { valid: false, error: 'Service revoked' };
    }
    return { valid: true, serviceId };
  }

  // Also check hashed keys (for production where keys are stored hashed)
  const hashedServiceId = SERVICE_CONFIG.apiKeys.get(keyHash);
  if (hashedServiceId) {
    // TM8: Check if service is revoked
    if (isServiceRevoked(hashedServiceId)) {
      return { valid: false, error: 'Service revoked' };
    }
    return { valid: true, serviceId: hashedServiceId };
  }

  return { valid: false, error: 'Invalid API key' };
}

/**
 * Generate W3C Trace Context traceparent header from current span
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 * Example: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
 */
function getTraceParentHeader(): string | null {
  try {
    const span = trace.getSpan(context.active());
    if (!span) return null;

    const spanContext = span.spanContext();
    if (!spanContext || !spanContext.traceId || !spanContext.spanId) return null;

    // W3C Trace Context version is 00
    const version = '00';
    const traceId = spanContext.traceId;
    const spanId = spanContext.spanId;
    // Trace flags: 01 = sampled, 00 = not sampled
    const traceFlags = spanContext.traceFlags ? spanContext.traceFlags.toString(16).padStart(2, '0') : '00';

    return `${version}-${traceId}-${spanId}-${traceFlags}`;
  } catch (error) {
    // OpenTelemetry not initialized or no active span
    return null;
  }
}

/**
 * Get headers for outbound S2S requests
 *
 * CRITICAL FIX for audit findings:
 * - Includes W3C Trace Context headers (traceparent, tracestate) for distributed tracing
 * - Propagates trace context across service boundaries
 */
export function getS2SHeaders(): Record<string, string> {
  const token = generateServiceToken();

  const headers: Record<string, string> = {
    'X-Service-Token': token.token,
    'X-Service-ID': SERVICE_CONFIG.serviceId,
    'X-Service-Name': SERVICE_CONFIG.serviceName,
    'X-Request-ID': crypto.randomBytes(8).toString('hex'),
    'User-Agent': `${SERVICE_CONFIG.serviceName}/${SERVICE_CONFIG.version}`,
  };

  // Add W3C Trace Context headers if available
  const traceparent = getTraceParentHeader();
  if (traceparent) {
    headers['traceparent'] = traceparent;

    // Add tracestate if available (vendor-specific trace data)
    try {
      const span = trace.getSpan(context.active());
      if (span) {
        const spanContext = span.spanContext();
        if (spanContext.traceState) {
          const traceState = spanContext.traceState.serialize();
          if (traceState) {
            headers['tracestate'] = traceState;
          }
        }
      }
    } catch {
      // tracestate is optional, ignore errors
    }
  }

  return headers;
}

/**
 * Check if a service is trusted for S2S communication
 */
export function isTrustedService(serviceId: string): boolean {
  return SERVICE_CONFIG.trustedServices.includes(serviceId);
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf-8'),
      Buffer.from(b, 'utf-8')
    );
  } catch {
    return false;
  }
}

/**
 * Shutdown all managers
 */
export function shutdownServiceAuth(): void {
  tokenManager.shutdown();
  revocationManager.shutdown();
}

// Export the config for testing
export const serviceConfig = SERVICE_CONFIG;
