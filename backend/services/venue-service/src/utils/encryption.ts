import crypto from 'crypto';
import { logger } from './logger';

/**
 * SECURITY FIX (CREDS1): Real encryption for sensitive credentials
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Get encryption key from environment
 * Key must be 64 hex characters (32 bytes for AES-256)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY;
  
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY environment variable not set');
  }
  
  if (key.length !== 64) {
    throw new Error(`CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters (32 bytes), got ${key.length}`);
  }
  
  try {
    return Buffer.from(key, 'hex');
  } catch (error) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY must be valid hexadecimal string');
  }
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * Returns base64-encoded string containing: IV + AuthTag + EncryptedData
 */
export function encryptCredentials(data: any): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const plaintext = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine: IV + AuthTag + EncryptedData
    const combined = Buffer.concat([iv, authTag, encrypted]);
    
    return combined.toString('base64');
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to encrypt credentials');
    throw new Error(`Encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt credentials encrypted with encryptCredentials()
 * Expects base64-encoded string containing: IV + AuthTag + EncryptedData
 */
export function decryptCredentials(encryptedData: string): any {
  try {
    const key = getEncryptionKey();
    const buffer = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const iv = buffer.subarray(0, IV_LENGTH);
    const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return JSON.parse(decrypted.toString('utf8'));
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to decrypt credentials');
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * Generate a new random encryption key (for setup/rotation)
 * Returns 64-character hex string suitable for CREDENTIALS_ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Validate that encryption is properly configured
 */
export function validateEncryptionConfig(): { valid: boolean; error?: string } {
  try {
    getEncryptionKey();
    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}
