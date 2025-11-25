import * as crypto from 'crypto';
import { logger } from '../config/logger';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 64;

/**
 * PII Encryption Utility
 * 
 * Uses AES-256-GCM for encrypting PII fields
 * Key is derived from master key using PBKDF2
 */
export class EncryptionUtil {
  private masterKey: string;
  private keyCache: Map<string, Buffer> = new Map();

  constructor() {
    this.masterKey = process.env.ENCRYPTION_MASTER_KEY || '';
    
    if (!this.masterKey) {
      logger.warn('ENCRYPTION_MASTER_KEY not set. PII encryption disabled.');
    } else if (this.masterKey.length < 32) {
      throw new Error('ENCRYPTION_MASTER_KEY must be at least 32 characters');
    }
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled(): boolean {
    return !!this.masterKey && this.masterKey.length >= 32;
  }

  /**
   * Derive encryption key from master key and salt
   */
  private deriveKey(salt: Buffer): Buffer {
    const cacheKey = salt.toString('hex');
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    const key = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000, // iterations
      32, // key length
      'sha256'
    );

    this.keyCache.set(cacheKey, key);
    return key;
  }

  /**
   * Encrypt a string value
   * 
   * @param plaintext - The value to encrypt
   * @returns Encrypted string in format: salt.iv.authTag.ciphertext (all base64)
   */
  encrypt(plaintext: string): string {
    if (!this.isEnabled()) {
      logger.warn('Encryption not enabled, returning plaintext');
      return plaintext;
    }

    if (!plaintext) {
      return plaintext;
    }

    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);

      // Derive key from master key and salt
      const key = this.deriveKey(salt);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Get auth tag
      const authTag = cipher.getAuthTag();

      // Format: salt.iv.authTag.ciphertext
      return [
        salt.toString('base64'),
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted
      ].join('.');

    } catch (error) {
      logger.error('Encryption failed', { error });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt an encrypted string
   * 
   * @param encrypted - The encrypted value in format: salt.iv.authTag.ciphertext
   * @returns Decrypted plaintext
   */
  decrypt(encrypted: string): string {
    if (!this.isEnabled()) {
      return encrypted;
    }

    if (!encrypted || !encrypted.includes('.')) {
      return encrypted;
    }

    try {
      // Parse encrypted format
      const parts = encrypted.split('.');
      if (parts.length !== 4) {
        throw new Error('Invalid encrypted format');
      }

      const [saltB64, ivB64, authTagB64, ciphertext] = parts;

      // Decode components
      const salt = Buffer.from(saltB64, 'base64');
      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');

      // Derive key
      const key = this.deriveKey(salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      logger.error('Decryption failed', { error });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash a value for indexing/lookup
   * Uses SHA-256 for deterministic hashing
   * 
   * @param value - The value to hash
   * @returns Hex-encoded hash
   */
  hash(value: string): string {
    if (!value) {
      return value;
    }

    return crypto
      .createHash('sha256')
      .update(value)
      .digest('hex');
  }

  /**
   * Encrypt email address
   */
  encryptEmail(email: string): string {
    return this.encrypt(email.toLowerCase().trim());
  }

  /**
   * Decrypt email address
   */
  decryptEmail(encrypted: string): string {
    return this.decrypt(encrypted);
  }

  /**
   * Hash email for lookup
   */
  hashEmail(email: string): string {
    return this.hash(email.toLowerCase().trim());
  }

  /**
   * Encrypt phone number
   */
  encryptPhone(phone: string): string {
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalized = phone.replace(/[^\d+]/g, '');
    return this.encrypt(normalized);
  }

  /**
   * Decrypt phone number
   */
  decryptPhone(encrypted: string): string {
    return this.decrypt(encrypted);
  }

  /**
   * Hash phone for lookup
   */
  hashPhone(phone: string): string {
    const normalized = phone.replace(/[^\d+]/g, '');
    return this.hash(normalized);
  }

  /**
   * Encrypt generic PII field
   */
  encryptPII(value: string): string {
    return this.encrypt(value);
  }

  /**
   * Decrypt generic PII field
   */
  decryptPII(encrypted: string): string {
    return this.decrypt(encrypted);
  }

  /**
   * Batch encrypt multiple values
   */
  encryptBatch(values: string[]): string[] {
    return values.map(v => this.encrypt(v));
  }

  /**
   * Batch decrypt multiple values
   */
  decryptBatch(encrypted: string[]): string[] {
    return encrypted.map(e => this.decrypt(e));
  }

  /**
   * Rotate encryption key
   * Re-encrypts data with new key
   * 
   * @param encrypted - Old encrypted value
   * @param oldMasterKey - Previous master key
   * @returns Newly encrypted value
   */
  rotateKey(encrypted: string, oldMasterKey: string): string {
    // Temporarily switch to old key
    const currentKey = this.masterKey;
    this.masterKey = oldMasterKey;
    this.keyCache.clear();

    try {
      // Decrypt with old key
      const plaintext = this.decrypt(encrypted);

      // Switch back to new key
      this.masterKey = currentKey;
      this.keyCache.clear();

      // Re-encrypt with new key
      return this.encrypt(plaintext);

    } catch (error) {
      // Restore current key on error
      this.masterKey = currentKey;
      this.keyCache.clear();
      throw error;
    }
  }
}

// Singleton instance
export const encryptionUtil = new EncryptionUtil();
