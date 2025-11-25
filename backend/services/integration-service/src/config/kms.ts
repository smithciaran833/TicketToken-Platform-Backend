import { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';
import { fromEnv } from '@aws-sdk/credential-providers';

export interface KMSConfig {
  region: string;
  keyId: string;
  endpoint?: string;
}

export interface EncryptionContext {
  venueId?: string;
  integrationType?: string;
  purpose?: string;
  [key: string]: string | undefined;
}

export interface EncryptionResult {
  ciphertext: string;
  keyId: string;
  encryptionContext: string;
}

export interface DecryptionResult {
  plaintext: string;
  keyId: string;
}

class KMSService {
  private client: KMSClient;
  private defaultKeyId: string;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.KMS_ENABLED === 'true';
    
    if (!this.enabled) {
      console.warn('⚠️ KMS encryption is DISABLED - credentials will be stored in plaintext');
      // Create a noop client for development
      this.client = null as any;
      this.defaultKeyId = 'disabled';
      return;
    }

    const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    const keyId = process.env.KMS_KEY_ID;

    if (!keyId) {
      throw new Error('KMS_KEY_ID environment variable is required when KMS is enabled');
    }

    this.defaultKeyId = keyId;

    // Initialize KMS client
    const clientConfig: any = {
      region,
      credentials: fromEnv(),
    };

    // Support LocalStack or custom endpoint for testing
    if (process.env.KMS_ENDPOINT) {
      clientConfig.endpoint = process.env.KMS_ENDPOINT;
    }

    this.client = new KMSClient(clientConfig);

    console.log(`✅ KMS Service initialized - Region: ${region}, Key: ${keyId.substring(0, 20)}...`);
  }

  /**
   * Encrypt plaintext data using AWS KMS
   */
  async encrypt(
    plaintext: string,
    encryptionContext?: EncryptionContext,
    keyId?: string
  ): Promise<EncryptionResult> {
    if (!this.enabled) {
      // Development mode - return base64 encoded plaintext
      return {
        ciphertext: Buffer.from(plaintext).toString('base64'),
        keyId: 'disabled',
        encryptionContext: JSON.stringify(encryptionContext || {}),
      };
    }

    try {
      const command = new EncryptCommand({
        KeyId: keyId || this.defaultKeyId,
        Plaintext: Buffer.from(plaintext, 'utf-8'),
        EncryptionContext: encryptionContext as Record<string, string>,
      });

      const response = await this.client.send(command);

      if (!response.CiphertextBlob) {
        throw new Error('KMS encrypt returned no ciphertext');
      }

      return {
        ciphertext: Buffer.from(response.CiphertextBlob).toString('base64'),
        keyId: response.KeyId || keyId || this.defaultKeyId,
        encryptionContext: JSON.stringify(encryptionContext || {}),
      };
    } catch (error) {
      console.error('KMS encryption error:', error);
      throw new Error(`Failed to encrypt data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt ciphertext using AWS KMS
   */
  async decrypt(
    ciphertext: string,
    encryptionContext?: EncryptionContext
  ): Promise<DecryptionResult> {
    if (!this.enabled) {
      // Development mode - return base64 decoded plaintext
      return {
        plaintext: Buffer.from(ciphertext, 'base64').toString('utf-8'),
        keyId: 'disabled',
      };
    }

    try {
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, 'base64'),
        EncryptionContext: encryptionContext as Record<string, string>,
      });

      const response = await this.client.send(command);

      if (!response.Plaintext) {
        throw new Error('KMS decrypt returned no plaintext');
      }

      return {
        plaintext: Buffer.from(response.Plaintext).toString('utf-8'),
        keyId: response.KeyId || this.defaultKeyId,
      };
    } catch (error) {
      console.error('KMS decryption error:', error);
      throw new Error(`Failed to decrypt data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a data encryption key for envelope encryption
   */
  async generateDataKey(
    keySpec: 'AES_256' | 'AES_128' = 'AES_256',
    encryptionContext?: EncryptionContext,
    keyId?: string
  ): Promise<{ plaintext: Buffer; ciphertext: Buffer }> {
    if (!this.enabled) {
      // Development mode - return random key
      const plaintext = Buffer.from(crypto.getRandomValues(new Uint8Array(32)));
      return {
        plaintext,
        ciphertext: plaintext,
      };
    }

    try {
      const command = new GenerateDataKeyCommand({
        KeyId: keyId || this.defaultKeyId,
        KeySpec: keySpec,
        EncryptionContext: encryptionContext as Record<string, string>,
      });

      const response = await this.client.send(command);

      if (!response.Plaintext || !response.CiphertextBlob) {
        throw new Error('KMS generateDataKey returned incomplete response');
      }

      return {
        plaintext: Buffer.from(response.Plaintext),
        ciphertext: Buffer.from(response.CiphertextBlob),
      };
    } catch (error) {
      console.error('KMS generateDataKey error:', error);
      throw new Error(`Failed to generate data key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Encrypt OAuth access token
   */
  async encryptAccessToken(
    token: string,
    venueId: string,
    integrationType: string
  ): Promise<EncryptionResult> {
    return this.encrypt(token, {
      venueId,
      integrationType,
      purpose: 'access_token',
    });
  }

  /**
   * Decrypt OAuth access token
   */
  async decryptAccessToken(
    ciphertext: string,
    venueId: string,
    integrationType: string
  ): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      purpose: 'access_token',
    });
    return result.plaintext;
  }

  /**
   * Encrypt OAuth refresh token
   */
  async encryptRefreshToken(
    token: string,
    venueId: string,
    integrationType: string
  ): Promise<EncryptionResult> {
    return this.encrypt(token, {
      venueId,
      integrationType,
      purpose: 'refresh_token',
    });
  }

  /**
   * Decrypt OAuth refresh token
   */
  async decryptRefreshToken(
    ciphertext: string,
    venueId: string,
    integrationType: string
  ): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      purpose: 'refresh_token',
    });
    return result.plaintext;
  }

  /**
   * Encrypt API key
   */
  async encryptApiKey(
    apiKey: string,
    venueId: string,
    integrationType: string,
    keyName: string
  ): Promise<EncryptionResult> {
    return this.encrypt(apiKey, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_key',
    });
  }

  /**
   * Decrypt API key
   */
  async decryptApiKey(
    ciphertext: string,
    venueId: string,
    integrationType: string,
    keyName: string
  ): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_key',
    });
    return result.plaintext;
  }

  /**
   * Encrypt API secret
   */
  async encryptApiSecret(
    apiSecret: string,
    venueId: string,
    integrationType: string,
    keyName: string
  ): Promise<EncryptionResult> {
    return this.encrypt(apiSecret, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_secret',
    });
  }

  /**
   * Decrypt API secret
   */
  async decryptApiSecret(
    ciphertext: string,
    venueId: string,
    integrationType: string,
    keyName: string
  ): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      keyName,
      purpose: 'api_secret',
    });
    return result.plaintext;
  }

  /**
   * Encrypt webhook secret
   */
  async encryptWebhookSecret(
    secret: string,
    venueId: string,
    integrationType: string
  ): Promise<EncryptionResult> {
    return this.encrypt(secret, {
      venueId,
      integrationType,
      purpose: 'webhook_secret',
    });
  }

  /**
   * Decrypt webhook secret
   */
  async decryptWebhookSecret(
    ciphertext: string,
    venueId: string,
    integrationType: string
  ): Promise<string> {
    const result = await this.decrypt(ciphertext, {
      venueId,
      integrationType,
      purpose: 'webhook_secret',
    });
    return result.plaintext;
  }

  /**
   * Check if KMS is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get default key ID
   */
  getDefaultKeyId(): string {
    return this.defaultKeyId;
  }
}

// Export singleton instance
export const kmsService = new KMSService();

// Export class for testing
export { KMSService };
