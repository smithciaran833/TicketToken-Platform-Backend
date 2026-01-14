/**
 * Cryptographic Utilities
 * 
 * HIGH FIX: Implements timing-safe comparison and other crypto utilities
 * - Timing-safe string comparison (prevents timing attacks)
 * - Secure random token generation
 * - HMAC signature generation/verification
 */

import crypto from 'crypto';

// =============================================================================
// TIMING-SAFE COMPARISON
// =============================================================================

/**
 * Compare two strings in constant time to prevent timing attacks
 * Returns true if strings are equal, false otherwise
 */
export function secureCompare(a: string, b: string): boolean {
  // Convert to buffers
  const aBuffer = Buffer.from(a, 'utf8');
  const bBuffer = Buffer.from(b, 'utf8');

  // If lengths differ, we still need to do a comparison to maintain constant time
  if (aBuffer.length !== bBuffer.length) {
    // Compare against itself to maintain timing
    crypto.timingSafeEqual(aBuffer, aBuffer);
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Compare two buffers in constant time
 */
export function secureCompareBuffers(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// =============================================================================
// SECURE RANDOM GENERATION
// =============================================================================

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a cryptographically secure random UUID
 */
export function generateSecureUUID(): string {
  return crypto.randomUUID();
}

/**
 * Generate a random base64 string
 */
export function generateSecureBase64(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate a random alphanumeric string
 */
export function generateAlphanumeric(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  
  return result;
}

// =============================================================================
// HMAC OPERATIONS
// =============================================================================

/**
 * Generate an HMAC signature
 */
export function generateHmac(
  payload: string | Buffer,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): string {
  return crypto
    .createHmac(algorithm, secret)
    .update(payload)
    .digest('hex');
}

/**
 * Verify an HMAC signature
 */
export function verifyHmac(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): boolean {
  const expectedSignature = generateHmac(payload, secret, algorithm);
  return secureCompare(signature, expectedSignature);
}

/**
 * Generate an HMAC signature with timestamp
 */
export function generateTimestampedHmac(
  payload: string,
  secret: string
): { signature: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = generateHmac(signedPayload, secret);
  
  return { signature, timestamp };
}

/**
 * Verify a timestamped HMAC signature
 */
export function verifyTimestampedHmac(
  payload: string,
  signature: string,
  timestamp: number,
  secret: string,
  maxAgeSeconds: number = 300
): boolean {
  // Check timestamp age
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > maxAgeSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = generateHmac(signedPayload, secret);
  return secureCompare(signature, expectedSignature);
}

// =============================================================================
// HASHING
// =============================================================================

/**
 * Hash a value with SHA-256
 */
export function sha256(value: string | Buffer): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

/**
 * Hash a value with SHA-512
 */
export function sha512(value: string | Buffer): string {
  return crypto
    .createHash('sha512')
    .update(value)
    .digest('hex');
}

/**
 * Hash a value for safe logging (truncated)
 */
export function hashForLogging(value: string): string {
  const hash = sha256(value);
  return hash.substring(0, 16) + '...';
}

// =============================================================================
// ENCRYPTION/DECRYPTION
// =============================================================================

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Encrypt a value using AES-256-GCM
 */
export function encrypt(plaintext: string, key: string): string {
  // Derive a proper 32-byte key from the input
  const derivedKey = crypto.scryptSync(key, 'salt', 32);
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Return iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a value encrypted with AES-256-GCM
 */
export function decrypt(ciphertext: string, key: string): string {
  const derivedKey = crypto.scryptSync(key, 'salt', 32);
  
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format');
  }
  
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// =============================================================================
// KEY DERIVATION
// =============================================================================

/**
 * Derive a key using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: string,
  iterations: number = 100000,
  keyLength: number = 32
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keyLength, 'sha512', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/**
 * Derive a key using scrypt (recommended for passwords)
 */
export function deriveKeySync(
  password: string,
  salt: string,
  keyLength: number = 32
): Buffer {
  return crypto.scryptSync(password, salt, keyLength);
}

// =============================================================================
// ALIASES FOR COMPATIBILITY
// =============================================================================

// Aliases for http-client.util.ts compatibility
export const generateHmacSignature = generateTimestampedHmac;
export const verifyHmacSignature = verifyTimestampedHmac;

// =============================================================================
// IDEMPOTENCY KEY GENERATION
// =============================================================================

/**
 * Generate a unique idempotency key for payment requests
 * Uses UUID v4 for guaranteed uniqueness
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

// =============================================================================
// SERVICE-TO-SERVICE AUTHENTICATION
// =============================================================================

export interface ServiceRequestSignature {
  serviceName: string;
  signature: string;
  timestamp: string;
}

export interface VerifyServiceRequestResult {
  valid: boolean;
  error?: string;
}

/**
 * Sign a service-to-service request
 */
export function signServiceRequest(
  serviceName: string,
  body?: object | string
): ServiceRequestSignature {
  const secret = process.env.SERVICE_AUTH_SECRET || process.env.HMAC_SECRET;
  if (!secret) {
    throw new Error('SERVICE_AUTH_SECRET not configured');
  }

  const timestamp = Date.now().toString();
  const bodyString = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const payload = `${serviceName}:${timestamp}:${bodyString}`;
  const signature = generateHmac(payload, secret);

  return {
    serviceName,
    signature,
    timestamp,
  };
}

/**
 * Verify a service-to-service request signature
 */
export function verifyServiceRequest(
  signature: string,
  serviceName: string,
  timestamp: string,
  body?: object | string
): VerifyServiceRequestResult {
  const secret = process.env.SERVICE_AUTH_SECRET || process.env.HMAC_SECRET;
  if (!secret) {
    return { valid: false, error: 'SERVICE_AUTH_SECRET not configured' };
  }

  // Check timestamp freshness (5 minute window)
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  if (isNaN(requestTime) || Math.abs(now - requestTime) > maxAge) {
    return { valid: false, error: 'Request timestamp expired or invalid' };
  }

  const bodyString = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
  const payload = `${serviceName}:${timestamp}:${bodyString}`;
  const expectedSignature = generateHmac(payload, secret);

  if (!secureCompare(signature, expectedSignature)) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true };
}
