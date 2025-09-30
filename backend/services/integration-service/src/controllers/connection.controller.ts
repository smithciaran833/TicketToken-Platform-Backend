import { Request, Response, NextFunction } from 'express';
import { integrationService } from '../services/integration.service';
import { oauthService } from '../services/oauth.service';

export class ConnectionController {
  async listIntegrations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const venueId = req.query.venueId as string || req.body.venueId;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      const integrations = await integrationService.getIntegrationStatus(venueId);
      
      res.json({
        success: true,
        data: integrations
      });
    } catch (error) {
      next(error);
    }
  }

  async getIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const venueId = req.query.venueId as string || req.body.venueId;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      const integration = await integrationService.getIntegrationStatus(
        venueId,
        provider as any
      );
      
      if (!integration) {
        res.status(404).json({
          success: false,
          error: 'Integration not found'
        });
        return;
      }

      res.json({
        success: true,
        data: integration
      });
    } catch (error) {
      next(error);
    }
  }

  async connectIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId, credentials, config } = req.body;
      
      if (!venueId || !credentials) {
        res.status(400).json({
          success: false,
          error: 'Venue ID and credentials are required'
        });
        return;
      }

      // Check if OAuth-based or API key-based
      if (provider === 'square' || provider === 'mailchimp' || provider === 'quickbooks') {
        // OAuth flow - return auth URL
        const authUrl = await oauthService.initiateOAuth(
          venueId,
          provider,
          req.body.userId || 'system'
        );
        
        res.json({
          success: true,
          data: {
            authUrl,
            message: 'Please complete OAuth authorization'
          }
        });
        return;
      }

      // API key-based connection
      const result = await integrationService.connectIntegration(
        venueId,
        provider as any,
        { ...credentials, config }
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  async disconnectIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      await integrationService.disconnectIntegration(venueId, provider as any);
      
      res.json({
        success: true,
        message: `${provider} integration disconnected successfully`
      });
    } catch (error) {
      next(error);
    }
  }

  async reconnectIntegration(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { venueId } = req.body;
      
      if (!venueId) {
        res.status(400).json({
          success: false,
          error: 'Venue ID is required'
        });
        return;
      }

      // Try to refresh token first
      const oauthService = require('../services/oauth.service').oauthService;
      const refreshed = await oauthService.refreshToken(venueId, provider);
      
      if (refreshed) {
        res.json({
          success: true,
          message: 'Integration reconnected successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Reconnection failed - please reconnect manually'
        });
      }
    } catch (error) {
      next(error);
    }
  }

  async validateApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { apiKey, apiSecret } = req.body;
      
      // Test the API key by initializing provider
      const providers: any = {
        stripe: require('../providers/stripe/stripe.provider').StripeProvider
      };
      
      const ProviderClass = providers[provider];
      if (!ProviderClass) {
        res.status(400).json({
          success: false,
          error: 'Provider does not support API key validation'
        });
        return;
      }

      const providerInstance = new ProviderClass();
      await providerInstance.initialize({ apiKey, apiSecret });
      const isValid = await providerInstance.testConnection();
      
      res.json({
        success: true,
        data: { valid: isValid }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const connectionController = new ConnectionController();
