import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { createHash, timingSafeEqual } from 'crypto';

const log = logger.child({ component: 'ServiceAuth' });

/**
 * SECURITY FIX (SC4/HM19): Per-service credentials configuration
 * Each service has unique credentials for S2S communication
 */
export interface ServiceCredentials {
  serviceId: string;
  secretHash: string;  // Store hash, not plaintext
  allowedEndpoints: string[];  // AZ9: Per-endpoint authorization
  allowedOperations: string[];
  rotatedAt: Date;
  expiresAt: Date | null;
}

// Service allowlist with their allowed endpoints (AZ10)
const SERVICE_ALLOWLIST: Map<string, ServiceCredentials> = new Map([
  ['auth-service', {
    serviceId: 'auth-service',
    secretHash: '', // Set from env: SERVICE_SECRET_AUTH
    allowedEndpoints: ['/internal/*', '/api/v1/venues/validate'],
    allowedOperations: ['read'],
    rotatedAt: new Date(),
    expiresAt: null,
  }],
  ['event-service', {
    serviceId: 'event-service',
    secretHash: '', // Set from env: SERVICE_SECRET_EVENT
    allowedEndpoints: ['/internal/*', '/api/v1/venues/:venueId'],
    allowedOperations: ['read'],
    rotatedAt: new Date(),
    expiresAt: null,
  }],
  ['ticket-service', {
    serviceId: 'ticket-service',
    secretHash: '', // Set from env: SERVICE_SECRET_TICKET
    allowedEndpoints: ['/internal/*', '/api/v1/venues/:venueId', '/api/v1/venues/:venueId/settings'],
    allowedOperations: ['read'],
    rotatedAt: new Date(),
    expiresAt: null,
  }],
  ['payment-service', {
    serviceId: 'payment-service',
    secretHash: '', // Set from env: SERVICE_SECRET_PAYMENT
    allowedEndpoints: ['/internal/*', '/api/v1/venues/:venueId/stripe/*'],
    allowedOperations: ['read', 'write'],
    rotatedAt: new Date(),
    expiresAt: null,
  }],
]);

/**
 * Initialize service secrets from environment variables
 * SECURITY FIX (SM6): Load unique secrets per service
 */
export function initializeServiceSecrets(): void {
  const secretMappings: Record<string, string> = {
    'auth-service': 'SERVICE_SECRET_AUTH',
    'event-service': 'SERVICE_SECRET_EVENT',
    'ticket-service': 'SERVICE_SECRET_TICKET',
    'payment-service': 'SERVICE_SECRET_PAYMENT',
  };

  for (const [serviceId, envVar] of Object.entries(secretMappings)) {
    const secret = process.env[envVar];
    if (secret) {
      const config = SERVICE_ALLOWLIST.get(serviceId);
      if (config) {
        config.secretHash = hashSecret(secret);
        log.info({ serviceId }, 'Service secret configured');
      }
    } else {
      log.warn({ serviceId, envVar }, 'Service secret not configured');
    }
  }
}

/**
 * Hash a secret for secure storage/comparison
 */
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * SECURITY FIX (SC6/SM7): Check if credentials need rotation
 */
export function needsRotation(serviceId: string): boolean {
  const config = SERVICE_ALLOWLIST.get(serviceId);
  if (!config) return false;

  const rotationIntervalMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  const timeSinceRotation = Date.now() - config.rotatedAt.getTime();
  
  return timeSinceRotation > rotationIntervalMs;
}

/**
 * SECURITY FIX (AZ12): Default-deny authorization
 * Verify service is allowed to access the endpoint
 */
export function isEndpointAllowed(serviceId: string, endpoint: string, method: string): boolean {
  const config = SERVICE_ALLOWLIST.get(serviceId);
  if (!config) {
    log.warn({ serviceId, endpoint }, 'Unknown service attempted access');
    return false;
  }

  // Check if endpoint is in allowlist
  const endpointAllowed = config.allowedEndpoints.some(pattern => {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/:[\w]+/g, '[^/]+');
    return new RegExp(`^${regexPattern}$`).test(endpoint);
  });

  if (!endpointAllowed) {
    log.warn({ serviceId, endpoint }, 'Endpoint not in service allowlist');
    return false;
  }

  // Check operation type
  const operation = ['GET', 'HEAD', 'OPTIONS'].includes(method) ? 'read' : 'write';
  if (!config.allowedOperations.includes(operation)) {
    log.warn({ serviceId, endpoint, operation }, 'Operation not allowed for service');
    return false;
  }

  return true;
}

/**
 * Verify service-to-service authentication
 */
export function verifyServiceSecret(serviceId: string, providedSecret: string): boolean {
  const config = SERVICE_ALLOWLIST.get(serviceId);
  if (!config || !config.secretHash) {
    return false;
  }

  // Timing-safe comparison
  const providedHash = hashSecret(providedSecret);
  try {
    return timingSafeEqual(
      Buffer.from(config.secretHash, 'hex'),
      Buffer.from(providedHash, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * SECURITY FIX (AZ9-AZ12): Service-to-service authentication middleware
 */
export async function authenticateService(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const serviceId = request.headers['x-service-id'] as string;
  const serviceSecret = request.headers['x-service-secret'] as string;

  if (!serviceId || !serviceSecret) {
    log.warn({ path: request.url }, 'Missing service credentials');
    return reply.code(401).send({ error: 'Missing service credentials' });
  }

  // Verify service credentials
  if (!verifyServiceSecret(serviceId, serviceSecret)) {
    log.warn({ serviceId, path: request.url }, 'Invalid service credentials');
    return reply.code(401).send({ error: 'Invalid service credentials' });
  }

  // Check if rotation is needed
  if (needsRotation(serviceId)) {
    log.warn({ serviceId }, 'Service credentials need rotation');
    reply.header('X-Credentials-Rotation-Needed', 'true');
  }

  // Verify endpoint authorization (AZ9-AZ10)
  if (!isEndpointAllowed(serviceId, request.url, request.method)) {
    log.warn({ serviceId, path: request.url, method: request.method }, 'Endpoint not authorized for service');
    return reply.code(403).send({ error: 'Endpoint not authorized for this service' });
  }

  // Set service context on request
  (request as any).serviceContext = {
    serviceId,
    isServiceRequest: true,
  };
}

/**
 * Get list of services that need credential rotation
 */
export function getServicesNeedingRotation(): string[] {
  const needsRotationList: string[] = [];
  
  for (const [serviceId] of SERVICE_ALLOWLIST) {
    if (needsRotation(serviceId)) {
      needsRotationList.push(serviceId);
    }
  }
  
  return needsRotationList;
}

// Initialize secrets on module load
initializeServiceSecrets();
