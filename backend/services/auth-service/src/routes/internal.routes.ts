/**
 * Internal Routes - For service-to-service communication only
 *
 * These endpoints are protected by S2S authentication and are not
 * accessible to end users.
 */

import { FastifyInstance } from 'fastify';
import { verifyServiceToken } from '../middleware/s2s.middleware';
import { pool } from '../config/database';
import { responseSchemas } from '../validators/response.schemas';

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply S2S authentication to all routes in this group
  fastify.addHook('preHandler', verifyServiceToken);

  /**
   * Validate user permissions for a specific action
   * Called by other services to check if a user can perform an action
   */
  fastify.post('/validate-permissions', {
    schema: { response: responseSchemas.validatePermissions },
  }, async (request, reply) => {
    const { userId, permissions, venueId } = request.body as {
      userId: string;
      permissions: string[];
      venueId?: string;
    };

    try {
      // Get user with permissions
      const userResult = await pool.query(
        `SELECT id, role, permissions, tenant_id
         FROM users
         WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        return reply.send({
          valid: false,
          reason: 'User not found',
        });
      }

      const user = userResult.rows[0];
      const userPermissions: string[] = user.permissions || [];

      // Check if user has all required permissions
      const hasPermissions = permissions.every(perm =>
        userPermissions.includes(perm) ||
        userPermissions.includes('*') ||
        user.role === 'admin' ||
        user.role === 'superadmin'
      );

      // If venue-specific, check venue roles
      let venueRole = null;
      if (venueId) {
        const venueRoleResult = await pool.query(
          `SELECT role FROM user_venue_roles
           WHERE user_id = $1 AND venue_id = $2 AND is_active = true
           AND (expires_at IS NULL OR expires_at > NOW())`,
          [userId, venueId]
        );

        if (venueRoleResult.rows.length > 0) {
          venueRole = venueRoleResult.rows[0].role;
        }
      }

      return reply.send({
        valid: hasPermissions,
        userId,
        role: user.role,
        venueRole,
        tenantId: user.tenant_id,
      });
    } catch (error: any) {
      request.log.error({ error, userId }, 'Failed to validate permissions');
      return reply.status(500).send({
        valid: false,
        reason: 'Internal error',
      });
    }
  });

  /**
   * Bulk validate multiple users (for batch operations)
   */
  fastify.post('/validate-users', {
    schema: { response: responseSchemas.validateUsers },
  }, async (request, reply) => {
    const { userIds } = request.body as { userIds: string[] };

    if (!userIds || userIds.length === 0) {
      return reply.send({ users: [] });
    }

    if (userIds.length > 100) {
      return reply.status(400).send({
        error: 'Maximum 100 users per request',
      });
    }

    try {
      const result = await pool.query(
        `SELECT id, email, role, tenant_id, email_verified, mfa_enabled
         FROM users
         WHERE id = ANY($1) AND deleted_at IS NULL`,
        [userIds]
      );

      return reply.send({
        users: result.rows,
        found: result.rows.length,
        requested: userIds.length,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to validate users');
      return reply.status(500).send({
        error: 'Internal error',
      });
    }
  });

  /**
   * Get user's tenant context (for multi-tenant operations)
   */
  fastify.get('/user-tenant/:userId', {
    schema: { response: responseSchemas.userTenant },
  }, async (request, reply) => {
    const { userId } = request.params as { userId: string };

    try {
      const result = await pool.query(
        `SELECT u.id, u.tenant_id, t.name as tenant_name, t.slug as tenant_slug
         FROM users u
         JOIN tenants t ON u.tenant_id = t.id
         WHERE u.id = $1 AND u.deleted_at IS NULL`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          error: 'User not found',
        });
      }

      return reply.send(result.rows[0]);
    } catch (error: any) {
      request.log.error({ error, userId }, 'Failed to get user tenant');
      return reply.status(500).send({
        error: 'Internal error',
      });
    }
  });

  /**
   * Health check for service mesh
   */
  fastify.get('/health', {
    schema: { response: responseSchemas.internalHealth },
  }, async (request, reply) => {
    return reply.send({
      status: 'healthy',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
    });
  });

  // ============================================================================
  // PHASE 3 NEW ENDPOINTS - Internal APIs for service-to-service communication
  // ============================================================================

  /**
   * GET /users/:userId
   * Get user details by ID
   * Used by: payment-service, compliance-service
   */
  fastify.get('/users/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const tenantId = request.headers['x-tenant-id'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      // Query user with optional tenant filter
      let query = `
        SELECT 
          id, email, name, first_name, last_name,
          tenant_id, role, status, email_verified, mfa_enabled,
          billing_address, phone, avatar_url,
          created_at, updated_at, last_login_at
        FROM users
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const params: any[] = [userId];

      // If tenant ID provided, enforce tenant isolation
      if (tenantId) {
        query += ` AND tenant_id = $2`;
        params.push(tenantId);
      }

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const user = result.rows[0];

      request.log.info({
        userId,
        requestingService: (request as any).service?.name,
      }, 'Internal user lookup');

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          firstName: user.first_name,
          lastName: user.last_name,
          tenantId: user.tenant_id,
          role: user.role,
          status: user.status,
          emailVerified: user.email_verified,
          mfaEnabled: user.mfa_enabled,
          billingAddress: user.billing_address,
          phone: user.phone,
          avatarUrl: user.avatar_url,
          createdAt: user.created_at,
          lastLoginAt: user.last_login_at,
        },
      });
    } catch (error: any) {
      request.log.error({ error, userId }, 'Failed to get user');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /users/by-email/:email
   * Get user by email address (URL encoded)
   * Used by: transfer-service (to find recipient for ticket transfer)
   */
  fastify.get('/users/by-email/:email', async (request, reply) => {
    const { email } = request.params as { email: string };
    const tenantId = request.headers['x-tenant-id'] as string;

    if (!email) {
      return reply.status(400).send({ error: 'Email required' });
    }

    // Decode URL-encoded email
    const decodedEmail = decodeURIComponent(email).toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(decodedEmail)) {
      return reply.status(400).send({ error: 'Invalid email format' });
    }

    try {
      let query = `
        SELECT 
          id, email, name, first_name, last_name,
          tenant_id, role, status, email_verified
        FROM users
        WHERE LOWER(email) = $1 AND deleted_at IS NULL
      `;
      const params: any[] = [decodedEmail];

      // If tenant ID provided, enforce tenant isolation
      if (tenantId) {
        query += ` AND tenant_id = $2`;
        params.push(tenantId);
      }

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        // Return null user instead of 404 to differentiate "not found" from error
        return reply.send({ user: null, found: false });
      }

      const user = result.rows[0];

      request.log.info({
        emailHash: decodedEmail.substring(0, 3) + '***', // Mask email in logs
        found: true,
        requestingService: (request as any).service?.name,
      }, 'Internal user email lookup');

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          tenantId: user.tenant_id,
          role: user.role,
          status: user.status,
          emailVerified: user.email_verified,
        },
        found: true,
      });
    } catch (error: any) {
      request.log.error({ error }, 'Failed to get user by email');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /users/admins
   * Get admin users by tenant and role
   * Used by: compliance-service (for compliance notifications)
   * Query params: tenantId (required), roles (comma-separated, optional)
   */
  fastify.get('/users/admins', async (request, reply) => {
    const { tenantId, roles } = request.query as { tenantId?: string; roles?: string };
    const headerTenantId = request.headers['x-tenant-id'] as string;

    // Use query param or header for tenant ID
    const effectiveTenantId = tenantId || headerTenantId;

    if (!effectiveTenantId) {
      return reply.status(400).send({ error: 'tenantId required (query param or X-Tenant-ID header)' });
    }

    try {
      // Parse roles or use defaults
      const roleList = roles 
        ? roles.split(',').map(r => r.trim().toLowerCase())
        : ['admin', 'superadmin', 'compliance_admin', 'venue_admin'];

      // Validate roles to prevent injection
      const allowedRoles = ['admin', 'superadmin', 'compliance_admin', 'venue_admin', 'support', 'manager'];
      const validRoles = roleList.filter(r => allowedRoles.includes(r));

      if (validRoles.length === 0) {
        return reply.status(400).send({ error: 'No valid roles specified' });
      }

      const query = `
        SELECT 
          id, email, name, first_name, last_name,
          role, status, email_verified, last_login_at
        FROM users
        WHERE tenant_id = $1 
          AND role = ANY($2)
          AND status = 'active'
          AND deleted_at IS NULL
        ORDER BY role, name
        LIMIT 100
      `;

      const result = await pool.query(query, [effectiveTenantId, validRoles]);

      request.log.info({
        tenantId: effectiveTenantId,
        roles: validRoles,
        count: result.rows.length,
        requestingService: (request as any).service?.name,
      }, 'Internal admin users lookup');

      return reply.send({
        users: result.rows.map(user => ({
          id: user.id,
          email: user.email,
          name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          role: user.role,
          status: user.status,
          emailVerified: user.email_verified,
          lastLoginAt: user.last_login_at,
        })),
        count: result.rows.length,
        tenantId: effectiveTenantId,
        rolesQueried: validRoles,
      });
    } catch (error: any) {
      request.log.error({ error, tenantId: effectiveTenantId }, 'Failed to get admin users');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // ============================================================================
  // PHASE 5a NEW ENDPOINTS - Additional internal APIs for bypass refactoring
  // ============================================================================

  /**
   * GET /users/:userId/tax-info
   * Get user's tax information for 1099-DA generation
   * Used by: payment-service (form-1099-da.service)
   */
  fastify.get('/users/:userId/tax-info', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      // Query user with tax information
      let query = `
        SELECT 
          u.id, u.email, u.name, u.first_name, u.last_name,
          u.tenant_id, u.billing_address, u.phone,
          uti.tax_id_type, uti.tax_id_last_four, uti.tax_id_verified,
          uti.tin_match_status, uti.w9_submitted_at, uti.tax_year,
          uti.tax_classification, uti.legal_name, uti.business_name,
          uti.address as tax_address, uti.city as tax_city, 
          uti.state as tax_state, uti.postal_code as tax_postal_code,
          uti.country as tax_country
        FROM users u
        LEFT JOIN user_tax_info uti ON u.id = uti.user_id
        WHERE u.id = $1 AND u.deleted_at IS NULL
      `;
      const params: any[] = [userId];

      if (tenantId) {
        query += ` AND u.tenant_id = $2`;
        params.push(tenantId);
      }

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const user = result.rows[0];

      request.log.info({
        userId,
        hasTaxInfo: !!user.tax_id_type,
        requestingService: (request as any).service?.name,
        traceId,
      }, 'Internal user tax info lookup');

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name || `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          firstName: user.first_name,
          lastName: user.last_name,
          tenantId: user.tenant_id,
          billingAddress: user.billing_address,
          phone: user.phone,
        },
        taxInfo: user.tax_id_type ? {
          taxIdType: user.tax_id_type,
          taxIdLastFour: user.tax_id_last_four,
          taxIdVerified: user.tax_id_verified,
          tinMatchStatus: user.tin_match_status,
          w9SubmittedAt: user.w9_submitted_at,
          taxYear: user.tax_year,
          taxClassification: user.tax_classification,
          legalName: user.legal_name,
          businessName: user.business_name,
          address: user.tax_address,
          city: user.tax_city,
          state: user.tax_state,
          postalCode: user.tax_postal_code,
          country: user.tax_country,
        } : null,
        hasTaxInfo: !!user.tax_id_type,
      });
    } catch (error: any) {
      request.log.error({ error, userId, traceId }, 'Failed to get user tax info');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /users/:userId/chargeback-count
   * Get user's chargeback count and history summary
   * Used by: payment-service (chargeback-reserve.service)
   */
  fastify.get('/users/:userId/chargeback-count', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;
    const { monthsBack } = request.query as { monthsBack?: string };

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      // First verify user exists
      let userQuery = `
        SELECT id, tenant_id, email, status, created_at
        FROM users
        WHERE id = $1 AND deleted_at IS NULL
      `;
      const userParams: any[] = [userId];

      if (tenantId) {
        userQuery += ` AND tenant_id = $2`;
        userParams.push(tenantId);
      }

      const userResult = await pool.query(userQuery, userParams);

      if (userResult.rows.length === 0) {
        return reply.status(404).send({ error: 'User not found' });
      }

      const user = userResult.rows[0];

      // Get chargeback counts
      // Note: payment_chargebacks table is owned by payment-service, but 
      // if we have a user_chargebacks summary table in auth-service, use that
      // Otherwise, return 0 and let payment-service handle its own data
      
      // Check if user has a chargeback summary in a local table
      const months = parseInt(monthsBack || '12');
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - months);

      // Try to get chargeback data from user_chargeback_summary if it exists
      let chargebackData = {
        totalChargebacks: 0,
        chargebacksInPeriod: 0,
        totalChargebackAmountCents: 0,
        lastChargebackAt: null as string | null,
        chargebackRate: 0,
      };

      try {
        const chargebackQuery = `
          SELECT 
            COUNT(*) as total_chargebacks,
            SUM(CASE WHEN created_at > $2 THEN 1 ELSE 0 END) as chargebacks_in_period,
            SUM(amount_cents) as total_amount_cents,
            MAX(created_at) as last_chargeback_at
          FROM user_chargeback_summary
          WHERE user_id = $1
        `;
        const chargebackResult = await pool.query(chargebackQuery, [userId, cutoffDate.toISOString()]);
        
        if (chargebackResult.rows.length > 0 && chargebackResult.rows[0].total_chargebacks) {
          const row = chargebackResult.rows[0];
          chargebackData = {
            totalChargebacks: parseInt(row.total_chargebacks || '0'),
            chargebacksInPeriod: parseInt(row.chargebacks_in_period || '0'),
            totalChargebackAmountCents: parseInt(row.total_amount_cents || '0'),
            lastChargebackAt: row.last_chargeback_at,
            chargebackRate: 0, // Would need transaction count to calculate
          };
        }
      } catch (e) {
        // Table may not exist, return default values
        request.log.debug({ userId }, 'user_chargeback_summary table not available');
      }

      request.log.info({
        userId,
        totalChargebacks: chargebackData.totalChargebacks,
        requestingService: (request as any).service?.name,
        traceId,
      }, 'Internal user chargeback count lookup');

      return reply.send({
        userId: user.id,
        tenantId: user.tenant_id,
        userStatus: user.status,
        accountAge: Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)), // days
        chargebackData,
        periodMonths: months,
      });
    } catch (error: any) {
      request.log.error({ error, userId, traceId }, 'Failed to get user chargeback count');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /users/batch-verification-check
   * Check identity verification status for multiple users
   * Used by: transfer-service (transfer-rules.service)
   */
  fastify.post('/users/batch-verification-check', async (request, reply) => {
    const { userIds } = request.body as { userIds: string[] };
    const tenantId = request.headers['x-tenant-id'] as string;
    const traceId = request.headers['x-trace-id'] as string;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return reply.status(400).send({ error: 'userIds array required' });
    }

    if (userIds.length > 100) {
      return reply.status(400).send({ error: 'Maximum 100 users per request' });
    }

    try {
      let query = `
        SELECT 
          id, email, identity_verified, email_verified,
          kyc_status, kyc_verified_at, mfa_enabled
        FROM users
        WHERE id = ANY($1) AND deleted_at IS NULL
      `;
      const params: any[] = [userIds];

      if (tenantId) {
        query += ` AND tenant_id = $2`;
        params.push(tenantId);
      }

      const result = await pool.query(query, params);

      // Create a map of userId -> verification status
      const verificationMap: Record<string, {
        userId: string;
        email: string;
        identityVerified: boolean;
        emailVerified: boolean;
        kycStatus: string | null;
        kycVerifiedAt: string | null;
        mfaEnabled: boolean;
      }> = {};

      for (const user of result.rows) {
        verificationMap[user.id] = {
          userId: user.id,
          email: user.email,
          identityVerified: user.identity_verified || false,
          emailVerified: user.email_verified || false,
          kycStatus: user.kyc_status,
          kycVerifiedAt: user.kyc_verified_at,
          mfaEnabled: user.mfa_enabled || false,
        };
      }

      // List which users were not found
      const notFoundUserIds = userIds.filter(uid => !verificationMap[uid]);

      // Calculate summary stats
      const verifiedCount = Object.values(verificationMap).filter(v => v.identityVerified).length;
      const unverifiedCount = Object.values(verificationMap).filter(v => !v.identityVerified).length;

      request.log.info({
        requested: userIds.length,
        found: result.rows.length,
        verified: verifiedCount,
        unverified: unverifiedCount,
        requestingService: (request as any).service?.name,
        traceId,
      }, 'Batch verification check');

      return reply.send({
        users: verificationMap,
        found: result.rows.length,
        notFoundUserIds,
        summary: {
          verified: verifiedCount,
          unverified: unverifiedCount,
          notFound: notFoundUserIds.length,
        },
      });
    } catch (error: any) {
      request.log.error({ error, traceId }, 'Failed to batch check verification');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
