/**
 * Internal Routes - compliance-service
 *
 * For service-to-service communication only.
 * These endpoints provide GDPR/compliance data to other services
 * (api-gateway, auth-service, payment-service, etc.)
 *
 * Phase B HMAC Standardization - Routes now use shared middleware
 *
 * Spec-required endpoints (STANDARDIZATION_DECISIONS.md):
 * - POST /internal/ofac/screen - OFAC screening for payment-service
 * - POST /internal/gdpr/export - Centralized GDPR export for auth-service
 * - POST /internal/gdpr/delete - Centralized GDPR deletion for auth-service
 *
 * User-centric endpoints (additional):
 * - GET /internal/users/:userId/data-export - Get user's compliance data (GDPR)
 * - POST /internal/users/:userId/delete - Delete user's compliance data (GDPR right to erasure)
 * - GET /internal/users/:userId/consent - Get user's consent records
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { internalAuthMiddlewareFastify } from '../middleware/internal-auth-fastify.middleware';

const log = logger.child({ component: 'InternalRoutes' });

// OFAC screening result types
type OfacScreeningResult = 'CLEAR' | 'MATCH' | 'POTENTIAL_MATCH' | 'ERROR';

interface OfacScreenRequest {
  userId: string;
  transactionData?: {
    amount?: number;
    currency?: string;
    counterpartyName?: string;
    counterpartyCountry?: string;
    transactionType?: string;
  };
  fullName?: string;
  dateOfBirth?: string;
  country?: string;
}

interface OfacScreenResponse {
  passed: boolean;
  result: OfacScreeningResult;
  screeningId: string;
  reason?: string;
  matchDetails?: {
    matchScore: number;
    matchedName?: string;
    listType?: string;
  };
  screenedAt: string;
}

/**
 * Perform OFAC screening against sanctions lists
 * In production, this would call an external OFAC screening service
 */
