import { FastifyPluginAsync } from 'fastify';
import { db } from '../config/database';
import * as crypto from 'crypto';

// SECURITY FIX (SC2/SM2): Remove hardcoded default secret
// Service will fail to start if INTERNAL_SERVICE_SECRET is not set
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

if (!INTERNAL_SECRET) {
  throw new Error('CRITICAL: INTERNAL_SERVICE_SECRET environment variable is required but not set');
}

const internalValidationRoutes: FastifyPluginAsync = async (fastify) => {
  // ISSUE #25 FIX: Add authentication hook for internal routes
  fastify.addHook('preHandler', async (request, reply) => {
    const serviceName = request.headers['x-internal-service'] as string;
    const timestamp = request.headers['x-internal-timestamp'] as string;
    const signature = request.headers['x-internal-signature'] as string;

    if (!serviceName || !timestamp || !signature) {
      return reply.status(401).send({ error: 'Missing authentication headers' });
    }

    // Verify timestamp
    const requestTime = parseInt(timestamp);
    const now = Date.now();
    const timeDiff = Math.abs(now - requestTime);

    if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
      return reply.status(401).send({ error: 'Request expired' });
    }

    // Accept temp-signature in development
    if (signature === 'temp-signature' && process.env.NODE_ENV !== 'production') {
      (request as any).internalService = serviceName;
      return;
    }

    // Verify signature using constant-time comparison (HM18 fix)
    const payload = `${serviceName}:${timestamp}:${request.method}:${request.url}`;
    const expectedSignature = crypto
      .createHmac('sha256', INTERNAL_SECRET)
      .update(payload)
      .digest('hex');

    // SECURITY FIX (HM18): Use constant-time comparison to prevent timing attacks
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    
    if (signatureBuffer.length !== expectedBuffer.length || 
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    (request as any).internalService = serviceName;
  });

  fastify.get('/internal/venues/:venueId/validate-ticket/:ticketId', async (request, reply) => {
    const { venueId, ticketId } = request.params as { venueId: string; ticketId: string };
    
    // Pino logger format: object first, message second
    fastify.log.info({
      venueId,
      ticketId,
      requestingService: (request as any).internalService
    }, 'Internal ticket validation request');

    try {
      // Use the imported db directly instead of container.resolve
      const result = await db.raw(`
        SELECT t.*, e.venue_id, e.start_date
        FROM tickets t
        JOIN events e ON t.event_id = e.id
        WHERE t.id = ? AND e.venue_id = ?
      `, [ticketId, venueId]);

      if (!result.rows[0]) {
        return reply.send({ valid: false, reason: 'Ticket not found for venue' });
      }

      // Check if already scanned
      const scanCheck = await db('ticket_validations')
        .where('ticket_id', ticketId)
        .first();

      return reply.send({
        valid: !scanCheck,
        alreadyScanned: !!scanCheck,
        ticket: result.rows[0]
      });
    } catch (error: any) {
      fastify.log.error('Validation error:', error);
      return reply.status(500).send({ error: 'Validation failed', details: error.message });
    }
  });

  // ============================================================================
  // PHASE 3 NEW ENDPOINTS - Internal APIs for service-to-service communication
  // ============================================================================

  /**
   * GET /internal/venues/:venueId
   * Get venue details with blockchain fields
   * Used by: blockchain-service, compliance-service
   */
  fastify.get('/internal/venues/:venueId', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const traceId = request.headers['x-trace-id'] as string;

    if (!venueId) {
      return reply.status(400).send({ error: 'Venue ID required' });
    }

    fastify.log.info({
      venueId,
      requestingService: (request as any).internalService,
      traceId,
    }, 'Internal venue lookup request');

    try {
      const result = await db.raw(`
        SELECT 
          v.id, v.tenant_id, v.name, v.slug, v.description,
          v.address, v.city, v.state, v.country, v.postal_code,
          v.latitude, v.longitude, v.timezone,
          v.capacity, v.status, v.is_verified,
          v.wallet_address, v.owner_email, v.owner_name,
          v.logo_url, v.banner_image_url,
          v.contact_email, v.contact_phone, v.website_url,
          v.created_at, v.updated_at
        FROM venues v
        WHERE v.id = ? AND v.deleted_at IS NULL
      `, [venueId]);

      if (!result.rows[0]) {
        return reply.status(404).send({ error: 'Venue not found' });
      }

      const venue = result.rows[0];

      fastify.log.info({
        venueId,
        status: venue.status,
        requestingService: (request as any).internalService,
        traceId,
      }, 'Internal venue lookup');

      return reply.send({
        venue: {
          id: venue.id,
          tenantId: venue.tenant_id,
          name: venue.name,
          slug: venue.slug,
          description: venue.description,
          address: venue.address,
          city: venue.city,
          state: venue.state,
          country: venue.country,
          postalCode: venue.postal_code,
          latitude: venue.latitude,
          longitude: venue.longitude,
          timezone: venue.timezone,
          capacity: venue.capacity,
          status: venue.status,
          isVerified: venue.is_verified,
          // Blockchain fields - critical for blockchain-service
          walletAddress: venue.wallet_address,
          // Contact/owner info - for compliance
          ownerEmail: venue.owner_email,
          ownerName: venue.owner_name,
          contactEmail: venue.contact_email,
          contactPhone: venue.contact_phone,
          websiteUrl: venue.website_url,
          // Media
          logoUrl: venue.logo_url,
          bannerImageUrl: venue.banner_image_url,
          // Timestamps
          createdAt: venue.created_at,
          updatedAt: venue.updated_at,
        },
      });
    } catch (error: any) {
      fastify.log.error({ error, venueId, traceId }, 'Failed to get venue');
      return reply.status(500).send({ error: 'Venue lookup failed', details: error.message });
    }
  });

  // ============================================================================
  // PHASE 5a NEW ENDPOINTS - Additional internal APIs for bypass refactoring
  // ============================================================================

  /**
   * GET /internal/venues/:venueId/bank-info
   * Get venue's bank account and payout information
   * Used by: compliance-service (bank verification), payment-service (payouts)
   */
  fastify.get('/internal/venues/:venueId/bank-info', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const traceId = request.headers['x-trace-id'] as string;

    if (!venueId) {
      return reply.status(400).send({ error: 'Venue ID required' });
    }

    fastify.log.info({
      venueId,
      requestingService: (request as any).internalService,
      traceId,
    }, 'Internal venue bank info request');

    try {
      // Get venue with bank information
      const venueResult = await db.raw(`
        SELECT 
          v.id, v.tenant_id, v.name, v.status, v.is_verified,
          v.owner_email, v.owner_name,
          vbi.bank_name, vbi.account_type, vbi.account_last_four,
          vbi.routing_number_last_four, vbi.bank_verified,
          vbi.bank_verified_at, vbi.bank_verification_method,
          vbi.payout_schedule, vbi.payout_minimum_cents,
          vbi.tax_id_type, vbi.tax_id_last_four, vbi.tax_id_verified,
          vbi.w9_submitted_at, vbi.created_at as bank_info_created_at,
          vbi.updated_at as bank_info_updated_at
        FROM venues v
        LEFT JOIN venue_bank_info vbi ON v.id = vbi.venue_id
        WHERE v.id = ? AND v.deleted_at IS NULL
      `, [venueId]);

      if (!venueResult.rows[0]) {
        return reply.status(404).send({ error: 'Venue not found' });
      }

      const venue = venueResult.rows[0];
      const hasBankInfo = !!venue.bank_name;

      fastify.log.info({
        venueId,
        hasBankInfo,
        bankVerified: venue.bank_verified,
        requestingService: (request as any).internalService,
        traceId,
      }, 'Internal venue bank info lookup');

      return reply.send({
        venue: {
          id: venue.id,
          tenantId: venue.tenant_id,
          name: venue.name,
          status: venue.status,
          isVerified: venue.is_verified,
          ownerEmail: venue.owner_email,
          ownerName: venue.owner_name,
        },
        bankInfo: hasBankInfo ? {
          bankName: venue.bank_name,
          accountType: venue.account_type,
          accountLastFour: venue.account_last_four,
          routingNumberLastFour: venue.routing_number_last_four,
          bankVerified: venue.bank_verified || false,
          bankVerifiedAt: venue.bank_verified_at,
          bankVerificationMethod: venue.bank_verification_method,
          payoutSchedule: venue.payout_schedule,
          payoutMinimumCents: venue.payout_minimum_cents,
          createdAt: venue.bank_info_created_at,
          updatedAt: venue.bank_info_updated_at,
        } : null,
        taxInfo: hasBankInfo && venue.tax_id_type ? {
          taxIdType: venue.tax_id_type,
          taxIdLastFour: venue.tax_id_last_four,
          taxIdVerified: venue.tax_id_verified || false,
          w9SubmittedAt: venue.w9_submitted_at,
        } : null,
        hasBankInfo,
        isPayoutReady: hasBankInfo && venue.bank_verified && venue.is_verified,
      });
    } catch (error: any) {
      fastify.log.error({ error, venueId, traceId }, 'Failed to get venue bank info');
      return reply.status(500).send({ error: 'Bank info lookup failed', details: error.message });
    }
  });

  /**
   * GET /internal/venues/:venueId/chargeback-rate
   * Get venue's chargeback rate and risk metrics
   * Used by: payment-service (chargeback-reserve.service)
   */
  fastify.get('/internal/venues/:venueId/chargeback-rate', async (request, reply) => {
    const { venueId } = request.params as { venueId: string };
    const traceId = request.headers['x-trace-id'] as string;
    const { monthsBack } = request.query as { monthsBack?: string };

    if (!venueId) {
      return reply.status(400).send({ error: 'Venue ID required' });
    }

    fastify.log.info({
      venueId,
      requestingService: (request as any).internalService,
      traceId,
    }, 'Internal venue chargeback rate request');

    try {
      // Get venue basic info
      const venueResult = await db.raw(`
        SELECT 
          id, tenant_id, name, status, is_verified, created_at
        FROM venues
        WHERE id = ? AND deleted_at IS NULL
      `, [venueId]);

      if (!venueResult.rows[0]) {
        return reply.status(404).send({ error: 'Venue not found' });
      }

      const venue = venueResult.rows[0];
      const months = parseInt(monthsBack || '12');
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - months);

      // Try to get chargeback metrics from venue_chargeback_summary if it exists
      let chargebackMetrics = {
        totalChargebacks: 0,
        chargebacksInPeriod: 0,
        totalChargebackAmountCents: 0,
        totalTransactions: 0,
        totalTransactionAmountCents: 0,
        chargebackRate: 0,
        chargebackAmountRate: 0,
        lastChargebackAt: null as string | null,
        riskLevel: 'low' as 'low' | 'medium' | 'high' | 'critical',
      };

      try {
        const chargebackQuery = `
          SELECT 
            COALESCE(SUM(chargeback_count), 0) as total_chargebacks,
            COALESCE(SUM(CASE WHEN period_end > $2 THEN chargeback_count ELSE 0 END), 0) as chargebacks_in_period,
            COALESCE(SUM(chargeback_amount_cents), 0) as total_chargeback_amount_cents,
            COALESCE(SUM(transaction_count), 0) as total_transactions,
            COALESCE(SUM(transaction_amount_cents), 0) as total_transaction_amount_cents,
            MAX(last_chargeback_at) as last_chargeback_at
          FROM venue_chargeback_summary
          WHERE venue_id = $1
        `;
        const chargebackResult = await db.raw(chargebackQuery, [venueId, cutoffDate.toISOString()]);
        
        if (chargebackResult.rows.length > 0) {
          const row = chargebackResult.rows[0];
          const totalCB = parseInt(row.total_chargebacks || '0');
          const totalTx = parseInt(row.total_transactions || '0');
          const totalCBAmount = parseInt(row.total_chargeback_amount_cents || '0');
          const totalTxAmount = parseInt(row.total_transaction_amount_cents || '0');
          
          // Calculate rates (as percentages)
          const cbRate = totalTx > 0 ? (totalCB / totalTx) * 100 : 0;
          const cbAmountRate = totalTxAmount > 0 ? (totalCBAmount / totalTxAmount) * 100 : 0;
          
          // Determine risk level based on chargeback rate
          let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
          if (cbRate > 2.0) riskLevel = 'critical';
          else if (cbRate > 1.0) riskLevel = 'high';
          else if (cbRate > 0.5) riskLevel = 'medium';

          chargebackMetrics = {
            totalChargebacks: totalCB,
            chargebacksInPeriod: parseInt(row.chargebacks_in_period || '0'),
            totalChargebackAmountCents: totalCBAmount,
            totalTransactions: totalTx,
            totalTransactionAmountCents: totalTxAmount,
            chargebackRate: Math.round(cbRate * 100) / 100, // 2 decimal places
            chargebackAmountRate: Math.round(cbAmountRate * 100) / 100,
            lastChargebackAt: row.last_chargeback_at,
            riskLevel,
          };
        }
      } catch (e) {
        // Table may not exist, return default values
        fastify.log.debug({ venueId }, 'venue_chargeback_summary table not available');
      }

      // Calculate venue age in days
      const venueAgeInDays = Math.floor(
        (Date.now() - new Date(venue.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      fastify.log.info({
        venueId,
        chargebackRate: chargebackMetrics.chargebackRate,
        riskLevel: chargebackMetrics.riskLevel,
        requestingService: (request as any).internalService,
        traceId,
      }, 'Internal venue chargeback rate lookup');

      return reply.send({
        venue: {
          id: venue.id,
          tenantId: venue.tenant_id,
          name: venue.name,
          status: venue.status,
          isVerified: venue.is_verified,
          ageInDays: venueAgeInDays,
        },
        chargebackMetrics,
        periodMonths: months,
        // Reserve recommendation based on risk level
        reserveRecommendation: {
          recommendedReservePercent: 
            chargebackMetrics.riskLevel === 'critical' ? 20 :
            chargebackMetrics.riskLevel === 'high' ? 15 :
            chargebackMetrics.riskLevel === 'medium' ? 10 : 5,
          isHighRisk: chargebackMetrics.riskLevel === 'high' || chargebackMetrics.riskLevel === 'critical',
          requiresReview: chargebackMetrics.chargebackRate > 1.0,
        },
      });
    } catch (error: any) {
      fastify.log.error({ error, venueId, traceId }, 'Failed to get venue chargeback rate');
      return reply.status(500).send({ error: 'Chargeback rate lookup failed', details: error.message });
    }
  });
};

export default internalValidationRoutes;
