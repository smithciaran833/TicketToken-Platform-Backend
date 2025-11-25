import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../logger';

/**
 * Middleware to secure Prometheus /metrics endpoint
 * Supports two authentication methods:
 * 1. IP whitelist (PROMETHEUS_ALLOWED_IPS)
 * 2. Basic authentication (METRICS_BASIC_AUTH)
 */

function parseIPWhitelist(): string[] {
  const allowedIPs = process.env.PROMETHEUS_ALLOWED_IPS || '127.0.0.1';
  return allowedIPs.split(',').map(ip => ip.trim());
}

function parseBasicAuth():{ username: string; password: string } | null {
  const basicAuth = process.env.METRICS_BASIC_AUTH;
  if (!basicAuth) return null;
  
  const [username, password] = basicAuth.split(':');
  if (!username || !password) {
    logger.warn('Invalid METRICS_BASIC_AUTH format. Expected username:password');
    return null;
  }
  
  return { username, password };
}

function getClientIP(request: FastifyRequest): string {
  // Check X-Forwarded-For header (from proxy/load balancer)
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }
  
  // Check X-Real-IP header
  const realIP = request.headers['x-real-ip'];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }
  
  // Fallback to socket remote address
  return request.socket.remoteAddress || 'unknown';
}

function isIPAllowed(clientIP: string, allowedIPs: string[]): boolean {
  // Check if client IP matches any allowed IP or CIDR range
  for (const allowed of allowedIPs) {
    if (allowed === clientIP) {
      return true;
    }
    
    // Check CIDR range (e.g., 10.0.0.0/8)
    if (allowed.includes('/')) {
      if (isIPInCIDR(clientIP, allowed)) {
        return true;
      }
    }
  }
  
  return false;
}

function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    
    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);
    
    return (ipNum & mask) === (rangeNum & mask);
  } catch (error) {
    logger.error('Error checking CIDR range:', error);
    return false;
  }
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.');
  if (parts.length !== 4) return 0;
  
  return parts.reduce((acc, part) => {
    return (acc << 8) + parseInt(part);
  }, 0) >>> 0;
}

function checkBasicAuth(request: FastifyRequest, credentials: { username: string; password: string }): boolean {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }
  
  try {
    const base64Credentials = authHeader.substring(6);
    const decodedCredentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = decodedCredentials.split(':');
    
    return username === credentials.username && password === credentials.password;
  } catch (error) {
    logger.error('Error parsing Basic auth header:', error);
    return false;
  }
}

export async function metricsAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const clientIP = getClientIP(request);
  const allowedIPs = parseIPWhitelist();
  const basicAuthCreds = parseBasicAuth();
  
  // Check IP whitelist first
  if (isIPAllowed(clientIP, allowedIPs)) {
    logger.debug(`Metrics access granted for IP: ${clientIP}`);
    return;
  }
  
  // If IP not whitelisted, check Basic auth (if configured)
  if (basicAuthCreds) {
    if (checkBasicAuth(request, basicAuthCreds)) {
      logger.debug(`Metrics access granted via Basic auth from IP: ${clientIP}`);
      return;
    }
  }
  
  // Access denied
  logger.warn(`Metrics access denied for IP: ${clientIP}`);
  
  // Return 401 with WWW-Authenticate header if Basic auth is configured
  if (basicAuthCreds) {
    return reply.status(401)
      .header('WWW-Authenticate', 'Basic realm="Prometheus Metrics"')
      .send({ error: 'Authentication required' });
  }
  
  // Return 403 if only IP whitelist is used
  return reply.status(403).send({ 
    error: 'Access denied',
    message: 'Your IP address is not authorized to access metrics' 
  });
}
