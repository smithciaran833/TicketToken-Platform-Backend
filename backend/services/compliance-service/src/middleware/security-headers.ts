/**
 * Security Headers Middleware for Compliance Service
 * 
 * AUDIT FIXES:
 * - SEC-M1: HSTS explicitly configured
 * - SEC-M2: Metrics route network restriction
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface SecurityConfig {
  hsts: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  contentTypeOptions: boolean;
  frameOptions: 'DENY' | 'SAMEORIGIN' | false;
  xssProtection: boolean;
  referrerPolicy: string;
  permittedCrossOrigins: string[];
  metricsAllowedNetworks: string[];
}

const DEFAULT_CONFIG: SecurityConfig = {
  hsts: {
    enabled: process.env.NODE_ENV === 'production',
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  contentTypeOptions: true,
  frameOptions: 'DENY',
  xssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permittedCrossOrigins: [],
  metricsAllowedNetworks: [
    '10.0.0.0/8',       // Private network
    '172.16.0.0/12',    // Private network
    '192.168.0.0/16',   // Private network
    '127.0.0.1/32',     // Localhost
    '::1/128'           // IPv6 localhost
  ]
};

// =============================================================================
// SEC-M1: HSTS MIDDLEWARE
// =============================================================================

/**
 * SEC-M1: Add HSTS and other security headers
 */
export async function securityHeadersMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const config = DEFAULT_CONFIG;
  
  // HSTS (SEC-M1)
  if (config.hsts.enabled) {
    let hstsValue = `max-age=${config.hsts.maxAge}`;
    if (config.hsts.includeSubDomains) {
      hstsValue += '; includeSubDomains';
    }
    if (config.hsts.preload) {
      hstsValue += '; preload';
    }
    reply.header('Strict-Transport-Security', hstsValue);
  }
  
  // X-Content-Type-Options
  if (config.contentTypeOptions) {
    reply.header('X-Content-Type-Options', 'nosniff');
  }
  
  // X-Frame-Options
  if (config.frameOptions) {
    reply.header('X-Frame-Options', config.frameOptions);
  }
  
  // X-XSS-Protection (legacy but still useful)
  if (config.xssProtection) {
    reply.header('X-XSS-Protection', '1; mode=block');
  }
  
  // Referrer-Policy
  reply.header('Referrer-Policy', config.referrerPolicy);
  
  // Content-Security-Policy for API
  reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  
  // Cache-Control for API responses
  reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  
  // Remove server identification
  reply.removeHeader('X-Powered-By');
}

// =============================================================================
// SEC-M2: METRICS NETWORK RESTRICTION
// =============================================================================

/**
 * Parse IP address from request
 */
function getClientIP(request: FastifyRequest): string {
  // Check for forwarded headers (behind proxy/load balancer)
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(',');
    return ips[0].trim();
  }
  
  const realIP = request.headers['x-real-ip'];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }
  
  return request.ip || '0.0.0.0';
}

/**
 * Check if IP is in CIDR range
 */
function isIPInRange(ip: string, cidr: string): boolean {
  // Handle IPv6 localhost
  if (ip === '::1' && cidr === '::1/128') return true;
  if (ip === '::ffff:127.0.0.1' && cidr === '127.0.0.1/32') return true;
  
  const [range, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);
  
  // Simple check for exact match or localhost
  if (ip === range) return true;
  if (ip === '127.0.0.1' && cidr.startsWith('127.')) return true;
  
  // Parse IP to number
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);
  
  if (ipParts.length !== 4 || rangeParts.length !== 4) {
    return false;
  }
  
  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  const maskBits = ~((1 << (32 - mask)) - 1);
  
  return (ipNum & maskBits) === (rangeNum & maskBits);
}

/**
 * Check if request is from allowed network
 */
function isFromAllowedNetwork(request: FastifyRequest): boolean {
  const clientIP = getClientIP(request);
  const config = DEFAULT_CONFIG;
  
  for (const network of config.metricsAllowedNetworks) {
    if (isIPInRange(clientIP, network)) {
      return true;
    }
  }
  
  return false;
}

/**
 * SEC-M2: Metrics route network restriction middleware
 */
export async function metricsNetworkRestriction(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!isFromAllowedNetwork(request)) {
    const clientIP = getClientIP(request);
    
    logger.warn({
      clientIP,
      path: request.url
    }, 'Metrics access denied - IP not in allowed network');
    
    reply.code(403).send({
      type: 'urn:error:compliance-service:forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Access to metrics is restricted to internal networks',
      instance: request.id
    });
    return;
  }
}

// =============================================================================
// REGISTER PLUGIN
// =============================================================================

/**
 * Register security middleware with Fastify
 */
export async function registerSecurityMiddleware(app: FastifyInstance): Promise<void> {
  // Add security headers to all responses
  app.addHook('onRequest', securityHeadersMiddleware);
  
  logger.info({
    hstsEnabled: DEFAULT_CONFIG.hsts.enabled,
    hstsMaxAge: DEFAULT_CONFIG.hsts.maxAge
  }, 'Security headers middleware registered');
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  securityHeadersMiddleware,
  metricsNetworkRestriction,
  registerSecurityMiddleware,
  isFromAllowedNetwork
};
