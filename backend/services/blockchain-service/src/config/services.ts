/**
 * Internal Service URLs Configuration
 * 
 * AUDIT FIX #27: Use HTTPS for internal service URLs
 * 
 * All internal service-to-service communication uses HTTPS in production.
 * HTTP is only allowed for localhost in development mode.
 */

import { logger } from '../utils/logger';

// Determine the protocol based on environment
const isDevelopment = process.env.NODE_ENV === 'development';
const defaultProtocol = isDevelopment ? 'http' : 'https';

/**
 * Check if a URL is localhost (allows HTTP in development)
 */
function isLocalhost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

/**
 * Build service URL with proper protocol
 * AUDIT FIX #27: Defaults to HTTPS in production
 */
function buildServiceUrl(
  envVar: string,
  serviceName: string,
  defaultPort: number
): string {
  const envValue = process.env[envVar];
  
  if (envValue) {
    return envValue;
  }
  
  // Build default URL
  const host = process.env[`${serviceName.toUpperCase()}_HOST`] || serviceName;
  const port = parseInt(process.env[`${serviceName.toUpperCase()}_PORT`] || String(defaultPort), 10);
  
  // In development, use HTTP for local services
  // In production, always use HTTPS
  const protocol = isDevelopment ? 'http' : 'https';
  
  return `${protocol}://${host}:${port}`;
}

/**
 * Internal Service URLs
 * All default to HTTPS in production
 */
export const internalServices = {
  // Minting service
  mintingService: buildServiceUrl('MINTING_SERVICE_URL', 'minting-service', 3010),
  
  // Order service
  orderService: buildServiceUrl('ORDER_SERVICE_URL', 'order-service', 3003),
  
  // Event service
  eventService: buildServiceUrl('EVENT_SERVICE_URL', 'event-service', 3004),
  
  // Ticket service
  ticketService: buildServiceUrl('TICKET_SERVICE_URL', 'ticket-service', 3002),
  
  // Auth service
  authService: buildServiceUrl('AUTH_SERVICE_URL', 'auth-service', 3001),
  
  // Payment service
  paymentService: buildServiceUrl('PAYMENT_SERVICE_URL', 'payment-service', 3005),
  
  // Notification service
  notificationService: buildServiceUrl('NOTIFICATION_SERVICE_URL', 'notification-service', 3006),
  
  // File/Storage service
  fileService: buildServiceUrl('FILE_SERVICE_URL', 'file-service', 3008),
  
  // Marketplace service
  marketplaceService: buildServiceUrl('MARKETPLACE_SERVICE_URL', 'marketplace-service', 3009),
  
  // Transfer service
  transferService: buildServiceUrl('TRANSFER_SERVICE_URL', 'transfer-service', 3012),
  
  // Compliance service
  complianceService: buildServiceUrl('COMPLIANCE_SERVICE_URL', 'compliance-service', 3013),
  
  // Analytics service
  analyticsService: buildServiceUrl('ANALYTICS_SERVICE_URL', 'analytics-service', 3014),
};

/**
 * Validate all service URLs
 * AUDIT FIX #27: Fail fast if HTTP URLs in production
 */
export function validateServiceUrls(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';
  
  for (const [name, url] of Object.entries(internalServices)) {
    if (!url) {
      errors.push(`${name}: URL is not configured`);
      continue;
    }
    
    try {
      const parsed = new URL(url);
      
      // In production, enforce HTTPS (except for localhost)
      if (isProduction && parsed.protocol === 'http:' && !isLocalhost(url)) {
        errors.push(
          `${name}: HTTP is not allowed in production. ` +
          `Change ${url} to use HTTPS or set environment variable to override.`
        );
      }
      
      // Warn about localhost in production
      if (isProduction && isLocalhost(url)) {
        logger.warn(`${name} is configured with localhost in production`, {
          url,
          hint: 'This may be intentional for sidecar pattern, but verify'
        });
      }
      
    } catch (error) {
      errors.push(`${name}: Invalid URL format: ${url}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Log service configuration (without sensitive data)
 */
export function logServiceConfiguration(): void {
  const config: Record<string, { url: string; protocol: string; isHttps: boolean }> = {};
  
  for (const [name, url] of Object.entries(internalServices)) {
    try {
      const parsed = new URL(url);
      config[name] = {
        url: `${parsed.protocol}//${parsed.host}`,
        protocol: parsed.protocol.replace(':', ''),
        isHttps: parsed.protocol === 'https:'
      };
    } catch {
      config[name] = { url: 'INVALID', protocol: 'unknown', isHttps: false };
    }
  }
  
  logger.info('Internal service configuration', {
    environment: process.env.NODE_ENV,
    services: config,
    totalServices: Object.keys(config).length,
    httpsCount: Object.values(config).filter(c => c.isHttps).length
  });
}

export default {
  internalServices,
  validateServiceUrls,
  logServiceConfiguration,
  isLocalhost,
  isDevelopment,
  defaultProtocol
};