async function performOfacScreening(
  userId: string,
  data: OfacScreenRequest
): Promise<{ result: OfacScreeningResult; matchScore: number; matchDetails?: any }> {
  // TODO: In production, integrate with real OFAC screening provider
  // (e.g., Dow Jones, LexisNexis, ComplyAdvantage)

  // For now, return CLEAR for all screenings
  // This is a placeholder - real implementation would check against SDN list
  return {
    result: 'CLEAR',
    matchScore: 0,
    matchDetails: null,
  };
}

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply standardized HMAC authentication to all routes
  fastify.addHook('preHandler', internalAuthMiddlewareFastify);

  // =========================================================================
  // SPEC-REQUIRED ENDPOINTS (STANDARDIZATION_DECISIONS.md)
  // =========================================================================

  /**
   * POST /internal/ofac/screen
   * Perform OFAC screening for a user/transaction
   * Used by: payment-service (before processing payments)
   *
   * Required by spec: Decision #2 - compliance-service endpoints
   */
  fastify.post<{ Body: OfacScreenRequest }>('/ofac/screen', async (request, reply) => {
    const { userId, transactionData, fullName, dateOfBirth, country } = request.body;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'userId is required',
      });
    }

    try {
      // Perform the OFAC screening
      const screeningResult = await performOfacScreening(userId, request.body);

      // Generate a screening ID
      const screeningId = `ofac_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const screenedAt = new Date();

      // Record the screening in the database
      await db('ofac_screenings').insert({
        id: screeningId,
        user_id: userId,
        screening_type: 'transaction',
        status: screeningResult.result === 'CLEAR' ? 'completed' : 'flagged',
        result: screeningResult.result,
        match_score: screeningResult.matchScore,
        match_details: screeningResult.matchDetails ? JSON.stringify(screeningResult.matchDetails) : null,
        transaction_data: transactionData ? JSON.stringify(transactionData) : null,
        screened_at: screenedAt,
        created_at: screenedAt,
      });

      const passed = screeningResult.result === 'CLEAR';
      let reason: string | undefined;

      if (!passed) {
        switch (screeningResult.result) {
          case 'MATCH':
            reason = 'OFAC sanctions list match detected';
            break;
          case 'POTENTIAL_MATCH':
            reason = 'Potential OFAC sanctions list match requires manual review';
            break;
          case 'ERROR':
            reason = 'OFAC screening service error';
            break;
        }
      }

      log.info({
        screeningId,
        userId,
        result: screeningResult.result,
        passed,
        callingService,
        traceId,
      }, 'OFAC screening completed');

      const response: OfacScreenResponse = {
        passed,
        result: screeningResult.result,
        screeningId,
        screenedAt: screenedAt.toISOString(),
      };

      if (reason) {
        response.reason = reason;
      }

      if (screeningResult.matchDetails) {
        response.matchDetails = {
          matchScore: screeningResult.matchScore,
          ...screeningResult.matchDetails,
        };
      }

      return reply.send(response);
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'OFAC screening failed');
      return reply.status(500).send({
        passed: false,
        result: 'ERROR',
        reason: 'Internal screening error',
        screeningId: '',
        screenedAt: new Date().toISOString(),
      });
    }
  });

  /**
   * POST /internal/gdpr/export
   * Centralized GDPR data export endpoint
   * Used by: auth-service (when user requests data export)
   *
   * Required by spec: Decision #2 - compliance-service endpoints
   * This is a wrapper around the user-centric endpoint for spec compliance
   */
  fastify.post<{
    Body: { userId: string; includeDeleted?: boolean };
  }>('/gdpr/export', async (request, reply) => {
    const { userId, includeDeleted = false } = request.body;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'userId is required',
      });
    }

    try {
      const deletedFilter = includeDeleted ? '1=1' : 'deleted_at IS NULL';

      // Get OFAC screening records
      const ofacScreenings = await db('ofac_screenings')
        .where('user_id', userId)
        .whereRaw(deletedFilter)
        .select('id', 'user_id', 'screening_type', 'status', 'result', 'screened_at', 'created_at')
        .orderBy('created_at', 'desc');

      // Get risk assessments
      const riskAssessments = await db('risk_assessments')
        .where('user_id', userId)
        .whereRaw(deletedFilter)
        .select('id', 'user_id', 'risk_level', 'risk_score', 'factors', 'assessed_at', 'created_at')
        .orderBy('created_at', 'desc');

      // Get consent records
      const consents = await db('user_consents')
        .where('user_id', userId)
        .whereRaw(deletedFilter)
        .select('id', 'user_id', 'consent_type', 'granted', 'granted_at', 'revoked_at', 'ip_address', 'created_at')
        .orderBy('created_at', 'desc');

      // Get KYC verification records
      const kycVerifications = await db('kyc_verifications')
        .where('user_id', userId)
        .whereRaw(deletedFilter)
        .select('id', 'user_id', 'verification_type', 'status', 'provider', 'verified_at', 'created_at')
        .orderBy('created_at', 'desc');

      // Get audit trail
      const auditTrail = await db('compliance_audit_log')
        .where('user_id', userId)
        .whereRaw(deletedFilter)
        .select('id', 'user_id', 'action', 'resource_type', 'resource_id', 'details', 'ip_address', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(1000);

      log.info({
        userId,
        ofacCount: ofacScreenings.length,
        riskCount: riskAssessments.length,
        consentCount: consents.length,
        kycCount: kycVerifications.length,
        auditCount: auditTrail.length,
        callingService,
        traceId,
      }, 'GDPR export completed (spec endpoint)');

      return reply.send({
        success: true,
        userId,
        exportedAt: new Date().toISOString(),
        data: {
          ofacScreenings: ofacScreenings.map(s => ({
            id: s.id,
            screeningType: s.screening_type,
            status: s.status,
            result: s.result,
            screenedAt: s.screened_at,
            createdAt: s.created_at,
          })),
          riskAssessments: riskAssessments.map(r => ({
            id: r.id,
            riskLevel: r.risk_level,
            riskScore: r.risk_score,
            factors: r.factors,
            assessedAt: r.assessed_at,
            createdAt: r.created_at,
          })),
          consents: consents.map(c => ({
            id: c.id,
            consentType: c.consent_type,
            granted: c.granted,
            grantedAt: c.granted_at,
            revokedAt: c.revoked_at,
            createdAt: c.created_at,
          })),
          kycVerifications: kycVerifications.map(k => ({
            id: k.id,
            verificationType: k.verification_type,
            status: k.status,
            provider: k.provider,
            verifiedAt: k.verified_at,
            createdAt: k.created_at,
          })),
          auditTrail: auditTrail.map(a => ({
            id: a.id,
            action: a.action,
            resourceType: a.resource_type,
            resourceId: a.resource_id,
            createdAt: a.created_at,
          })),
        },
        summary: {
          totalOfacScreenings: ofacScreenings.length,
          totalRiskAssessments: riskAssessments.length,
          totalConsents: consents.length,
          totalKycVerifications: kycVerifications.length,
          totalAuditEntries: auditTrail.length,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'GDPR export failed');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /internal/gdpr/delete
   * Centralized GDPR data deletion endpoint
   * Used by: auth-service (when user requests account deletion)
   *
   * Required by spec: Decision #2 - compliance-service endpoints
   * This is a wrapper around the user-centric endpoint for spec compliance
   */
  fastify.post<{
    Body: { userId: string; reason?: string; retainForLegal?: boolean };
  }>('/gdpr/delete', async (request, reply) => {
    const { userId, reason = 'GDPR right to erasure', retainForLegal = true } = request.body;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'userId is required',
      });
    }

    try {
      const deletedAt = new Date();
      const deletionResults: Record<string, number> = {};

      if (retainForLegal) {
        // Soft delete: mark as deleted but retain for legal compliance periods
        const ofacResult = await db('ofac_screenings')
          .where('user_id', userId)
          .whereNull('deleted_at')
          .update({ deleted_at: deletedAt, deletion_reason: reason });
        deletionResults.ofacScreenings = ofacResult;

        const riskResult = await db('risk_assessments')
          .where('user_id', userId)
          .whereNull('deleted_at')
          .update({ deleted_at: deletedAt, deletion_reason: reason });
        deletionResults.riskAssessments = riskResult;

        const kycResult = await db('kyc_verifications')
          .where('user_id', userId)
          .whereNull('deleted_at')
          .update({ deleted_at: deletedAt, deletion_reason: reason });
        deletionResults.kycVerifications = kycResult;

        const consentResult = await db('user_consents')
          .where('user_id', userId)
          .delete();
        deletionResults.consents = consentResult;

        const auditResult = await db('compliance_audit_log')
          .where('user_id', userId)
          .update({
            user_id: `DELETED_${userId.substring(0, 8)}`,
            ip_address: null,
            details: db.raw("details || '{\"anonymized\": true}'::jsonb"),
          });
        deletionResults.auditTrail = auditResult;
      } else {
        // Hard delete all data
        const ofacResult = await db('ofac_screenings').where('user_id', userId).delete();
        deletionResults.ofacScreenings = ofacResult;

        const riskResult = await db('risk_assessments').where('user_id', userId).delete();
        deletionResults.riskAssessments = riskResult;

        const kycResult = await db('kyc_verifications').where('user_id', userId).delete();
        deletionResults.kycVerifications = kycResult;

        const consentResult = await db('user_consents').where('user_id', userId).delete();
        deletionResults.consents = consentResult;

        const auditResult = await db('compliance_audit_log').where('user_id', userId).delete();
        deletionResults.auditTrail = auditResult;
      }

      // Log the deletion action
      await db('compliance_audit_log').insert({
        user_id: retainForLegal ? `DELETED_${userId.substring(0, 8)}` : 'SYSTEM',
        action: 'USER_DATA_DELETION',
        resource_type: 'user',
        resource_id: userId,
        details: JSON.stringify({
          reason,
          retainForLegal,
          callingService,
          deletionResults,
          endpoint: '/gdpr/delete',
        }),
        created_at: deletedAt,
      });

      log.info({
        userId,
        reason,
        retainForLegal,
        deletionResults,
        callingService,
        traceId,
      }, 'GDPR deletion completed (spec endpoint)');

      return reply.send({
        success: true,
        userId,
        deletedAt: deletedAt.toISOString(),
        retainedForLegal: retainForLegal,
        deletionResults,
        message: retainForLegal
          ? 'Data soft-deleted and anonymized (retained for legal compliance)'
          : 'Data permanently deleted',
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'GDPR deletion failed');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  // =========================================================================
  // USER-CENTRIC ENDPOINTS (Additional utility endpoints)
  // =========================================================================

  /**
   * GET /internal/users/:userId/data-export
   * Get user's compliance data for GDPR data export
   * Used by: api-gateway (for GDPR data portability requests)
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { includeDeleted?: boolean };
  }>('/users/:userId/data-export', async (request, reply) => {
    const { userId } = request.params;
    const { includeDeleted = false } = request.query;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      const deletedFilter = includeDeleted ? '' : ' AND deleted_at IS NULL';

      // Get OFAC screening records
      const ofacScreenings = await db('ofac_screenings')
        .where('user_id', userId)
        .whereRaw(includeDeleted ? '1=1' : 'deleted_at IS NULL')
        .select('id', 'user_id', 'screening_type', 'status', 'result', 'screened_at', 'created_at')
        .orderBy('created_at', 'desc');

      // Get risk assessments
      const riskAssessments = await db('risk_assessments')
        .where('user_id', userId)
        .whereRaw(includeDeleted ? '1=1' : 'deleted_at IS NULL')
        .select('id', 'user_id', 'risk_level', 'risk_score', 'factors', 'assessed_at', 'created_at')
        .orderBy('created_at', 'desc');

      // Get consent records
      const consents = await db('user_consents')
        .where('user_id', userId)
        .whereRaw(includeDeleted ? '1=1' : 'deleted_at IS NULL')
        .select('id', 'user_id', 'consent_type', 'granted', 'granted_at', 'revoked_at', 'ip_address', 'created_at')
        .orderBy('created_at', 'desc');

      // Get KYC verification records
      const kycVerifications = await db('kyc_verifications')
        .where('user_id', userId)
        .whereRaw(includeDeleted ? '1=1' : 'deleted_at IS NULL')
        .select('id', 'user_id', 'verification_type', 'status', 'provider', 'verified_at', 'created_at')
        .orderBy('created_at', 'desc');

      // Get audit trail
      const auditTrail = await db('compliance_audit_log')
        .where('user_id', userId)
        .whereRaw(includeDeleted ? '1=1' : 'deleted_at IS NULL')
        .select('id', 'user_id', 'action', 'resource_type', 'resource_id', 'details', 'ip_address', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(1000);

      log.info({
        userId,
        ofacCount: ofacScreenings.length,
        riskCount: riskAssessments.length,
        consentCount: consents.length,
        kycCount: kycVerifications.length,
        auditCount: auditTrail.length,
        callingService,
        traceId,
      }, 'Internal user data export (GDPR)');

      return reply.send({
        userId,
        exportedAt: new Date().toISOString(),
        data: {
          ofacScreenings: ofacScreenings.map(s => ({
            id: s.id,
            screeningType: s.screening_type,
            status: s.status,
            result: s.result,
            screenedAt: s.screened_at,
            createdAt: s.created_at,
          })),
          riskAssessments: riskAssessments.map(r => ({
            id: r.id,
            riskLevel: r.risk_level,
            riskScore: r.risk_score,
            factors: r.factors,
            assessedAt: r.assessed_at,
            createdAt: r.created_at,
          })),
          consents: consents.map(c => ({
            id: c.id,
            consentType: c.consent_type,
            granted: c.granted,
            grantedAt: c.granted_at,
            revokedAt: c.revoked_at,
            createdAt: c.created_at,
          })),
          kycVerifications: kycVerifications.map(k => ({
            id: k.id,
            verificationType: k.verification_type,
            status: k.status,
            provider: k.provider,
            verifiedAt: k.verified_at,
            createdAt: k.created_at,
          })),
          auditTrail: auditTrail.map(a => ({
            id: a.id,
            action: a.action,
            resourceType: a.resource_type,
            resourceId: a.resource_id,
            createdAt: a.created_at,
          })),
        },
        summary: {
          totalOfacScreenings: ofacScreenings.length,
          totalRiskAssessments: riskAssessments.length,
          totalConsents: consents.length,
          totalKycVerifications: kycVerifications.length,
          totalAuditEntries: auditTrail.length,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'Failed to export user data');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * POST /internal/users/:userId/delete
   * Delete user's compliance data (GDPR right to erasure)
   * Used by: auth-service (when user requests account deletion)
   *
   * Note: Some data may be retained for legal/regulatory requirements
   */
  fastify.post<{
    Params: { userId: string };
    Body: { reason?: string; retainForLegal?: boolean };
  }>('/users/:userId/delete', async (request, reply) => {
    const { userId } = request.params;
    const { reason = 'GDPR right to erasure', retainForLegal = true } = request.body || {};
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      const deletedAt = new Date();
      const deletionResults: Record<string, number> = {};

      // If retainForLegal is true, we soft-delete and anonymize
      // If false, we hard-delete (for non-regulated data)
      if (retainForLegal) {
        // Soft delete: mark as deleted but retain for legal compliance periods
        // GDPR allows retention for legal obligations

        // Soft delete OFAC screenings (retain for AML compliance - typically 5-7 years)
        const ofacResult = await db('ofac_screenings')
          .where('user_id', userId)
          .whereNull('deleted_at')
          .update({ deleted_at: deletedAt, deletion_reason: reason });
        deletionResults.ofacScreenings = ofacResult;

        // Soft delete risk assessments
        const riskResult = await db('risk_assessments')
          .where('user_id', userId)
          .whereNull('deleted_at')
          .update({ deleted_at: deletedAt, deletion_reason: reason });
        deletionResults.riskAssessments = riskResult;

        // Soft delete KYC verifications (retain for AML compliance)
        const kycResult = await db('kyc_verifications')
          .where('user_id', userId)
          .whereNull('deleted_at')
          .update({ deleted_at: deletedAt, deletion_reason: reason });
        deletionResults.kycVerifications = kycResult;

        // Hard delete consent records (these can be fully removed)
        const consentResult = await db('user_consents')
          .where('user_id', userId)
          .delete();
        deletionResults.consents = consentResult;

        // Anonymize audit trail (keep for compliance but remove PII)
        const auditResult = await db('compliance_audit_log')
          .where('user_id', userId)
          .update({
            user_id: `DELETED_${userId.substring(0, 8)}`,
            ip_address: null,
            details: db.raw("details || '{\"anonymized\": true}'::jsonb"),
          });
        deletionResults.auditTrail = auditResult;

      } else {
        // Hard delete all data (use with caution - may violate retention requirements)
        const ofacResult = await db('ofac_screenings').where('user_id', userId).delete();
        deletionResults.ofacScreenings = ofacResult;

        const riskResult = await db('risk_assessments').where('user_id', userId).delete();
        deletionResults.riskAssessments = riskResult;

        const kycResult = await db('kyc_verifications').where('user_id', userId).delete();
        deletionResults.kycVerifications = kycResult;

        const consentResult = await db('user_consents').where('user_id', userId).delete();
        deletionResults.consents = consentResult;

        const auditResult = await db('compliance_audit_log').where('user_id', userId).delete();
        deletionResults.auditTrail = auditResult;
      }

      // Log the deletion action
      await db('compliance_audit_log').insert({
        user_id: retainForLegal ? `DELETED_${userId.substring(0, 8)}` : 'SYSTEM',
        action: 'USER_DATA_DELETION',
        resource_type: 'user',
        resource_id: userId,
        details: JSON.stringify({
          reason,
          retainForLegal,
          callingService,
          deletionResults,
        }),
        created_at: deletedAt,
      });

      log.info({
        userId,
        reason,
        retainForLegal,
        deletionResults,
        callingService,
        traceId,
      }, 'User compliance data deleted (GDPR)');

      return reply.send({
        success: true,
        userId,
        deletedAt: deletedAt.toISOString(),
        retainedForLegal: retainForLegal,
        deletionResults,
        message: retainForLegal
          ? 'Data soft-deleted and anonymized (retained for legal compliance)'
          : 'Data permanently deleted',
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'Failed to delete user data');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/users/:userId/consent
   * Get user's consent records
   * Used by: api-gateway, notification-service (for checking marketing consent)
   */
  fastify.get<{ Params: { userId: string } }>('/users/:userId/consent', async (request, reply) => {
    const { userId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!userId) {
      return reply.status(400).send({ error: 'User ID required' });
    }

    try {
      // Get all active consent records for the user
      const consents = await db('user_consents')
        .where('user_id', userId)
        .whereNull('deleted_at')
        .select(
          'id',
          'user_id',
          'consent_type',
          'granted',
          'granted_at',
          'revoked_at',
          'version',
          'ip_address',
          'user_agent',
          'created_at',
          'updated_at'
        )
        .orderBy('consent_type');

      // Build a summary of current consent status by type
      const consentSummary: Record<string, boolean> = {};
      for (const consent of consents) {
        // A consent is active if granted and not revoked
        consentSummary[consent.consent_type] = consent.granted && !consent.revoked_at;
      }

      log.info({
        userId,
        consentCount: consents.length,
        activeConsents: Object.entries(consentSummary).filter(([_, v]) => v).length,
        callingService,
        traceId,
      }, 'Internal user consent lookup');

      return reply.send({
        userId,
        consents: consents.map(c => ({
          id: c.id,
          consentType: c.consent_type,
          granted: c.granted,
          active: c.granted && !c.revoked_at,
          grantedAt: c.granted_at,
          revokedAt: c.revoked_at,
          version: c.version,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
        summary: consentSummary,
        lastUpdated: consents.length > 0
          ? Math.max(...consents.map(c => new Date(c.updated_at || c.created_at).getTime()))
          : null,
      });
    } catch (error: any) {
      log.error({ error: error.message, userId, traceId }, 'Failed to get user consent');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}

export default internalRoutes;
