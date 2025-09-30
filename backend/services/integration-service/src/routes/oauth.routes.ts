import { Router } from 'express';
import { oauthController } from '../controllers/oauth.controller';
import { authenticate } from '../middleware/auth.middleware';

export const oauthRoutes = Router();

// OAuth callbacks don't need auth (they come from external providers)
// But refresh needs auth
oauthRoutes.get('/callback/:provider', oauthController.handleCallback);
oauthRoutes.post('/refresh/:provider', authenticate, oauthController.refreshToken);
