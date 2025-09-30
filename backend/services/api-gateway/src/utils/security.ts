import crypto from 'crypto';
import { FastifyRequest } from 'fastify';

// Input sanitization
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove null bytes
    input = input.replace(/\0/g, '');
    
    // Trim whitespace
    input = input.trim();
    
    // Prevent script injection
    input = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Escape HTML entities
    const htmlEntities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    };
    
    input = input.replace(/[&<>"'/]/g, (match: string) => htmlEntities[match]);
  } else if (typeof input === 'object' && input !== null) {
    // Recursively sanitize objects
    for (const key in input) {
      if (input.hasOwnProperty(key)) {
        input[key] = sanitizeInput(input[key]);
      }
    }
  }
  
  return input;
}

// SQL injection prevention
export function escapeSqlIdentifier(identifier: string): string {
  return identifier.replace(/[^a-zA-Z0-9_]/g, '');
}

// API key generation
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('base64url');
}

// Request signature validation
export function validateRequestSignature(
  request: FastifyRequest,
  secret: string
): boolean {
  const signature = request.headers['x-signature'] as string;
  if (!signature) return false;

  const timestamp = request.headers['x-timestamp'] as string;
  if (!timestamp) return false;

  // Check timestamp is within 5 minutes
  const now = Date.now();
  const requestTime = parseInt(timestamp, 10);
  if (Math.abs(now - requestTime) > 300000) {
    return false;
  }

  // Recreate signature
  const payload = `${timestamp}.${JSON.stringify(request.body)}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// Rate limit key generation with IP anonymization
export function generateRateLimitKey(request: FastifyRequest): string {
  const ip = request.ip;
  const userId = request.user?.id;
  
  if (userId) {
    return `user:${userId}`;
  }
  
  // Anonymize IP for privacy
  const hashedIp = crypto
    .createHash('sha256')
    .update(ip + process.env.IP_SALT || 'default-salt')
    .digest('hex')
    .substring(0, 16);
  
  return `ip:${hashedIp}`;
}

// CSRF token generation
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateCsrfToken(token: string, sessionToken: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(sessionToken)
  );
}
