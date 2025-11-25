import { kmsService } from '../config/kms';
import { db } from '../config/database';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: Date;
  refreshExpiresAt?: Date;
  scopes?: string[];
  tokenType?: string;
}

export interface ApiKeys {
  apiKey: string;
  apiSecret?: string;
  webhookSecret?: string;
  keyName: string;
  keyType: string;
  environment?: string;
}

export class CredentialEncryptionService {
  /**
   * Store OAuth tokens securely with KMS encryption
   */
  async storeOAuthTokens(
    venueId: string,
    integrationType: string,
    provider: string,
    tokens: OAuthTokens
  ): Promise<void> {
    try {
      // Encrypt tokens using KMS
      const accessTokenEncrypted = await kmsService.encryptAccessToken(
        tokens.accessToken,
        venueId,
        integrationType
      );

      let refreshTokenEncrypted = null;
      if (tokens.refreshToken) {
        refreshTokenEncrypted = await kmsService.encryptRefreshToken(
          tokens.refreshToken,
          venueId,
          integrationType
        );
      }

      let idTokenEncrypted = null;
      if (tokens.idToken) {
        const idTokenResult = await kmsService.encrypt(
          tokens.idToken,
          {
            venueId,
            integrationType,
            purpose: 'id_token',
          }
        );
        idTokenEncrypted = idTokenResult.ciphertext;
      }

      // Store in database
      await db('oauth_tokens')
        .insert({
          venue_id: venueId,
          integration_type: integrationType,
          provider,
          access_token_encrypted: accessTokenEncrypted.ciphertext,
          refresh_token_encrypted: refreshTokenEncrypted?.ciphertext,
          id_token_encrypted: idTokenEncrypted,
          access_token_expires_at: tokens.expiresAt,
          refresh_token_expires_at: tokens.refreshExpiresAt,
          scopes: tokens.scopes || [],
          token_type: tokens.tokenType || 'Bearer',
          kms_key_id: accessTokenEncrypted.keyId,
          encryption_context: accessTokenEncrypted.encryptionContext,
          token_version: 1,
          last_validated_at: new Date(),
          validation_status: 'valid',
        })
        .onConflict(['venue_id', 'integration_type'])
        .merge();

      console.log(`✅ OAuth tokens stored securely for venue ${venueId}, integration ${integrationType}`);
    } catch (error) {
      console.error('Failed to store OAuth tokens:', error);
      throw new Error(`Failed to store OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve and decrypt OAuth tokens
   */
  async retrieveOAuthTokens(
    venueId: string,
    integrationType: string
  ): Promise<OAuthTokens | null> {
    try {
      const record = await db('oauth_tokens')
        .where({
          venue_id: venueId,
          integration_type: integrationType,
        })
        .first();

      if (!record) {
        return null;
      }

      // Check if tokens are expired
      if (record.access_token_expires_at && new Date(record.access_token_expires_at) < new Date()) {
        console.warn(`Access token expired for venue ${venueId}, integration ${integrationType}`);
        // Token expired, but still return it - caller should handle refresh
      }

      // Decrypt tokens
      const accessToken = await kmsService.decryptAccessToken(
        record.access_token_encrypted,
        venueId,
        integrationType
      );

      let refreshToken: string | undefined;
      if (record.refresh_token_encrypted) {
        refreshToken = await kmsService.decryptRefreshToken(
          record.refresh_token_encrypted,
          venueId,
          integrationType
        );
      }

      let idToken: string | undefined;
      if (record.id_token_encrypted) {
        const idTokenResult = await kmsService.decrypt(
          record.id_token_encrypted,
          {
            venueId,
            integrationType,
            purpose: 'id_token',
          }
        );
        idToken = idTokenResult.plaintext;
      }

      return {
        accessToken,
        refreshToken,
        idToken,
        expiresAt: record.access_token_expires_at,
        refreshExpiresAt: record.refresh_token_expires_at,
        scopes: record.scopes || [],
        tokenType: record.token_type || 'Bearer',
      };
    } catch (error) {
      console.error('Failed to retrieve OAuth tokens:', error);
      throw new Error(`Failed to retrieve OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Store API keys securely with KMS encryption
   */
  async storeApiKeys(
    venueId: string,
    integrationType: string,
    provider: string,
    keys: ApiKeys
  ): Promise<void> {
    try {
      // Encrypt API key
      const apiKeyEncrypted = await kmsService.encryptApiKey(
        keys.apiKey,
        venueId,
        integrationType,
        keys.keyName
      );

      // Encrypt API secret if provided
      let apiSecretEncrypted = null;
      if (keys.apiSecret) {
        const result = await kmsService.encryptApiSecret(
          keys.apiSecret,
          venueId,
          integrationType,
          keys.keyName
        );
        apiSecretEncrypted = result.ciphertext;
      }

      // Encrypt webhook secret if provided
      let webhookSecretEncrypted = null;
      if (keys.webhookSecret) {
        const result = await kmsService.encryptWebhookSecret(
          keys.webhookSecret,
          venueId,
          integrationType
        );
        webhookSecretEncrypted = result.ciphertext;
      }

      // Store in database
      await db('venue_api_keys')
        .insert({
          venue_id: venueId,
          integration_type: integrationType,
          provider,
          key_name: keys.keyName,
          api_key_encrypted: apiKeyEncrypted.ciphertext,
          api_secret_encrypted: apiSecretEncrypted,
          webhook_secret_encrypted: webhookSecretEncrypted,
          key_type: keys.keyType,
          environment: keys.environment || 'production',
          status: 'active',
          kms_key_id: apiKeyEncrypted.keyId,
          encryption_context: apiKeyEncrypted.encryptionContext,
          key_version: 1,
          last_validated_at: new Date(),
          validation_status: 'valid',
        })
        .onConflict(['venue_id', 'integration_type', 'key_name'])
        .merge();

      console.log(`✅ API keys stored securely for venue ${venueId}, integration ${integrationType}`);
    } catch (error) {
      console.error('Failed to store API keys:', error);
      throw new Error(`Failed to store API keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve and decrypt API keys
   */
  async retrieveApiKeys(
    venueId: string,
    integrationType: string,
    keyName: string
  ): Promise<ApiKeys | null> {
    try {
      const record = await db('venue_api_keys')
        .where({
          venue_id: venueId,
          integration_type: integrationType,
          key_name: keyName,
        })
        .first();

      if (!record) {
        return null;
      }

      // Check if key is expired
      if (record.expires_at && new Date(record.expires_at) < new Date()) {
        console.warn(`API key expired for venue ${venueId}, integration ${integrationType}, key ${keyName}`);
      }

      // Decrypt API key
      const apiKey = await kmsService.decryptApiKey(
        record.api_key_encrypted,
        venueId,
        integrationType,
        keyName
      );

      // Decrypt API secret if present
      let apiSecret: string | undefined;
      if (record.api_secret_encrypted) {
        apiSecret = await kmsService.decryptApiSecret(
          record.api_secret_encrypted,
          venueId,
          integrationType,
          keyName
        );
      }

      // Decrypt webhook secret if present
      let webhookSecret: string | undefined;
      if (record.webhook_secret_encrypted) {
        webhookSecret = await kmsService.decryptWebhookSecret(
          record.webhook_secret_encrypted,
          venueId,
          integrationType
        );
      }

      // Update last used timestamp
      await db('venue_api_keys')
        .where({ id: record.id })
        .update({
          last_used_at: new Date(),
          usage_count_24h: db.raw('usage_count_24h + 1'),
          usage_count_30d: db.raw('usage_count_30d + 1'),
        });

      return {
        apiKey,
        apiSecret,
        webhookSecret,
        keyName: record.key_name,
        keyType: record.key_type,
        environment: record.environment,
      };
    } catch (error) {
      console.error('Failed to retrieve API keys:', error);
      throw new Error(`Failed to retrieve API keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate OAuth tokens (update with new tokens)
   */
  async rotateOAuthTokens(
    venueId: string,
    integrationType: string,
    newTokens: OAuthTokens
  ): Promise<void> {
    try {
      await this.storeOAuthTokens(venueId, integrationType, 'oauth', newTokens);
      
      // Update rotation timestamp
      await db('oauth_tokens')
        .where({
          venue_id: venueId,
          integration_type: integrationType,
        })
        .update({
          last_rotated_at: new Date(),
          token_version: db.raw('token_version + 1'),
        });

      console.log(`✅ OAuth tokens rotated for venue ${venueId}, integration ${integrationType}`);
    } catch (error) {
      console.error('Failed to rotate OAuth tokens:', error);
      throw new Error(`Failed to rotate OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rotate API keys (update with new keys)
   */
  async rotateApiKeys(
    venueId: string,
    integrationType: string,
    keyName: string,
    newKeys: ApiKeys
  ): Promise<void> {
    try {
      await this.storeApiKeys(venueId, integrationType, 'api', newKeys);
      
      // Update rotation timestamp
      await db('venue_api_keys')
        .where({
          venue_id: venueId,
          integration_type: integrationType,
          key_name: keyName,
        })
        .update({
          last_rotated_at: new Date(),
          key_version: db.raw('key_version + 1'),
        });

      console.log(`✅ API keys rotated for venue ${venueId}, integration ${integrationType}, key ${keyName}`);
    } catch (error) {
      console.error('Failed to rotate API keys:', error);
      throw new Error(`Failed to rotate API keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete credentials (for security/compliance)
   */
  async deleteOAuthTokens(venueId: string, integrationType: string): Promise<void> {
    try {
      await db('oauth_tokens')
        .where({
          venue_id: venueId,
          integration_type: integrationType,
        })
        .delete();

      console.log(`✅ OAuth tokens deleted for venue ${venueId}, integration ${integrationType}`);
    } catch (error) {
      console.error('Failed to delete OAuth tokens:', error);
      throw new Error(`Failed to delete OAuth tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete API keys (for security/compliance)
   */
  async deleteApiKeys(venueId: string, integrationType: string, keyName: string): Promise<void> {
    try {
      await db('venue_api_keys')
        .where({
          venue_id: venueId,
          integration_type: integrationType,
          key_name: keyName,
        })
        .delete();

      console.log(`✅ API keys deleted for venue ${venueId}, integration ${integrationType}, key ${keyName}`);
    } catch (error) {
      console.error('Failed to delete API keys:', error);
      throw new Error(`Failed to delete API keys: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate token freshness and trigger rotation if needed
   */
  async validateAndRotateIfNeeded(
    venueId: string,
    integrationType: string
  ): Promise<boolean> {
    try {
      const record = await db('oauth_tokens')
        .where({
          venue_id: venueId,
          integration_type: integrationType,
        })
        .first();

      if (!record) {
        return false;
      }

      // Check if access token is expiring soon (within 5 minutes)
      const expiresAt = new Date(record.access_token_expires_at);
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

      if (expiresAt < fiveMinutesFromNow) {
        console.log(`⚠️ Access token expiring soon for venue ${venueId}, rotation needed`);
        return true; // Caller should refresh token
      }

      // Update validation status
      await db('oauth_tokens')
        .where({ id: record.id })
        .update({
          last_validated_at: new Date(),
          validation_status: 'valid',
        });

      return false;
    } catch (error) {
      console.error('Failed to validate tokens:', error);
      return true; // Assume rotation needed on error
    }
  }
}

// Export singleton instance
export const credentialEncryptionService = new CredentialEncryptionService();
