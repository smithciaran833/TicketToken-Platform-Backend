import { FastifyRequest, FastifyReply } from 'fastify';
import { integrationService } from '../services/integration.service';
import { oauthService } from '../services/oauth.service';

export class ConnectionController {
  async listIntegrations(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { venueId } = request.query as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const integrations = await integrationService.getIntegrationStatus(venueId);

      return reply.send({
        success: true,
        data: integrations
      });
    } catch (error) {
      throw error;
    }
  }

  async getIntegration(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.query as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const integration = await integrationService.getIntegrationStatus(
        venueId,
        provider as any
      );

      if (!integration) {
        return reply.code(404).send({
          success: false,
          error: 'Integration not found'
        });
      }

      return reply.send({
        success: true,
        data: integration
      });
    } catch (error) {
      throw error;
    }
  }

  async connectIntegration(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId, credentials, config, userId } = request.body as any;

      if (!venueId || !credentials) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID and credentials are required'
        });
      }

      // Check if OAuth-based or API key-based
      if (provider === 'square' || provider === 'mailchimp' || provider === 'quickbooks') {
        // OAuth flow - return auth URL
        const authUrl = await oauthService.initiateOAuth(
          venueId,
          provider,
          userId || 'system'
        );

        return reply.send({
          success: true,
          data: {
            authUrl,
            message: 'Please complete OAuth authorization'
          }
        });
      }

      // API key-based connection
      const result = await integrationService.connectIntegration(
        venueId,
        provider as any,
        { ...credentials, config }
      );

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      throw error;
    }
  }

  async disconnectIntegration(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      await integrationService.disconnectIntegration(venueId, provider as any);

      return reply.send({
        success: true,
        message: `${provider} integration disconnected successfully`
      });
    } catch (error) {
      throw error;
    }
  }

  async reconnectIntegration(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      // Try to refresh token first
      const oauthService = require('../services/oauth.service').oauthService;
      const refreshed = await oauthService.refreshToken(venueId, provider);

      if (refreshed) {
        return reply.send({
          success: true,
          message: 'Integration reconnected successfully'
        });
      } else {
        return reply.code(400).send({
          success: false,
          error: 'Reconnection failed - please reconnect manually'
        });
      }
    } catch (error) {
      throw error;
    }
  }

  async validateApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { apiKey, apiSecret } = request.body as any;

      // Test the API key by initializing provider
      const providers: any = {
        stripe: require('../providers/stripe/stripe.provider').StripeProvider
      };

      const ProviderClass = providers[provider];
      if (!ProviderClass) {
        return reply.code(400).send({
          success: false,
          error: 'Provider does not support API key validation'
        });
      }

      const providerInstance = new ProviderClass();
      await providerInstance.initialize({ apiKey, apiSecret });
      const isValid = await providerInstance.testConnection();

      return reply.send({
        success: true,
        data: { valid: isValid }
      });
    } catch (error) {
      throw error;
    }
  }
}

export const connectionController = new ConnectionController();
