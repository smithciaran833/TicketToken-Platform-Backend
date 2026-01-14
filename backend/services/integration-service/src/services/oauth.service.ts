import { db } from '../config/database';
import { logger } from '../utils/logger';
import { config } from '../config';
import { tokenVault } from './token-vault.service';
import crypto from 'crypto';
import Redis from 'ioredis';
import axios from 'axios';

export class OAuthService {
  private redis: InstanceType<typeof Redis>;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });
  }

  async initiateOAuth(
    venueId: string,
    integrationType: string,
    userId: string
  ): Promise<string> {
    try {
      // Generate state token
      const state = this.generateStateToken();
      
      // Store state in Redis with 10 minute TTL
      await this.redis.setex(
        `oauth:state:${state}`,
        600, // 10 minutes
        JSON.stringify({
          venueId,
          integrationType,
          userId,
          createdAt: new Date().toISOString(),
        })
      );

      // Get OAuth URL based on provider
      const authUrl = this.getOAuthUrl(integrationType, state);

      // Log OAuth initiation
      await db('sync_logs').insert({
        venue_id: venueId,
        integration_type: integrationType,
        operation: 'oauth_initiated',
        status: 'pending',
        started_at: new Date()
      });

      logger.info('OAuth initiated', {
        venueId,
        integrationType,
        userId
      });

      return authUrl;
    } catch (error) {
      logger.error('Failed to initiate OAuth', {
        venueId,
        integrationType,
        error
      });
      throw error;
    }
  }

  async handleCallback(
    provider: string,
    code: string,
    state: string
  ): Promise<any> {
    try {
      // Verify state from Redis
      const stateJson = await this.redis.get(`oauth:state:${state}`);
      if (!stateJson) {
        throw new Error('Invalid or expired state token');
      }

      const stateData = JSON.parse(stateJson);

      // Exchange code for token
      const tokens = await this.exchangeCodeForToken(provider, code);

      // Store tokens securely
      await tokenVault.storeToken(
        stateData.venueId,
        provider,
        {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: this.calculateExpiry(tokens.expires_in),
          scopes: tokens.scope?.split(' ') || []
        }
      );

      // Update integration status - use upsert pattern
      const existingConfig = await db('integration_configs')
        .where({ venue_id: stateData.venueId, integration_type: provider })
        .first();

      if (existingConfig) {
        await db('integration_configs')
          .where({ venue_id: stateData.venueId, integration_type: provider })
          .update({
            status: 'connected',
            connected_at: new Date(),
            updated_at: new Date()
          });
      } else {
        await db('integration_configs')
          .insert({
            venue_id: stateData.venueId,
            integration_type: provider,
            status: 'connected',
            connected_at: new Date(),
            config: {
              syncEnabled: true,
              syncInterval: 300
            }
          });
      }

      // Clean up state from Redis
      await this.redis.del(`oauth:state:${state}`);

      // Log success
      await db('sync_logs').insert({
        venue_id: stateData.venueId,
        integration_type: provider,
        operation: 'oauth_completed',
        status: 'completed',
        started_at: stateData.createdAt,
        completed_at: new Date()
      });

      logger.info('OAuth completed successfully', {
        venueId: stateData.venueId,
        provider
      });

      return {
        success: true,
        venueId: stateData.venueId,
        provider
      };
    } catch (error: any) {
      logger.error('OAuth callback failed', {
        provider,
        error: error.message
      });
      throw error;
    }
  }

  async refreshToken(venueId: string, integrationType: string): Promise<any> {
    try {
      const token = await tokenVault.getToken(venueId, integrationType);
      
      if (!token || !token.refresh_token) {
        throw new Error('No refresh token available');
      }

      let newTokens;
      switch (integrationType) {
        case 'square':
          newTokens = await this.refreshSquareToken(token.refresh_token);
          break;
        case 'quickbooks':
          newTokens = await this.refreshQuickBooksToken(token.refresh_token);
          break;
        case 'mailchimp':
          // Mailchimp tokens don't expire
          return token;
        default:
          throw new Error(`Refresh not supported for ${integrationType}`);
      }

      // Store new tokens
      await tokenVault.storeToken(venueId, integrationType, {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || token.refresh_token,
        expires_at: this.calculateExpiry(newTokens.expires_in),
        scopes: newTokens.scope?.split(' ') || token.scopes
      });

      logger.info('Token refreshed successfully', {
        venueId,
        integrationType
      });

      return newTokens;
    } catch (error) {
      logger.error('Token refresh failed', {
        venueId,
        integrationType,
        error
      });

      // Mark integration as needing reauth
      await db('integration_configs')
        .where({
          venue_id: venueId,
          integration_type: integrationType
        })
        .update({
          status: 'error',
          last_error: 'Token refresh failed',
          last_error_at: new Date(),
          updated_at: new Date()
        });

      throw error;
    }
  }

  private getOAuthUrl(integrationType: string, state: string): string {
    const baseUrls: Record<string, string> = {
      square: config.providers.square.sandbox
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com',
      mailchimp: 'https://login.mailchimp.com',
      quickbooks: 'https://appcenter.intuit.com'
    };

    const params: Record<string, any> = {
      square: {
        client_id: config.providers.square.clientId,
        scope: 'ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE PAYMENTS_READ CUSTOMERS_READ',
        state
      },
      mailchimp: {
        response_type: 'code',
        client_id: config.providers.mailchimp.clientId,
        state
      },
      quickbooks: {
        client_id: config.providers.quickbooks.clientId,
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: `${config.server.apiUrl}/api/v1/integrations/oauth/callback/quickbooks`,
        response_type: 'code',
        state
      }
    };

    const baseUrl = baseUrls[integrationType];
    const queryParams = new URLSearchParams(params[integrationType]);
    const path = integrationType === 'quickbooks' ? '/connect/oauth2' : '/oauth2/authorize';

    return `${baseUrl}${path}?${queryParams}`;
  }

  private async exchangeCodeForToken(provider: string, code: string): Promise<any> {
    
    switch (provider) {
      case 'square':
        return this.exchangeSquareCode(code);
      case 'mailchimp':
        return this.exchangeMailchimpCode(code);
      case 'quickbooks':
        return this.exchangeQuickBooksCode(code);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  private async exchangeSquareCode(code: string): Promise<any> {
    const baseUrl = config.providers.square.sandbox
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: config.providers.square.clientId,
      client_secret: config.providers.square.clientSecret,
      code,
      grant_type: 'authorization_code'
    });

    return response.data;
  }

  private async exchangeMailchimpCode(code: string): Promise<any> {
    const clientId = config.providers.mailchimp.clientId;
    const clientSecret = config.providers.mailchimp.clientSecret;
    
    if (!clientId || !clientSecret) {
      throw new Error('Mailchimp OAuth credentials not configured');
    }
    
    const response = await axios.post(
      'https://login.mailchimp.com/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${config.server.apiUrl}/api/v1/integrations/oauth/callback/mailchimp`
      })
    );

    return response.data;
  }

  private async exchangeQuickBooksCode(code: string): Promise<any> {
    const clientId = config.providers.quickbooks.clientId;
    const clientSecret = config.providers.quickbooks.clientSecret;
    
    if (!clientId || !clientSecret) {
      throw new Error('QuickBooks OAuth credentials not configured');
    }
    
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${config.server.apiUrl}/api/v1/integrations/oauth/callback/quickbooks`
      }),
      {
        auth: {
          username: clientId,
          password: clientSecret
        }
      }
    );

    return response.data;
  }

  private async refreshSquareToken(refreshToken: string): Promise<any> {
    const baseUrl = config.providers.square.sandbox
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: config.providers.square.clientId,
      client_secret: config.providers.square.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    return response.data;
  }

  private async refreshQuickBooksToken(refreshToken: string): Promise<any> {
    const clientId = config.providers.quickbooks.clientId;
    const clientSecret = config.providers.quickbooks.clientSecret;
    
    if (!clientId || !clientSecret) {
      throw new Error('QuickBooks OAuth credentials not configured');
    }
    
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: {
          username: clientId,
          password: clientSecret
        }
      }
    );

    return response.data;
  }

  private generateStateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private calculateExpiry(expiresIn?: number): Date | null {
    if (!expiresIn) return null;
    return new Date(Date.now() + expiresIn * 1000);
  }
}

export const oauthService = new OAuthService();
