import { OAuth2Client } from 'google-auth-library';
import { pool } from '../config/database';
import { JWTService } from './jwt.service';
import { auditService } from './audit.service';
import { AuthenticationError, ValidationError } from '../errors';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  provider: 'google';
  verified: boolean;
}

export class OAuthService {
  private googleClient: OAuth2Client;
  private jwtService: JWTService;

  constructor(jwtService?: JWTService) {
    this.googleClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID || 'your-google-client-id',
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/v1/auth/oauth/google/callback'
    );
    this.jwtService = jwtService || new JWTService();
  }

  private async exchangeGoogleCode(code: string): Promise<OAuthProfile> {
    try {
      const { tokens } = await this.googleClient.getToken(code);

      if (!tokens.id_token) {
        throw new AuthenticationError('No ID token received from Google');
      }

      const ticket = await this.googleClient.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_CLIENT_ID || 'your-google-client-id'
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new AuthenticationError('Invalid Google token payload');
      }

      return {
        id: payload.sub,
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
        provider: 'google',
        verified: payload.email_verified || false
      };
    } catch (error: any) {
      logger.error('Google OAuth error', { error: error.message, stack: error.stack });
      throw new AuthenticationError('Google authentication failed: ' + error.message);
    }
  }

  private async findOrCreateUser(profile: OAuthProfile, tenantId?: string): Promise<any> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const finalTenantId = tenantId || '00000000-0000-0000-0000-000000000001';
      // SECURITY FIX: Use parameterized query to prevent SQL injection
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', finalTenantId]);

      const oauthResult = await client.query(
        `SELECT oc.user_id FROM oauth_connections oc
         JOIN users u ON oc.user_id = u.id
         WHERE oc.provider = $1 AND oc.provider_user_id = $2 AND u.tenant_id = $3 AND u.deleted_at IS NULL`,
        [profile.provider, profile.id, finalTenantId]
      );

      let userId: string;

      if (oauthResult.rows.length > 0) {
        userId = oauthResult.rows[0].user_id;

        await client.query(
          `UPDATE oauth_connections
           SET profile_data = $1, updated_at = CURRENT_TIMESTAMP
           WHERE provider = $2 AND provider_user_id = $3`,
          [JSON.stringify(profile), profile.provider, profile.id]
        );

        await client.query(
          `UPDATE users
           SET first_name = COALESCE(first_name, $1),
               last_name = COALESCE(last_name, $2),
               avatar_url = COALESCE(avatar_url, $3),
               last_login_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [profile.firstName, profile.lastName, profile.picture, userId]
        );
      } else {
        const userResult = await client.query(
          `SELECT id FROM users WHERE email = $1 AND tenant_id = $2`,
          [profile.email, finalTenantId]
        );

        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id;

          await client.query(
            `INSERT INTO oauth_connections (id, user_id, tenant_id, provider, provider_user_id, profile_data, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), userId, finalTenantId, profile.provider, profile.id, JSON.stringify(profile)]
          );
        } else {
          userId = crypto.randomUUID();

          await client.query(
            `INSERT INTO users (
              id, email, password_hash, first_name, last_name, avatar_url,
              email_verified, email_verified_at, tenant_id, role, is_active,
              status, created_at, updated_at, last_login_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8, 'user', true, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              userId,
              profile.email,
              '',
              profile.firstName || profile.email.split('@')[0],
              profile.lastName || '',
              profile.picture,
              profile.verified,
              finalTenantId
            ]
          );

          await client.query(
            `INSERT INTO oauth_connections (id, user_id, tenant_id, provider, provider_user_id, profile_data, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), userId, finalTenantId, profile.provider, profile.id, JSON.stringify(profile)]
          );
        }
      }

      const userRecord = await client.query(
        `SELECT * FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, finalTenantId]
      );

      await client.query('COMMIT');
      return userRecord.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async createSession(userId: string, tenantId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const sessionId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO user_sessions (id, user_id, tenant_id, started_at, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)`,
      [sessionId, userId, tenantId, ipAddress, userAgent, JSON.stringify({})]
    );

    await auditService.logSessionCreated(userId, sessionId, ipAddress, userAgent, tenantId);

    return sessionId;
  }

  async authenticate(provider: string, code: string, tenantId?: string, ipAddress?: string, userAgent?: string): Promise<any> {
    if (provider !== 'google') {
      throw new ValidationError([`Unsupported OAuth provider: ${provider}`]);
    }

    const profile = await this.exchangeGoogleCode(code);
    const user = await this.findOrCreateUser(profile, tenantId);
    const sessionId = await this.createSession(user.id, user.tenant_id, ipAddress, userAgent);
    const tokens = await this.jwtService.generateTokenPair(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified,
        email_verified: user.email_verified,
        tenant_id: user.tenant_id
      },
      tokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken
      },
      sessionId,
      provider: profile.provider
    };
  }

  async linkProvider(userId: string, provider: string, code: string): Promise<any> {
    if (provider !== 'google') {
      throw new ValidationError([`Unsupported OAuth provider: ${provider}`]);
    }

    const profile = await this.exchangeGoogleCode(code);

    const userCheck = await pool.query(
      `SELECT tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (userCheck.rows.length === 0) {
      throw new ValidationError(['User not found']);
    }

    const userTenantId = userCheck.rows[0].tenant_id;

    const existingConnection = await pool.query(
      `SELECT oc.id FROM oauth_connections oc
       JOIN users u ON oc.user_id = u.id
       WHERE oc.user_id = $1 AND oc.provider = $2 AND u.tenant_id = $3 AND u.deleted_at IS NULL`,
      [userId, provider, userTenantId]
    );

    if (existingConnection.rows.length > 0) {
      throw new ValidationError([`${provider} account already linked to your account`]);
    }

    const otherUserConnection = await pool.query(
      `SELECT oc.user_id FROM oauth_connections oc
       JOIN users u ON oc.user_id = u.id
       WHERE oc.provider = $1 AND oc.provider_user_id = $2 AND u.tenant_id = $3 AND u.deleted_at IS NULL`,
      [provider, profile.id, userTenantId]
    );

    if (otherUserConnection.rows.length > 0) {
      throw new ValidationError(['This OAuth account is already linked to another user']);
    }

    await pool.query(
      `INSERT INTO oauth_connections (id, user_id, tenant_id, provider, provider_user_id, profile_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), userId, userTenantId, provider, profile.id, JSON.stringify(profile)]
    );

    return {
      success: true,
      message: `${provider} account linked successfully`,
      provider
    };
  }

  async unlinkProvider(userId: string, provider: string): Promise<any> {
    const result = await pool.query(
      `DELETE FROM oauth_connections oc
       USING users u
       WHERE oc.user_id = u.id
       AND oc.user_id = $1
       AND oc.provider = $2
       AND u.deleted_at IS NULL
       RETURNING oc.id`,
      [userId, provider]
    );

    if (result.rows.length === 0) {
      throw new ValidationError([`No ${provider} account linked to your account`]);
    }

    return {
      success: true,
      message: `${provider} account unlinked successfully`,
      provider
    };
  }

  async handleOAuthLogin(provider: 'google', token: string): Promise<any> {
    return this.authenticate(provider, token);
  }

  async linkOAuthProvider(userId: string, provider: 'google', token: string): Promise<any> {
    return this.linkProvider(userId, provider, token);
  }
}
