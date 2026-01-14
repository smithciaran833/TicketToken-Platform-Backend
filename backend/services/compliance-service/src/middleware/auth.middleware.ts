/**
 * Authentication Middleware for Compliance Service
 * 
 * AUDIT FIXES:
 * - SEC-3: Webhook NOT HMAC verified → Proper HMAC with timing-safe comparison
 * - S2S-3: No JWT issuer/audience validation → Added algorithm, issuer, audience
 */
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { logger } from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

// Require JWT_SECRET - fail fast if not provided
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = process.env.JWT_ISSUER || 'tickettoken';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'tickettoken-api';

// Require WEBHOOK_SECRET in production
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
if (!WEBHOOK_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('WEBHOOK_SECRET environment variable is required in production');
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface AuthUser {
  id?: string;
  user_id?: string;
  roles?: string[];
  tenant_id?: string;
  [key: string]: any;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    tenantId?: string;
    requestId?: string;
  }
}

// =============================================================================
// JWT AUTHENTICATION MIDDLEWARE
// =============================================================================

/**
 * Standard authentication middleware with secure JWT validation
 * 
 * AUDIT FIX S2S-3: Added algorithm whitelist, issuer, and audience validation
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    logger.warn({ requestId: request.requestId }, 'Authentication failed: No token provided');
    return reply.code(401).send({ 
      error: 'Authentication required',
      type: 'urn:error:compliance-service:unauthorized',
      status: 401
    });
  }

  try {
    // AUDIT FIX S2S-3: Proper JWT verification with algorithm whitelist
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256', 'HS384', 'HS512'], // Algorithm whitelist - prevents algorithm confusion attacks
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      complete: false
    }) as AuthUser;
    
    request.user = decoded;
    
    // Require tenant_id in JWT - no default fallback
    if (!decoded.tenant_id) {
      logger.warn({ requestId: request.requestId }, 'Authentication failed: Token missing tenant_id');
      return reply.code(401).send({ 
        error: 'Token missing tenant_id',
        type: 'urn:error:compliance-service:invalid-token',
        status: 401
      });
    }
    
    request.tenantId = decoded.tenant_id;
    
    logger.debug({
      requestId: request.requestId,
      userId: decoded.id || decoded.user_id,
      tenantId: decoded.tenant_id
    }, 'User authenticated');
    
  } catch (error: any) {
    logger.warn({ 
      requestId: request.requestId,
      error: error.message 
    }, 'JWT verification failed');
    
    // Return appropriate error based on failure type
    if (error.name === 'TokenExpiredError') {
      return reply.code(401).send({ 
        error: 'Token has expired',
        type: 'urn:error:compliance-service:token-expired',
        status: 401
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return reply.code(401).send({ 
        error: 'Invalid token',
        type: 'urn:error:compliance-service:invalid-token',
        status: 401
      });
    }
    
    return reply.code(401).send({ 
      error: 'Authentication failed',
      type: 'urn:error:compliance-service:auth-failed',
      status: 401
    });
  }
}

// =============================================================================
// ROLE-BASED ACCESS CONTROL
// =============================================================================

/**
 * Admin only middleware
 */
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user?.roles?.includes('admin')) {
    logger.warn({
      requestId: request.requestId,
      userId: request.user?.id,
      tenantId: request.tenantId,
      roles: request.user?.roles
    }, 'Admin access denied');
    
    return reply.code(403).send({ 
      error: 'Admin access required',
      type: 'urn:error:compliance-service:forbidden',
      status: 403
    });
  }
}

/**
 * Compliance officer middleware
 */
export async function requireComplianceOfficer(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const validRoles = ['admin', 'compliance_officer', 'compliance_manager'];
  const hasRole = request.user?.roles?.some((role: string) => validRoles.includes(role));

  if (!hasRole) {
    logger.warn({
      requestId: request.requestId,
      userId: request.user?.id,
      tenantId: request.tenantId,
      roles: request.user?.roles
    }, 'Compliance officer access denied');
    
    return reply.code(403).send({ 
      error: 'Compliance officer access required',
      type: 'urn:error:compliance-service:forbidden',
      status: 403
    });
  }
}

// =============================================================================
// WEBHOOK HMAC AUTHENTICATION
// =============================================================================

/**
 * Generate HMAC signature for a payload
 * Used by webhook senders to sign their requests
 */
export function generateWebhookSignature(payload: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  return crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
}

/**
 * AUDIT FIX SEC-3: Secure webhook authentication with HMAC
 * 
 * Implements:
 * - HMAC-SHA256 signature verification
 * - Timing-safe comparison to prevent timing attacks
 * - Timestamp validation to prevent replay attacks
 * - Proper error handling
 */
