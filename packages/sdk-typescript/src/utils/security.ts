import crypto from 'crypto';

/**
 * Security utility functions for the SDK
 */

export interface EncryptionOptions {
  algorithm?: string;
  key: string | Buffer;
  iv?: Buffer;
}

export interface TokenEncryptionResult {
  encrypted: string;
  iv: string;
}

/**
 * Encrypt sensitive data (e.g., tokens)
 */
export function encrypt(data: string, options: EncryptionOptions): TokenEncryptionResult {
  const algorithm = options.algorithm || 'aes-256-gcm';
  const key = typeof options.key === 'string' 
    ? Buffer.from(options.key, 'hex')
    : options.key;
  
  const iv = options.iv || crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // For GCM mode, append auth tag
  if (algorithm.includes('gcm')) {
    const authTag = (cipher as any).getAuthTag();
    encrypted += authTag.toString('hex');
  }
  
  return {
    encrypted,
    iv: iv.toString('hex')
  };
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encrypted: string, iv: string, options: EncryptionOptions): string {
  const algorithm = options.algorithm || 'aes-256-gcm';
  const key = typeof options.key === 'string'
    ? Buffer.from(options.key, 'hex')
    : options.key;
  
  const ivBuffer = Buffer.from(iv, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);
  
  // For GCM mode, set auth tag
  if (algorithm.includes('gcm')) {
    const authTagLength = 32; // 16 bytes in hex
    const authTag = Buffer.from(encrypted.slice(-authTagLength), 'hex');
    encrypted = encrypted.slice(0, -authTagLength);
    (decipher as any).setAuthTag(authTag);
  }
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Generate a cryptographically secure random key
 */
export function generateKey(length: number = 32): Buffer {
  return crypto.randomBytes(length);
}

/**
 * Hash sensitive data (one-way)
 */
export function hash(data: string, algorithm: string = 'sha256'): string {
  return crypto.createHash(algorithm).update(data).digest('hex');
}

/**
 * Generate HMAC signature
 */
export function sign(data: string, secret: string, algorithm: string = 'sha256'): string {
  return crypto.createHmac(algorithm, secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature
 */
export function verify(data: string, signature: string, secret: string, algorithm: string = 'sha256'): boolean {
  const expectedSignature = sign(data, secret, algorithm);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Generate a cryptographically secure nonce
 */
export function generateNonce(length: number = 16): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '***';
  }
  
  const start = data.slice(0, visibleChars);
  const end = data.slice(-visibleChars);
  const masked = '*'.repeat(Math.min(data.length - visibleChars * 2, 10));
  
  return `${start}${masked}${end}`;
}

/**
 * Sanitize object for logging (remove sensitive fields)
 */
export function sanitizeForLogging(obj: any, sensitiveFields: string[] = ['password', 'token', 'secret', 'apiKey']): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item, sensitiveFields));
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveFields.some(field => keyLower.includes(field.toLowerCase()));
    
    if (isSensitive && typeof value === 'string') {
      sanitized[key] = maskSensitiveData(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value, sensitiveFields);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Check if running in secure context (HTTPS)
 */
export function isSecureContext(): boolean {
  // Browser environment
  if (typeof window !== 'undefined') {
    return window.isSecureContext;
  }
  
  // Node.js - always considered secure
  return true;
}

/**
 * Validate token format (JWT-like)
 */
export function validateTokenFormat(token: string): boolean {
  // Basic JWT format validation: three parts separated by dots
  const parts = token.split('.');
  if (parts.length !== 3) {
    return false;
  }
  
  // Check if parts are base64url encoded
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  return parts.every(part => base64urlRegex.test(part));
}

/**
 * Parse JWT token (without verification)
 */
export function parseJWT(token: string): { header: any; payload: any } | null {
  try {
    if (!validateTokenFormat(token)) {
      return null;
    }
    
    const [headerB64, payloadB64] = token.split('.');
    
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    
    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string, bufferSeconds: number = 60): boolean {
  const parsed = parseJWT(token);
  if (!parsed || !parsed.payload.exp) {
    return true;
  }
  
  const expirationTime = parsed.payload.exp * 1000; // Convert to milliseconds
  const now = Date.now();
  const buffer = bufferSeconds * 1000;
  
  return now >= (expirationTime - buffer);
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  const parsed = parseJWT(token);
  if (!parsed || !parsed.payload.exp) {
    return null;
  }
  
  return new Date(parsed.payload.exp * 1000);
}

/**
 * Constant-time string comparison (timing attack prevention)
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(
    Buffer.from(a),
    Buffer.from(b)
  );
}
