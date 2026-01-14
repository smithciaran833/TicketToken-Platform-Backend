/**
 * KMS (Key Management Service) Configuration
 * 
 * Provides encryption/decryption services for sensitive credentials.
 * Supports both AWS KMS (production) and mock implementation (development).
 */

import crypto, { CipherGCM, DecipherGCM } from 'crypto';
import { config } from './index';
import { logger } from '../utils/logger';

// =============================================================================
// TYPES
// =============================================================================

interface EncryptionContext {
  venueId?: string;
  integrationType?: string;
  keyName?: string;
  purpose?: string;
}

export interface EncryptResult {
  ciphertext: string;
  keyId: string;
  encryptionContext?: Record<string, string>;
}

export interface DecryptResult {
  plaintext: string;
  keyId: string;
}

// =============================================================================
// KMS SERVICE
// =============================================================================

class KMSService {
  private encryptionKey: Buffer | null = null;
  private algorithm = 'aes-256-gcm';
  private ivLength = 16;
  private tagLength = 16;

  constructor() {
    this.initializeKey();
  }

  /**
   * Initialize encryption key from config
   */
  private initializeKey(): void {
    const key = config.security?.encryptionKey;
    if (key) {
      // Use SHA-256 to ensure consistent key length
      this.encryptionKey = crypto.createHash('sha256').update(key).digest();
      logger.info('KMS encryption key initialized');
    } else if (config.security?.mockKms || config.server?.nodeEnv !== 'production') {
      // Use a mock key for development
      this.encryptionKey = crypto.createHash('sha256').update('development-key-not-for-production').digest();
      logger.warn('KMS using development mock key - not for production use');
    } else {
      logger.error('No encryption key configured for KMS');
    }
  }

  /**
   * Encrypt data
   */
  async encrypt(data: string, context?: EncryptionContext): Promise<EncryptResult> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv) as CipherGCM;
      
      // Add context as AAD for additional security
      if (context) {
        cipher.setAAD(Buffer.from(JSON.stringify(context)));
      }

      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine iv + tag + encrypted data
      const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);
      
      const keyId = config.security?.kmsKeyId || 'local-key';
      return {
        ciphertext: combined.toString('base64'),
        keyId,
        encryptionContext: context as Record<string, string> | undefined
      };
    } catch (error) {
      logger.error('Encryption failed', { error: (error as Error).message });
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(ciphertext: string, context?: EncryptionContext): Promise<DecryptResult> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not initialized');
    }

    try {
      const combined = Buffer.from(ciphertext, 'base64');
      
      // Extract iv, tag, and encrypted data
      const iv = combined.subarray(0, this.ivLength);
      const tag = combined.subarray(this.ivLength, this.ivLength + this.tagLength);
      const encrypted = combined.subarray(this.ivLength + this.tagLength);
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv) as DecipherGCM;
      decipher.setAuthTag(tag);
      
      // Add context as AAD for additional security
      if (context) {
        decipher.setAAD(Buffer.from(JSON.stringify(context)));
      }

      let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      const keyId = config.security?.kmsKeyId || 'local-key';
      return {
        plaintext: decrypted,
        keyId
      };
    } catch (error) {
      logger.error('Decryption failed', { error: (error as Error).message });
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypt access token with context
   */
  async encryptAccessToken(token: string, venueId: string, integrationType: string): Promise<EncryptResult> {
    return this.encrypt(token, {
      venueId,
      integrationType,
      purpose: 'access_token'
    });
  }

  /**
   * Decrypt access token with context
   */
  async decryptAccessToken(ciphertext: string, venueId: string, integrationType: string): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      purpose: 'access_token'
    });
    return result.plaintext;
  }

  /**
   * Encrypt refresh token with context
   */
  async encryptRefreshToken(token: string, venueId: string, integrationType: string): Promise<EncryptResult> {
    return this.encrypt(token, {
      venueId,
      integrationType,
      purpose: 'refresh_token'
    });
  }

  /**
   * Decrypt refresh token with context
   */
  async decryptRefreshToken(ciphertext: string, venueId: string, integrationType: string): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      purpose: 'refresh_token'
    });
    return result.plaintext;
  }

  /**
   * Encrypt API key with context
   */
  async encryptApiKey(key: string, venueId: string, integrationType: string, keyName: string): Promise<EncryptResult> {
    return this.encrypt(key, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_key'
    });
  }

  /**
   * Decrypt API key with context
   */
  async decryptApiKey(ciphertext: string, venueId: string, integrationType: string, keyName: string): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_key'
    });
    return result.plaintext;
  }

  /**
   * Encrypt API secret with context
   */
  async encryptApiSecret(secret: string, venueId: string, integrationType: string, keyName: string): Promise<EncryptResult> {
    return this.encrypt(secret, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_secret'
    });
  }

  /**
   * Decrypt API secret with context
   */
  async decryptApiSecret(ciphertext: string, venueId: string, integrationType: string, keyName: string): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_secret'
    });
    return result.plaintext;
  }

  /**
   * Encrypt webhook secret with context
   */
  async encryptWebhookSecret(secret: string, venueId: string, integrationType: string): Promise<EncryptResult> {
    return this.encrypt(secret, {
      venueId,
      integrationType,
      purpose: 'webhook_secret'
    });
  }

  /**
   * Decrypt webhook secret with context
   */
  async decryptWebhookSecret(ciphertext: string, venueId: string, integrationType: string): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      purpose: 'webhook_secret'
    });
    return result.plaintext;
  }

  /**
   * Generate a random encryption key (for key rotation)
   */
  generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash sensitive data (one-way)
   */
  hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// Create singleton instance
export const kmsService = new KMSService();

export default kmsService;
