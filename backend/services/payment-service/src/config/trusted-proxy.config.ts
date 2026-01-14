/**
 * Trusted Proxy Configuration
 * 
 * HIGH FIX: Properly configure trusted proxies instead of `trustProxy: true`
 * which trusts ALL proxies and allows X-Forwarded-For spoofing.
 */

import { FastifyServerOptions } from 'fastify';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'TrustedProxyConfig' });

// =============================================================================
// CONSTANTS
// =============================================================================

// Default trusted proxy ranges for common cloud providers
const DEFAULT_TRUSTED_RANGES = {
  // AWS internal ranges
  aws: [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
  ],
  // GCP internal ranges
  gcp: [
    '10.128.0.0/9',
    '10.0.0.0/8',
  ],
  // Azure internal ranges
  azure: [
    '10.0.0.0/8',
    '172.16.0.0/12',
  ],
  // Kubernetes pod networks (typical)
  kubernetes: [
    '10.244.0.0/16', // Flannel default
    '10.0.0.0/16',   // Custom
    '192.168.0.0/16',
  ],
  // Cloudflare IPs (for edge protection)
  cloudflare: [
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
  ],
  // Local development
  local: [
    '127.0.0.1',
    '::1',
  ],
};

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface ProxyConfig {
  enabled: boolean;
  trustedIps: string[];
  maxHops: number;
}

/**
 * Get trusted proxy configuration from environment
 */
export function getTrustedProxyConfig(): ProxyConfig {
  const env = process.env.NODE_ENV || 'development';
  
  // Parse from environment variable
  const trustedProxyEnv = process.env.TRUSTED_PROXY_IPS;
  
  if (trustedProxyEnv) {
    const ips = trustedProxyEnv
      .split(',')
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0);
    
    log.info({ count: ips.length }, 'Using custom trusted proxy IPs');
    
    return {
      enabled: true,
      trustedIps: ips,
      maxHops: parseInt(process.env.PROXY_MAX_HOPS || '3', 10),
    };
  }
  
  // Default based on environment
  if (env === 'production') {
    // In production, require explicit configuration
    log.warn('TRUSTED_PROXY_IPS not set in production - using restrictive defaults');
    return {
      enabled: true,
      trustedIps: [
        ...DEFAULT_TRUSTED_RANGES.kubernetes,
        ...DEFAULT_TRUSTED_RANGES.aws, // Assume AWS by default
      ],
      maxHops: 2,
    };
  }
  
  // Development: trust local + common internal ranges
  return {
    enabled: true,
    trustedIps: [
      ...DEFAULT_TRUSTED_RANGES.local,
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
    ],
    maxHops: 5,
  };
}

/**
 * Get Fastify trustProxy option
 * 
 * Returns either a list of IPs or a function for more complex validation
 */
export function getFastifyTrustProxyOption(): FastifyServerOptions['trustProxy'] {
  const config = getTrustedProxyConfig();
  
  if (!config.enabled) {
    return false;
  }
  
  // Return the list of trusted IPs
  // Fastify will only trust X-Forwarded-* headers from these IPs
  return config.trustedIps;
}

// =============================================================================
// IP EXTRACTION
// =============================================================================

/**
 * Extract the real client IP from X-Forwarded-For header
 * 
 * IMPORTANT: Always use the RIGHTMOST untrusted IP, not the leftmost.
 * The leftmost IP can be spoofed by the client.
 * The rightmost IP is the one added by your trusted infrastructure.
 */
export function extractClientIp(
  xForwardedFor: string | undefined,
  socketRemoteAddress: string,
  trustedIps: string[] = []
): string {
  // If no X-Forwarded-For, use socket address
  if (!xForwardedFor) {
    return socketRemoteAddress;
  }
  
  // Parse the X-Forwarded-For chain
  const ips = xForwardedFor
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
  
  if (ips.length === 0) {
    return socketRemoteAddress;
  }
  
  // If no trusted IPs configured, use the rightmost (safest default)
  if (trustedIps.length === 0) {
    return ips[ips.length - 1];
  }
  
  // Walk from right to left, finding the first untrusted IP
  // This is the real client IP (added by your infrastructure before any trusted proxies)
  for (let i = ips.length - 1; i >= 0; i--) {
    const ip = ips[i];
    if (!isIpTrusted(ip, trustedIps)) {
      return ip;
    }
  }
  
  // All IPs are trusted, use the leftmost (shouldn't happen in normal operation)
  return ips[0];
}

/**
 * Check if an IP is in the trusted list
 */
export function isIpTrusted(ip: string, trustedIps: string[]): boolean {
  for (const trusted of trustedIps) {
    if (trusted.includes('/')) {
      // CIDR notation
      if (isIpInCidr(ip, trusted)) {
        return true;
      }
    } else {
      // Exact match
      if (ip === trusted) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if an IP is in a CIDR range
 * Simplified implementation - for production, consider using a library like 'ip-range-check'
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  // Handle IPv4
  if (!ip.includes(':') && !cidr.includes(':')) {
    const [range, bits] = cidr.split('/');
    const mask = parseInt(bits, 10);
    
    const ipNum = ipv4ToNumber(ip);
    const rangeNum = ipv4ToNumber(range);
    
    if (ipNum === null || rangeNum === null) {
      return false;
    }
    
    const maskNum = ~((1 << (32 - mask)) - 1);
    return (ipNum & maskNum) === (rangeNum & maskNum);
  }
  
  // For IPv6 or mixed, do simple prefix comparison (basic implementation)
  const [prefix] = cidr.split('/');
  return ip.startsWith(prefix.replace(/0+$/, ''));
}

/**
 * Convert IPv4 address to number
 */
function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return null;
  }
  
  let num = 0;
  for (const part of parts) {
    const octet = parseInt(part, 10);
    if (isNaN(octet) || octet < 0 || octet > 255) {
      return null;
    }
    num = (num << 8) | octet;
  }
  
  return num >>> 0; // Convert to unsigned
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate IP address format
 */
export function isValidIpAddress(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
  
  // IPv6 (simplified check)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Regex.test(ip);
}

/**
 * Validate CIDR notation
 */
export function isValidCidr(cidr: string): boolean {
  if (!cidr.includes('/')) {
    return false;
  }
  
  const [ip, bits] = cidr.split('/');
  const bitsNum = parseInt(bits, 10);
  
  // Check IP part
  if (!isValidIpAddress(ip)) {
    return false;
  }
  
  // Check bits
  if (isNaN(bitsNum) || bitsNum < 0) {
    return false;
  }
  
  // IPv4 max is /32, IPv6 max is /128
  const maxBits = ip.includes(':') ? 128 : 32;
  return bitsNum <= maxBits;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  DEFAULT_TRUSTED_RANGES,
};
