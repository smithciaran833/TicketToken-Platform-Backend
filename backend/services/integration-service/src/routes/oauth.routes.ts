import { FastifyInstance } from 'fastify';
import { oauthController } from '../controllers/oauth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateFastify } from '../middleware/validation.middleware';
import {
  oauthCallbackParamsSchema,
  oauthCallbackQuerySchema,
  refreshTokenSchema,
} from '../validators/schemas';

export async function oauthRoutes(fastify: FastifyInstance) {
  // GET /callback/:provider - OAuth callback from external providers (no auth required)
  fastify.get('/callback/:provider', {
    onRequest: [
      validateFastify({
        params: oauthCallbackParamsSchema,
        query: oauthCallbackQuerySchema,
      }),
    ]
  }, oauthController.handleCallback);
  
  // POST /refresh/:provider - Refresh OAuth token (requires auth)
  fastify.post('/refresh/:provider', {
    onRequest: [
      authenticate,
      validateFastify({
        params: oauthCallbackParamsSchema,
        body: refreshTokenSchema,
      }),
    ]
  }, oauthController.refreshToken);
}
