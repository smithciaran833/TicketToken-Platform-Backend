import { Request, Response, NextFunction } from 'express';
import { oauthService } from '../services/oauth.service';
import { logger } from '../utils/logger';

export class OAuthController {
  async handleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { provider } = req.params;
      const { code, state, error } = req.query;
      
      if (error) {
        logger.error('OAuth error', { provider, error });
        res.redirect(`/integrations/error?message=${error}`);
        return;
      }

      if (!code || !state) {
        res.status(400).json({
          success: false,
          error: 'Missing code or state parameter'
        });
        return;
      }

      const result = await oauthService.handleCallback(
        provider,
        code as string,
        state as string
      );

      // Redirect to success page or return JSON
      if (req.accepts('html')) {
        res.redirect(`/integrations/success?provider=${provider}&venueId=${result.venueId}`);
      } else {
        res.json({
          success: true,
          data: result
        });
      }
    } catch (error: any) {
      logger.error('OAuth callback failed', { error: error.message });
      
      if (req.accepts('html')) {
        res.redirect(`/integrations/error?message=${encodeURIComponent(error.message)}`);
      } else {
        next(error);
      }
    }
  }

  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
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

      const newTokens = await oauthService.refreshToken(venueId, provider);
      
      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          expiresAt: newTokens.expires_at
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const oauthController = new OAuthController();
