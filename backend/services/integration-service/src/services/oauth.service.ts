import { db } from '../config/database';
import { logger } from '../utils/logger';
import { tokenVault } from './token-vault.service';
import crypto from 'crypto';

export class OAuthService {
  private stateStore: Map<string, any> = new Map();

  async initiateOAuth(
    venueId: string,
    integrationType: string,
    userId: string
  ): Promise<string> {
    try {
      // Generate state token
      const state = this.generateStateToken();
      
      // Store state for verification
      this.stateStore.set(state, {
        venueId,
        integrationType,
        userId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

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
      // Verify state
      const stateData = this.stateStore.get(state);
      if (!stateData) {
        throw new Error('Invalid state token');
      }

      // Check expiration
      if (new Date() > stateData.expiresAt) {
        this.stateStore.delete(state);
        throw new Error('State token expired');
      }

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

      // Update integration status
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
        })
        .onConflict(['venue_id', 'integration_type'])
        .merge({
          status: 'connected',
          connected_at: new Date(),
          updated_at: new Date()
        });

      // Clean up state
      this.stateStore.delete(state);

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
      square: process.env.SQUARE_SANDBOX === 'true'
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com',
      mailchimp: 'https://login.mailchimp.com',
      quickbooks: 'https://appcenter.intuit.com'
    };

    const params: Record<string, any> = {
      square: {
        client_id: process.env.SQUARE_APP_ID,
        scope: 'ITEMS_READ ITEMS_WRITE INVENTORY_READ INVENTORY_WRITE PAYMENTS_READ CUSTOMERS_READ',
        state
      },
      mailchimp: {
        response_type: 'code',
        client_id: process.env.MAILCHIMP_CLIENT_ID,
        state
      },
      quickbooks: {
        client_id: process.env.QUICKBOOKS_CLIENT_ID,
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`,
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
    const axios = require('axios');
    const baseUrl = process.env.SQUARE_SANDBOX === 'true'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      code,
      grant_type: 'authorization_code'
    });

    return response.data;
  }

  private async exchangeMailchimpCode(code: string): Promise<any> {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://login.mailchimp.com/oauth2/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.MAILCHIMP_CLIENT_ID || '',
        client_secret: process.env.MAILCHIMP_CLIENT_SECRET || '',
        code,
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/mailchimp`
      })
    );

    return response.data;
  }

  private async exchangeQuickBooksCode(code: string): Promise<any> {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.API_URL}/api/v1/integrations/oauth/callback/quickbooks`
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
        }
      }
    );

    return response.data;
  }

  private async refreshSquareToken(refreshToken: string): Promise<any> {
    const axios = require('axios');
    const baseUrl = process.env.SQUARE_SANDBOX === 'true'
      ? 'https://connect.squareupsandbox.com'
      : 'https://connect.squareup.com';

    const response = await axios.post(`${baseUrl}/oauth2/token`, {
      client_id: process.env.SQUARE_APP_ID,
      client_secret: process.env.SQUARE_APP_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    return response.data;
  }

  private async refreshQuickBooksToken(refreshToken: string): Promise<any> {
    const axios = require('axios');
    
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      {
        auth: {
          username: process.env.QUICKBOOKS_CLIENT_ID || '',
          password: process.env.QUICKBOOKS_CLIENT_SECRET || ''
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

  cleanupExpiredStates(): void {
    const now = new Date();
    for (const [state, data] of this.stateStore.entries()) {
      if (data.expiresAt < now) {
        this.stateStore.delete(state);
      }
    }
  }
}

export const oauthService = new OAuthService();

// Clean up expired states every minute
setInterval(() => {
  oauthService.cleanupExpiredStates();
}, 60000);
