/**
 * Security Headers Middleware
 * 
 * Implements PCI-DSS compliant security headers:
 * - HSTS (HTTP Strict Transport Security)
 * - X-Content-Type-Options
 * - X-Frame-Options
 * - X-XSS-Protection
 * - Content-Security-Policy
 */

import { FastifyRequest, FastifyReply } from 'fastify';

export async function securityHeadersMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // HSTS - Force HTTPS for 1 year, include subdomains, allow preload
  reply.header(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // Prevent MIME sniffing
  reply.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  reply.header('X-Frame-Options', 'DENY');

  // XSS Protection
  reply.header('X-XSS-Protection', '1; mode=block');

  // Content Security Policy - strict policy for API
  reply.header(
    'Content-Security-Policy',
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  );

  // Remove powered-by header
  reply.removeHeader('X-Powered-By');

  // Referrer Policy - don't leak referrer information
  reply.header('Referrer-Policy', 'no-referrer');

  // Permissions Policy - disable unnecessary browser features
  reply.header(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=()'
  );
}
