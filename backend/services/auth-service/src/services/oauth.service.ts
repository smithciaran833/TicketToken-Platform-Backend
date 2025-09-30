import { OAuth2Client } from 'google-auth-library';
import * as AppleAuth from 'apple-signin-auth';
import { db } from '../config/database';
import { JWTService } from './jwt.service';
import { AuthenticationError } from '../errors';
import crypto from 'crypto';
import { env } from '../config/env';

interface OAuthProfile {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  provider: 'google' | 'apple' | 'facebook';
  verified: boolean;
}

export class OAuthService {
  private googleClient: OAuth2Client;
  private jwtService: JWTService;

  constructor() {
    this.googleClient = new OAuth2Client(
      env.GOOGLE_CLIENT_ID || 'your-google-client-id',
      env.GOOGLE_CLIENT_SECRET,
      env.GOOGLE_REDIRECT_URI || 'http://auth-service:3001/api/v1/auth/oauth/google/callback'
    );
    this.jwtService = new JWTService();
  }

  /**
   * Verify Google ID token and extract profile
   */
  async verifyGoogleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID || 'your-google-client-id'
      });
      
      const payload = ticket.getPayload();
      if (!payload) {
        throw new AuthenticationError('Invalid Google token');
      }

      return {
        id: payload.sub,
        email: payload.email!,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
        provider: 'google',
        verified: payload.email_verified || false
      };
    } catch (error) {
      throw new AuthenticationError('Google token verification failed');
    }
  }

  /**
   * Verify Apple ID token and extract profile
   */
  async verifyAppleToken(idToken: string): Promise<OAuthProfile> {
    try {
      const decodedToken = await AppleAuth.verifyIdToken(idToken, {
        audience: env.APPLE_CLIENT_ID || 'com.tickettoken.app',
        ignoreExpiration: false
      });

      return {
        id: decodedToken.sub,
        email: decodedToken.email || '',
        provider: 'apple',
        verified: decodedToken.email_verified === 'true'
      };
    } catch (error) {
      throw new AuthenticationError('Apple token verification failed');
    }
  }

  /**
   * Find or create user from OAuth profile
   */
  async findOrCreateUser(profile: OAuthProfile): Promise<any> {
    // Check if user exists with this email
    let user = await db('users')
      .where({ email: profile.email })
      .first();

    if (!user) {
      // Create new user
      const userId = crypto.randomUUID();
      
      await db('users').insert({
        id: userId,
        email: profile.email,
        first_name: profile.firstName || profile.email.split('@')[0],
        last_name: profile.lastName || '',
        email_verified: profile.verified,
        role: 'user',
        is_active: true,
        created_at: new Date(),
        // OAuth users don't have passwords
        password_hash: null
      });

      user = await db('users').where({ id: userId }).first();
    }

    // Store OAuth provider connection
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: user.id,
        provider: profile.provider
      })
      .first();

    if (!existingConnection) {
      await db('oauth_connections').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        provider: profile.provider,
        provider_user_id: profile.id,
        profile_data: JSON.stringify(profile),
        created_at: new Date()
      });
    } else {
      // Update profile data
      await db('oauth_connections')
        .where({ id: existingConnection.id })
        .update({
          profile_data: JSON.stringify(profile),
          updated_at: new Date()
        });
    }

    // Update last login
    await db('users')
      .where({ id: user.id })
      .update({ last_login_at: new Date() });

    return user;
  }

  /**
   * Handle OAuth login/signup
   */
  async handleOAuthLogin(provider: 'google' | 'apple', token: string): Promise<any> {
    let profile: OAuthProfile;

    // Verify token based on provider
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Find or create user
    const user = await this.findOrCreateUser(profile);

    // Generate JWT tokens
    const tokens = await this.jwtService.generateTokenPair(user);

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        emailVerified: user.email_verified
      },
      tokens,
      provider
    };
  }

  /**
   * Link OAuth provider to existing account
   */
  async linkOAuthProvider(
    userId: string,
    provider: 'google' | 'apple',
    token: string
  ): Promise<any> {
    let profile: OAuthProfile;

    // Verify token
    if (provider === 'google') {
      profile = await this.verifyGoogleToken(token);
    } else if (provider === 'apple') {
      profile = await this.verifyAppleToken(token);
    } else {
      throw new AuthenticationError('Unsupported OAuth provider');
    }

    // Check if already linked
    const existingConnection = await db('oauth_connections')
      .where({
        user_id: userId,
        provider: provider
      })
      .first();

    if (existingConnection) {
      throw new AuthenticationError(`${provider} account already linked`);
    }

    // Check if this OAuth account is linked to another user
    const otherUserConnection = await db('oauth_connections')
      .where({
        provider: provider,
        provider_user_id: profile.id
      })
      .first();

    if (otherUserConnection) {
      throw new AuthenticationError('This OAuth account is already linked to another user');
    }

    // Link the account
    await db('oauth_connections').insert({
      id: crypto.randomUUID(),
      user_id: userId,
      provider: provider,
      provider_user_id: profile.id,
      profile_data: JSON.stringify(profile),
      created_at: new Date()
    });

    return {
      success: true,
      message: `${provider} account linked successfully`,
      provider
    };
  }
}
