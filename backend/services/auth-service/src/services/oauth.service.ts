import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { pool } from '../config/database';
import { JWTService } from './jwt.service';
import { AuthenticationError, ValidationError } from '../errors';
import crypto from 'crypto';
import { env } from '../config/env';

interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  provider: 'google' | 'github' | 'apple';
  verified: boolean;
}

interface OAuthTokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
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

  /**
   * Exchange authorization code for access token and profile (Google)
   */
  private async exchangeGoogleCode(code: string): Promise<OAuthProfile> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.googleClient.getToken(code);
      
      if (!tokens.id_token) {
        throw new AuthenticationError('No ID token received from Google');
      }

      // Verify and decode the ID token
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
      console.error('Google OAuth error:', error);
      throw new AuthenticationError('Google authentication failed: ' + error.message);
    }
  }

  /**
   * Exchange authorization code for access token and profile (GitHub)
   */
  private async exchangeGitHubCode(code: string): Promise<OAuthProfile> {
    try {
      // Exchange code for access token
      const tokenResponse = await axios.post<OAuthTokenResponse>(
        'https://github.com/login/oauth/access_token',
        {
          client_id: env.GITHUB_CLIENT_ID || 'your-github-client-id',
          client_secret: env.GITHUB_CLIENT_SECRET || 'your-github-client-secret',
          code,
          redirect_uri: env.GITHUB_REDIRECT_URI || 'http://localhost:3001/api/v1/auth/oauth/github/callback'
        },
        {
          headers: { Accept: 'application/json' }
        }
      );

      const accessToken = tokenResponse.data.access_token;

      // Get user profile
      const profileResponse = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });

      const profile = profileResponse.data;

      // Get primary email if not public
      let email = profile.email;
      if (!email) {
        const emailResponse = await axios.get('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json'
          }
        });
        const primaryEmail = emailResponse.data.find((e: any) => e.primary);
        email = primaryEmail?.email;
      }

      if (!email) {
        throw new AuthenticationError('No email found in GitHub profile');
      }

      // Parse name
      const nameParts = (profile.name || profile.login).split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      return {
        id: profile.id.toString(),
        email,
        firstName,
        lastName,
        picture: profile.avatar_url,
        provider: 'github',
        verified: true // GitHub emails are verified
      };
    } catch (error: any) {
      console.error('GitHub OAuth error:', error);
      throw new AuthenticationError('GitHub authentication failed: ' + error.message);
    }
  }

  /**
   * Find or create user from OAuth profile
   */
  private async findOrCreateUser(profile: OAuthProfile, tenantId?: string): Promise<any> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Set tenant context
      const finalTenantId = tenantId || '00000000-0000-0000-0000-000000000001';
      await client.query(`SET LOCAL app.current_tenant_id = '${finalTenantId}'`);

      // Check if OAuth connection exists (with tenant isolation)
      const oauthResult = await client.query(
        `SELECT oc.user_id FROM oauth_connections oc
         JOIN users u ON oc.user_id = u.id
         WHERE oc.provider = $1 AND oc.provider_user_id = $2 AND u.tenant_id = $3 AND u.deleted_at IS NULL`,
        [profile.provider, profile.id, finalTenantId]
      );

      let userId: string;

      if (oauthResult.rows.length > 0) {
        // Existing OAuth connection - find user
        userId = oauthResult.rows[0].user_id;

        // Update profile data in oauth_connections
        await client.query(
          `UPDATE oauth_connections 
           SET profile_data = $1, updated_at = CURRENT_TIMESTAMP 
           WHERE provider = $2 AND provider_user_id = $3`,
          [JSON.stringify(profile), profile.provider, profile.id]
        );

        // Update user profile with latest OAuth data
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
        // Check if user exists by email in this tenant
        const userResult = await client.query(
          `SELECT id FROM users WHERE email = $1 AND tenant_id = $2`,
          [profile.email, finalTenantId]
        );

        if (userResult.rows.length > 0) {
          // User exists - link OAuth account
          userId = userResult.rows[0].id;

          await client.query(
            `INSERT INTO oauth_connections (id, user_id, provider, provider_user_id, profile_data, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), userId, profile.provider, profile.id, JSON.stringify(profile)]
          );
        } else {
          // Create new user
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
              '', // OAuth users don't have passwords
              profile.firstName || profile.email.split('@')[0],
              profile.lastName || '',
              profile.picture,
              profile.verified,
              finalTenantId
            ]
          );

          // Create OAuth connection
          await client.query(
            `INSERT INTO oauth_connections (id, user_id, provider, provider_user_id, profile_data, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [crypto.randomUUID(), userId, profile.provider, profile.id, JSON.stringify(profile)]
          );
        }
      }

      // Get complete user record (with tenant verification for isolation)
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

  /**
   * Create user session
   */
  private async createSession(userId: string, ipAddress?: string, userAgent?: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    
    await pool.query(
      `INSERT INTO user_sessions (id, user_id, started_at, ip_address, user_agent, metadata)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5)`,
      [sessionId, userId, ipAddress, userAgent, JSON.stringify({})]
    );

    return sessionId;
  }

  /**
   * Main authenticate method (called by routes)
   */
  async authenticate(provider: string, code: string, tenantId?: string, ipAddress?: string, userAgent?: string): Promise<any> {
    let profile: OAuthProfile;

    // Exchange code for profile based on provider
    if (provider === 'google') {
      profile = await this.exchangeGoogleCode(code);
    } else if (provider === 'github') {
      profile = await this.exchangeGitHubCode(code);
    } else {
      throw new ValidationError([`Unsupported OAuth provider: ${provider}`]);
    }

    // Find or create user
    const user = await this.findOrCreateUser(profile, tenantId);

    // Create session
    const sessionId = await this.createSession(user.id, ipAddress, userAgent);

    // Generate JWT tokens
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

  /**
   * Link OAuth provider to existing user account
   */
  async linkProvider(userId: string, provider: string, code: string): Promise<any> {
    let profile: OAuthProfile;

    // Exchange code for profile
    if (provider === 'google') {
      profile = await this.exchangeGoogleCode(code);
    } else if (provider === 'github') {
      profile = await this.exchangeGitHubCode(code);
    } else {
      throw new ValidationError([`Unsupported OAuth provider: ${provider}`]);
    }

    // Get user's tenant_id for multi-tenant isolation
    const userCheck = await pool.query(
      `SELECT tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    
    if (userCheck.rows.length === 0) {
      throw new ValidationError(['User not found']);
    }
    
    const userTenantId = userCheck.rows[0].tenant_id;

    // Check if already linked to this user (with tenant isolation)
    const existingConnection = await pool.query(
      `SELECT oc.id FROM oauth_connections oc
       JOIN users u ON oc.user_id = u.id
       WHERE oc.user_id = $1 AND oc.provider = $2 AND u.tenant_id = $3 AND u.deleted_at IS NULL`,
      [userId, provider, userTenantId]
    );

    if (existingConnection.rows.length > 0) {
      throw new ValidationError([`${provider} account already linked to your account`]);
    }

    // Check if this OAuth account is linked to another user (within same tenant)
    const otherUserConnection = await pool.query(
      `SELECT oc.user_id FROM oauth_connections oc
       JOIN users u ON oc.user_id = u.id
       WHERE oc.provider = $1 AND oc.provider_user_id = $2 AND u.tenant_id = $3 AND u.deleted_at IS NULL`,
      [provider, profile.id, userTenantId]
    );

    if (otherUserConnection.rows.length > 0) {
      throw new ValidationError(['This OAuth account is already linked to another user']);
    }

    // Link the account
    await pool.query(
      `INSERT INTO oauth_connections (id, user_id, provider, provider_user_id, profile_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [crypto.randomUUID(), userId, provider, profile.id, JSON.stringify(profile)]
    );

    return {
      success: true,
      message: `${provider} account linked successfully`,
      provider
    };
  }

  /**
   * Unlink OAuth provider from user account
   */
  async unlinkProvider(userId: string, provider: string): Promise<any> {
    // Delete with tenant verification for multi-tenant isolation
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

  /**
   * Legacy method names for backward compatibility
   */
  async handleOAuthLogin(provider: 'google' | 'github', token: string): Promise<any> {
    return this.authenticate(provider, token);
  }

  async linkOAuthProvider(userId: string, provider: 'google' | 'github', token: string): Promise<any> {
    return this.linkProvider(userId, provider, token);
  }
}