export function webhookAuth(secret?: string) {
  const webhookSecret = secret || WEBHOOK_SECRET;
  
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Require webhook secret
    if (!webhookSecret) {
      logger.error({ requestId: request.requestId }, 'Webhook secret not configured');
      return reply.code(500).send({ 
        error: 'Webhook authentication not configured',
        type: 'urn:error:compliance-service:config-error',
        status: 500
      });
    }
    
    // Get signature and timestamp from headers
    const signature = request.headers['x-webhook-signature'] as string;
    const timestamp = request.headers['x-webhook-timestamp'] as string;
    
    if (!signature) {
      logger.warn({ requestId: request.requestId }, 'Webhook rejected: Missing signature header');
      return reply.code(401).send({ 
        error: 'Missing webhook signature',
        type: 'urn:error:compliance-service:webhook-auth-failed',
        status: 401
      });
    }
    
    // Validate timestamp to prevent replay attacks (5 minute window)
    const timestampNum = parseInt(timestamp || '0');
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 300; // 5 minutes
    
    if (!timestamp || isNaN(timestampNum) || now - timestampNum > maxAge) {
      logger.warn({ 
        requestId: request.requestId,
        timestamp: timestampNum,
        now,
        age: now - timestampNum
      }, 'Webhook rejected: Invalid or expired timestamp');
      return reply.code(401).send({ 
        error: 'Webhook timestamp invalid or expired',
        type: 'urn:error:compliance-service:webhook-expired',
        status: 401
      });
    }
    
    // Get the raw body for signature verification
    let rawBody: string;
    try {
      rawBody = typeof request.body === 'string' 
        ? request.body 
        : JSON.stringify(request.body);
    } catch (error) {
      logger.error({ requestId: request.requestId, error }, 'Failed to serialize webhook body');
      return reply.code(400).send({ 
        error: 'Invalid webhook payload',
        type: 'urn:error:compliance-service:invalid-payload',
        status: 400
      });
    }
    
    // Generate expected signature
    const expectedSignature = generateWebhookSignature(rawBody, webhookSecret, timestampNum);
    
    // AUDIT FIX: Use timing-safe comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    
    // Ensure buffers are the same length for timing-safe comparison
    if (signatureBuffer.length !== expectedBuffer.length) {
      logger.warn({ requestId: request.requestId }, 'Webhook rejected: Invalid signature length');
      return reply.code(401).send({ 
        error: 'Invalid webhook signature',
        type: 'urn:error:compliance-service:webhook-auth-failed',
        status: 401
      });
    }
    
    // Timing-safe comparison
    const isValid = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
    
    if (!isValid) {
      logger.warn({ requestId: request.requestId }, 'Webhook rejected: Signature mismatch');
      return reply.code(401).send({ 
        error: 'Invalid webhook signature',
        type: 'urn:error:compliance-service:webhook-auth-failed',
        status: 401
      });
    }
    
    // Extract tenant ID from webhook payload if present
    const body = request.body as any;
    if (body?.tenant_id) {
      request.tenantId = body.tenant_id;
    }
    
    logger.info({ 
      requestId: request.requestId,
      tenantId: request.tenantId
    }, 'Webhook signature verified');
  };
}

// =============================================================================
// INTERNAL SERVICE AUTHENTICATION
// =============================================================================

/**
 * Internal service-to-service authentication
 */
export async function internalAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const serviceSecret = request.headers['x-internal-service-secret'] as string;
  const serviceId = request.headers['x-service-id'] as string;
  
  const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
  
  if (!expectedSecret) {
    logger.error({ requestId: request.requestId }, 'Internal service secret not configured');
    return reply.code(500).send({ error: 'Internal auth not configured' });
  }
  
  if (!serviceSecret || !serviceId) {
    return reply.code(401).send({ error: 'Internal service authentication required' });
  }
  
  // Timing-safe comparison
  const secretBuffer = Buffer.from(serviceSecret);
  const expectedBuffer = Buffer.from(expectedSecret);
  
  if (secretBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(secretBuffer, expectedBuffer)) {
    logger.warn({ requestId: request.requestId, serviceId }, 'Internal auth failed');
    return reply.code(401).send({ error: 'Invalid internal service credentials' });
  }
  
  // Set tenant from header if provided
  const tenantId = request.headers['x-tenant-id'] as string;
  if (tenantId) {
    request.tenantId = tenantId;
  }
  
  logger.debug({ requestId: request.requestId, serviceId, tenantId }, 'Internal service authenticated');
}

// Alias for backwards compatibility
export const requireAuth = authenticate;

export default {
  authenticate,
  requireAuth,
  requireAdmin,
  requireComplianceOfficer,
  webhookAuth,
  internalAuth,
  generateWebhookSignature
};
