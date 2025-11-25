import { FastifyRequest, FastifyReply } from 'fastify';
import { oauthService } from '../services/oauth.service';
import { logger } from '../utils/logger';

export class OAuthController {
  async handleCallback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { code, state, error } = request.query as any;

      if (error) {
        logger.error('OAuth error', { provider, error });
        return reply.redirect(`/integrations/error?message=${error}`);
      }

      if (!code || !state) {
        return reply.code(400).send({
          success: false,
          error: 'Missing code or state parameter'
        });
      }

      const result = await oauthService.handleCallback(
        provider,
        code as string,
        state as string
      );

      // Check if HTML is accepted
      const acceptHeader = request.headers.accept || '';
      if (acceptHeader.includes('text/html')) {
        return reply.redirect(`/integrations/success?provider=${provider}&venueId=${result.venueId}`);
      } else {
        return reply.send({
          success: true,
          data: result
        });
      }
    } catch (error: any) {
      logger.error('OAuth callback failed', { error: error.message });

      const acceptHeader = request.headers.accept || '';
      if (acceptHeader.includes('text/html')) {
        return reply.redirect(`/integrations/error?message=${encodeURIComponent(error.message)}`);
      } else {
        throw error;
      }
    }
  }

  async refreshToken(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { provider } = request.params as any;
      const { venueId } = request.body as any;

      if (!venueId) {
        return reply.code(400).send({
          success: false,
          error: 'Venue ID is required'
        });
      }

      const newTokens = await oauthService.refreshToken(venueId, provider);

      return reply.send({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          expiresAt: newTokens.expires_at
        }
      });
    } catch (error) {
      throw error;
    }
  }
}

export const oauthController = new OAuthController();
