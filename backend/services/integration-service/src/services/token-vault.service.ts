import CryptoJS from 'crypto-js';
import { db } from '../config/database';
import { logger } from '../utils/logger';

export class TokenVaultService {
  private encryptionKey: string;

  constructor() {
    // In production, this would use AWS KMS
    // For development, we use a local key
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-characters';
    
    if (process.env.NODE_ENV === 'production' && process.env.MOCK_KMS === 'true') {
      logger.warn('Using mock KMS in production - this is not secure!');
    }
  }

  // Store OAuth token securely
  async storeToken(
    venueId: string,
    integration: string,
    token: any
  ): Promise<void> {
    try {
      // Encrypt tokens
      const encryptedAccessToken = this.encrypt(token.access_token);
      const encryptedRefreshToken = token.refresh_token 
        ? this.encrypt(token.refresh_token) 
        : null;

      // Upsert token record
      const existingToken = await db('oauth_tokens')
        .where({ venue_id: venueId, integration_type: integration })
        .first();

      if (existingToken) {
        await db('oauth_tokens')
          .where({ venue_id: venueId, integration_type: integration })
          .update({
            encrypted_access_token: encryptedAccessToken,
            encrypted_refresh_token: encryptedRefreshToken,
            expires_at: token.expires_at,
            scopes: token.scopes,
            last_refreshed_at: new Date(),
            updated_at: new Date()
          });
      } else {
        await db('oauth_tokens').insert({
          venue_id: venueId,
          integration_type: integration,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          expires_at: token.expires_at,
          scopes: token.scopes,
          token_type: token.token_type || 'Bearer'
        });
      }

      logger.info('Token stored securely', { 
        venueId, 
        integration,
        hasRefreshToken: !!token.refresh_token 
      });
    } catch (error) {
      logger.error('Failed to store token', { error, venueId, integration });
      throw error;
    }
  }

  // Retrieve and decrypt token
  async getToken(venueId: string, integration: string): Promise<any> {
    try {
      const record = await db('oauth_tokens')
        .where({ venue_id: venueId, integration_type: integration })
        .first();

      if (!record) {
        return null;
      }

      // Update last used timestamp
      await db('oauth_tokens')
        .where({ id: record.id })
        .update({ last_used_at: new Date() });

      // Decrypt tokens
      const accessToken = this.decrypt(record.encrypted_access_token);
      const refreshToken = record.encrypted_refresh_token 
        ? this.decrypt(record.encrypted_refresh_token)
        : null;

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: record.expires_at,
        scopes: record.scopes,
        token_type: record.token_type
      };
    } catch (error) {
      logger.error('Failed to retrieve token', { error, venueId, integration });
      throw error;
    }
  }

  // Store API key securely
  async storeApiKey(
    venueId: string,
    integration: string,
    apiKey: string,
    apiSecret?: string
  ): Promise<void> {
    try {
      const encryptedKey = this.encrypt(apiKey);
      const encryptedSecret = apiSecret ? this.encrypt(apiSecret) : null;

      const existing = await db('venue_api_keys')
        .where({ 
          venue_id: venueId, 
          integration_type: integration,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
        })
        .first();

      if (existing) {
        await db('venue_api_keys')
          .where({ id: existing.id })
          .update({
            encrypted_api_key: encryptedKey,
            encrypted_api_secret: encryptedSecret,
            is_valid: true,
            updated_at: new Date()
          });
      } else {
        await db('venue_api_keys').insert({
          venue_id: venueId,
          integration_type: integration,
          encrypted_api_key: encryptedKey,
          encrypted_api_secret: encryptedSecret,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
          is_valid: true
        });
      }

      logger.info('API key stored securely', { venueId, integration });
    } catch (error) {
      logger.error('Failed to store API key', { error, venueId, integration });
      throw error;
    }
  }

  // Get API key
  async getApiKey(venueId: string, integration: string): Promise<any> {
    try {
      const record = await db('venue_api_keys')
        .where({ 
          venue_id: venueId, 
          integration_type: integration,
          environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
        })
        .first();

      if (!record) {
        return null;
      }

      return {
        api_key: this.decrypt(record.encrypted_api_key),
        api_secret: record.encrypted_api_secret 
          ? this.decrypt(record.encrypted_api_secret)
          : null
      };
    } catch (error) {
      logger.error('Failed to retrieve API key', { error, venueId, integration });
      throw error;
    }
  }

  // Refresh token if needed
  async refreshTokenIfNeeded(venueId: string, integration: string): Promise<any> {
    const token = await this.getToken(venueId, integration);
    
    if (!token || !token.expires_at) {
      return token;
    }

    const expiresIn = new Date(token.expires_at).getTime() - Date.now();
    
    // Refresh if expires in less than 5 minutes
    if (expiresIn < 5 * 60 * 1000) {
      logger.info('Token needs refresh', { venueId, integration, expiresIn });
      
      // This would call the provider's refresh method
      // For now, return the existing token
      return token;
    }

    return token;
  }

  // Mock encryption for development
  private encrypt(text: string): string {
    if (process.env.MOCK_KMS === 'true') {
      // Simple encryption for development
      return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
    }
    
    // In production, this would use AWS KMS
    throw new Error('Real KMS not implemented yet');
  }

  // Mock decryption for development
  private decrypt(encryptedText: string): string {
    if (process.env.MOCK_KMS === 'true') {
      // Simple decryption for development
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    }
    
    // In production, this would use AWS KMS
    throw new Error('Real KMS not implemented yet');
  }
}

export const tokenVault = new TokenVaultService();
