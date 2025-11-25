/**
 * IP Whitelist Middleware
 * 
 * PCI-DSS Requirement: Restrict access to payment operations from known IPs
 * Enforces IP whitelisting for sensitive payment-related operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

/**
 * Check if request path requires IP whitelisting
 */
function requiresIPWhitelist(path: string): boolean {
  // Whitelist required for refund operations
  if (path.includes('/refund')) {
    return true;
  }
  
  // Whitelist required for manual discount operations
  if (path.includes('/admin') && path.includes('/discount')) {
    return true;
  }
  
  // Whitelist required for admin override operations
  if (path.includes('/admin/overrides')) {
    return true;
  }
  
  // Whitelist required for payment method management
  if (path.includes('/payment-method') && (path.includes('/delete') || path.includes('/update'))) {
    return true;
  }
  
  return false;
}

/**
 * Get client IP address from request
 */
function getClientIP(request: FastifyRequest): string {
  // Check X-Forwarded-For header first (for requests behind proxy)
  const forwardedFor = request.headers['x-forwarded-for'] as string;
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim();
  }
  
  // Check X-Real-IP header
  const realIP = request.headers['x-real-ip'] as string;
  if (realIP) {
    return realIP.trim();
  }
  
  // Fall back to request.ip
  return request.ip;
}

/**
 * Check if IP is in CIDR range
 */
function isIPInCIDR(ip: string, cidr: string): boolean {
  // Simple CIDR check - in production, use a library like 'ip-range-check'
  if (!cidr.includes('/')) {
    // Exact IP match
    return ip === cidr;
  }
  
  // For now, just do exact match - implement proper CIDR checking with a library
  return ip === cidr.split('/')[0];
}

/**
 * Check if IP is whitelisted
 */
function isIPWhitelisted(ip: string): boolean {
  // Get whitelisted IPs from environment variable
  const whitelist = process.env.PAYMENT_IP_WHITELIST || '';
  
  if (!whitelist) {
    // If no whitelist configured, log warning and allow (for development)
    if (process.env.NODE_ENV === 'production') {
      logger.warn('No IP whitelist configured in production!');
      return false;
    }
    return true; // Allow in development
  }
  
  // Split by comma and check each IP/CIDR
  const allowedIPs = whitelist.split(',').map(s => s.trim());
  
  return allowedIPs.some(allowedIP => {
    if (allowedIP === '*') {
      // Wildcard allows all (not recommended for production)
      return true;
    }
    return isIPInCIDR(ip, allowedIP);
  });
}

/**
 * Middleware to enforce IP whitelisting for sensitive operations
 */
export async function ipWhitelistMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check if this endpoint requires IP whitelisting
    if (!requiresIPWhitelist(request.url)) {
      return; // Not a sensitive operation
    }
    
    // Skip check if user is not authenticated
    if (!request.user) {
      return; // Auth middleware will handle this
    }
    
    // Get client IP
    const clientIP = getClientIP(request);
    
    // Check if IP is whitelisted
    if (!isIPWhitelisted(clientIP)) {
      logger.warn('IP whitelist violation', {
        userId: request.user.id,
        tenantId: request.user.tenantId,
        clientIP,
        path: request.url,
        method: request.method,
      });
      
      reply.code(403).send({
        error: 'IP_NOT_WHITELISTED',
        message: 'Access denied: Your IP address is not authorized for this operation',
      });
      return;
    }
    
    // IP is whitelisted, allow request to proceed
    logger.info('IP whitelist check passed', {
      userId: request.user.id,
      clientIP,
      path: request.url,
    });
  } catch (error) {
    logger.error('IP whitelist middleware error', { error });
    reply.code(500).send({
      error: 'IP_WHITELIST_ERROR',
      message: 'Failed to verify IP whitelist',
    });
  }
}
