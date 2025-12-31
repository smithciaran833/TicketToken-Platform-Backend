import { FastifyReply } from 'fastify';
import { ValidationError } from '../errors';
import { pool } from '../config/database';
import { AuthenticatedRequest } from '../types';
import { stripHtml } from '../utils/sanitize';
import { auditService } from '../services/audit.service';
import { cacheFallbackService } from '../services/cache-fallback.service';

export class ProfileController {
  async getProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id as string;

    try {
      const { data: profile, fromCache } = await cacheFallbackService.withFallback(
        'getProfile',
        // DB operation
        async () => {
          const result = await pool.query(
            `SELECT
              id,
              email,
              first_name,
              last_name,
              phone,
              email_verified,
              mfa_enabled,
              role,
              tenant_id,
              created_at,
              updated_at,
              last_login_at,
              password_changed_at
            FROM users
            WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
            [userId, tenantId]
          );

          if (result.rows.length === 0) {
            return null;
          }

          const user = result.rows[0];

          // Cache the result for future fallback
          await cacheFallbackService.cacheUserProfile(userId, tenantId, user);

          return user;
        },
        // Cache fallback operation
        async () => {
          return cacheFallbackService.getCachedUserProfile(userId, tenantId);
        },
        userId
      );

      if (!profile) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Add cache indicator header
      if (fromCache) {
        reply.header('X-Cache', 'fallback');
        reply.header('X-Cache-Age', cacheFallbackService.getCacheAge(profile.cached_at).toString());
      }

      return reply.send({
        success: true,
        user: profile
      });
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to get profile');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  async updateProfile(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id as string;
    const updates = request.body as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
    };

    try {
      const allowedUpdates: any = {};

      if (updates.firstName !== undefined) {
        allowedUpdates.first_name = stripHtml(updates.firstName);
      }
      if (updates.lastName !== undefined) {
        allowedUpdates.last_name = stripHtml(updates.lastName);
      }
      if (updates.phone !== undefined) {
        allowedUpdates.phone = updates.phone;
      }
      if (updates.email !== undefined) {
        allowedUpdates.email = updates.email.toLowerCase();
        allowedUpdates.email_verified = false;
      }

      if (Object.keys(allowedUpdates).length === 0) {
        throw new ValidationError(['No valid fields to update']);
      }

      const fields = Object.keys(allowedUpdates);
      const values = Object.values(allowedUpdates);
      const setClause = fields.map((field, i) => `${field} = $${i + 3}`).join(', ');

      await pool.query(
        `UPDATE users
         SET ${setClause}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2`,
        [userId, tenantId, ...values]
      );

      // Invalidate cache after update
      await cacheFallbackService.invalidateUserCache(userId, tenantId);

      await auditService.log({
        userId,
        tenantId,
        action: 'profile.updated',
        actionType: 'data_access',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
        metadata: { updated_fields: fields },
        status: 'success'
      });

      return this.getProfile(request, reply);
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to update profile');

      if (error instanceof ValidationError) {
        return reply.status(422).send({
          success: false,
          error: error.message,
          code: 'VALIDATION_ERROR'
        });
      }

      return reply.status(500).send({
        success: false,
        error: 'Failed to update profile',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  /**
   * GDPR Article 15 & 20: Export all user data
   * Returns machine-readable JSON format
   */
  async exportData(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id as string;

    try {
      // Fetch user profile
      const userResult = await pool.query(
        `SELECT
          id, email, username, display_name, first_name, last_name,
          phone, email_verified, phone_verified, country_code, city,
          state_province, postal_code, timezone, preferred_language,
          status, role, mfa_enabled, created_at, updated_at,
          last_login_at, terms_accepted_at, terms_version,
          privacy_accepted_at, privacy_version, marketing_consent,
          marketing_consent_date, preferences, notification_preferences,
          privacy_settings
        FROM users
        WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (userResult.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Fetch sessions
      const sessionsResult = await pool.query(
        `SELECT id, started_at, ended_at, ip_address, user_agent
         FROM user_sessions
         WHERE user_id = $1
         ORDER BY started_at DESC
         LIMIT 100`,
        [userId]
      );

      // Fetch wallet connections
      const walletsResult = await pool.query(
        `SELECT wallet_address, network, verified, created_at, last_login_at
         FROM wallet_connections
         WHERE user_id = $1`,
        [userId]
      );

      // Fetch OAuth connections
      const oauthResult = await pool.query(
        `SELECT provider, created_at, updated_at
         FROM oauth_connections
         WHERE user_id = $1`,
        [userId]
      );

      // Fetch venue roles
      const rolesResult = await pool.query(
        `SELECT venue_id, role, is_active, created_at, expires_at
         FROM user_venue_roles
         WHERE user_id = $1`,
        [userId]
      );

      // Fetch addresses
      const addressesResult = await pool.query(
        `SELECT address_type, address_line1, address_line2, city,
                state_province, postal_code, country_code, is_default, created_at
         FROM user_addresses
         WHERE user_id = $1`,
        [userId]
      );

      // Fetch recent audit logs (user's own actions)
      const auditResult = await pool.query(
        `SELECT action, resource_type, resource_id, ip_address, created_at, success
         FROM audit_logs
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 500`,
        [userId]
      );

      const exportData = {
        exportedAt: new Date().toISOString(),
        exportFormat: 'GDPR_ARTICLE_15_20',
        user: userResult.rows[0],
        sessions: sessionsResult.rows,
        walletConnections: walletsResult.rows,
        oauthConnections: oauthResult.rows,
        venueRoles: rolesResult.rows,
        addresses: addressesResult.rows,
        activityLog: auditResult.rows
      };

      // Audit the export
      await auditService.logDataExport(
        userId,
        'gdpr_full_export',
        request.ip,
        tenantId
      );

      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="user-data-export-${userId}.json"`)
        .send(exportData);
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to export user data');
      return reply.status(500).send({
        success: false,
        error: 'Failed to export data',
        code: 'EXPORT_FAILED'
      });
    }
  }

  /**
   * GDPR: Update consent preferences
   */
  async updateConsent(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id as string;
    const body = request.body as {
      marketingConsent?: boolean;
    };

    try {
      if (body.marketingConsent === undefined) {
        return reply.status(400).send({
          success: false,
          error: 'No consent preferences provided',
          code: 'MISSING_CONSENT_DATA'
        });
      }

      await pool.query(
        `UPDATE users
         SET marketing_consent = $3,
             marketing_consent_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId, body.marketingConsent]
      );

      // Invalidate cache after update
      await cacheFallbackService.invalidateUserCache(userId, tenantId);

      await auditService.log({
        userId,
        tenantId,
        action: body.marketingConsent ? 'consent.granted' : 'consent.withdrawn',
        actionType: 'data_access',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
        metadata: { marketing_consent: body.marketingConsent },
        status: 'success'
      });

      return reply.send({
        success: true,
        message: 'Consent preferences updated',
        consent: {
          marketingConsent: body.marketingConsent,
          updatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to update consent');
      return reply.status(500).send({
        success: false,
        error: 'Failed to update consent',
        code: 'CONSENT_UPDATE_FAILED'
      });
    }
  }

  /**
   * GDPR Article 17: Request account deletion (Right to Erasure)
   * Initiates soft delete and schedules data anonymization
   */
  async requestDeletion(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id as string;
    const body = request.body as {
      confirmEmail: string;
      reason?: string;
    };

    try {
      // Verify user owns this account
      const userResult = await pool.query(
        `SELECT email FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (userResult.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      // Require email confirmation to prevent accidental deletion
      if (userResult.rows[0].email.toLowerCase() !== body.confirmEmail?.toLowerCase()) {
        return reply.status(400).send({
          success: false,
          error: 'Email confirmation does not match',
          code: 'EMAIL_MISMATCH'
        });
      }

      // Begin deletion process - soft delete first
      await pool.query(
        `UPDATE users
         SET deleted_at = CURRENT_TIMESTAMP,
             status = 'DELETED',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND tenant_id = $2`,
        [userId, tenantId]
      );

      // Revoke all sessions
      await pool.query(
        `UPDATE user_sessions
         SET revoked_at = CURRENT_TIMESTAMP, ended_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );

      // Invalidate all caches
      await cacheFallbackService.invalidateUserCache(userId, tenantId);

      // Audit the deletion request
      await auditService.log({
        userId,
        tenantId,
        action: 'account.deletion_requested',
        actionType: 'data_access',
        resourceType: 'user',
        resourceId: userId,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
        metadata: {
          reason: body.reason || 'not provided',
          scheduledAnonymization: '30 days'
        },
        status: 'success'
      });

      return reply.send({
        success: true,
        message: 'Account deletion initiated',
        details: {
          deletedAt: new Date().toISOString(),
          anonymizationScheduled: '30 days',
          note: 'Your account has been deactivated. Data will be fully anonymized after 30 days. Contact support within this period if you wish to recover your account.'
        }
      });
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to process deletion request');
      return reply.status(500).send({
        success: false,
        error: 'Failed to process deletion request',
        code: 'DELETION_FAILED'
      });
    }
  }

  /**
   * Get current consent status
   */
  async getConsent(request: AuthenticatedRequest, reply: FastifyReply) {
    const userId = request.user.id;
    const tenantId = request.user.tenant_id as string;

    try {
      const result = await pool.query(
        `SELECT
          marketing_consent,
          marketing_consent_date,
          terms_accepted_at,
          terms_version,
          privacy_accepted_at,
          privacy_version
         FROM users
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [userId, tenantId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      const user = result.rows[0];
      return reply.send({
        success: true,
        consent: {
          marketing: {
            granted: user.marketing_consent || false,
            date: user.marketing_consent_date
          },
          terms: {
            acceptedAt: user.terms_accepted_at,
            version: user.terms_version
          },
          privacy: {
            acceptedAt: user.privacy_accepted_at,
            version: user.privacy_version
          }
        }
      });
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to get consent status');
      return reply.status(500).send({
        success: false,
        error: 'Failed to retrieve consent status',
        code: 'INTERNAL_ERROR'
      });
    }
  }
}
