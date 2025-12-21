import crypto from 'crypto';
import { logger } from './logger';

/**
 * Encryption utility for PII (Personally Identifiable Information)
 * Uses AES-256-GCM for secure encryption with authentication
 * 
 * GDPR Article 32 Compliance: Encryption of personal data at rest
 */

// Ensure encryption key is provided
if (!process.env.ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required for PII encryption');
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

// Derive a 32-byte key from the environment variable
function deriveKey(salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(
    ENCRYPTION_KEY,
    salt,
    100000, // iterations
    32, // key length
    'sha256'
  );
}

/**
 * Encrypt sensitive data
 * Returns: base64-encoded string in format: salt:iv:authTag:encryptedData
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return plaintext;
  }

  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from salt
    const key = deriveKey(salt);
    
    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get auth tag
    const authTag = cipher.getAuthTag();
    
    // Combine salt:iv:authTag:encrypted
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'base64')
    ]);
    
    return combined.toString('base64');
  } catch (error: any) {
    logger.error({ error }, 'Encryption failed:');
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 * Input: base64-encoded string in format: salt:iv:authTag:encryptedData
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) {
    return ciphertext;
  }

  try {
    // Decode base64
    const combined = Buffer.from(ciphertext, 'base64');
    
    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.slice(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
    
    // Derive key from salt
    const key = deriveKey(salt);
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    // Decrypt
    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error: any) {
    logger.error({ error }, 'Decryption failed:');
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash sensitive data (one-way, for comparison only)
 * Useful for searchable fields that need to remain private
 */
export function hash(data: string): string {
  if (!data) {
    return data;
  }

  return crypto
    .createHash('sha256')
    .update(data + ENCRYPTION_KEY)
    .digest('hex');
}

/**
 * Encrypt multiple fields in an object
 */
export function encryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const encrypted = { ...obj };
  
  for (const field of fields) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encrypt(encrypted[field] as string) as any;
    }
  }
  
  return encrypted;
}

/**
 * Decrypt multiple fields in an object
 */
export function decryptFields<T extends Record<string, any>>(
  obj: T,
  fields: (keyof T)[]
): T {
  const decrypted = { ...obj };
  
  for (const field of fields) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = decrypt(decrypted[field] as string) as any;
      } catch (error: any) {
        // If decryption fails, field might not be encrypted
        logger.warn(`Failed to decrypt field ${String(field)}, keeping original value`);
      }
    }
  }
  
  return decrypted;
}

/**
 * Redact sensitive data for logging
 * Shows only first and last 2 characters
 */
export function redact(data: string): string {
  if (!data || data.length <= 4) {
    return '****';
  }
  
  return `${data.slice(0, 2)}****${data.slice(-2)}`;
}

/**
 * Validate encryption key strength
 */
export function validateEncryptionKey(key: string): boolean {
  // Key should be at least 32 characters (256 bits)
  if (key.length < 32) {
    return false;
  }
  
  // Check for entropy (not all same character)
  const uniqueChars = new Set(key.split('')).size;
  if (uniqueChars < 10) {
    return false;
  }
  
  return true;
}

// Validate encryption key on module load
if (!validateEncryptionKey(ENCRYPTION_KEY)) {
  throw new Error(
    'ENCRYPTION_KEY must be at least 32 characters long with sufficient entropy'
  );
}

logger.info('Encryption utility initialized successfully');
