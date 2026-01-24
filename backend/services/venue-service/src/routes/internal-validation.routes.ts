/**
 * Internal Validation Routes - venue-service
 *
 * For service-to-service communication only.
 * These endpoints provide venue data to other services.
 *
 * Phase B HMAC Standardization - Routes now use shared middleware
 */

import { FastifyPluginAsync } from 'fastify';
import { db } from '../config/database';
import { internalAuthMiddleware } from '../middleware/internal-auth.middleware';

const internalValidationRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply standardized HMAC authentication to all routes
  fastify.addHook('preHandler', internalAuthMiddleware);

  fastify.get('/internal/venues/:venueId/validate-ticket/:ticketId', async (request, reply) => {
    const { venueId, ticketId } = request.params as { venueId: string; ticketId: string };

    fastify.log.info({
      venueId,
      ticketId,
      requestingService: (request as any).internalService
    }, 'Internal ticket validation request');

    try {
      // SECURITY FIX (H4): Use explicit column list instead of SELECT *
      const result = await db.raw(`
        SELECT
          t.id, t.ticket_number, t.status, t.scanned_at, t.event_id, t.tier_id,
          t.seat_section, t.seat_row, t.seat_number, t.holder_name, t.holder_email,
          e.venue_id, e.start_date, e.name as event_name
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

      // Return only safe ticket fields for validation
      const ticket = result.rows[0];
      return reply.send({
        valid: !scanCheck,
        alreadyScanned: !!scanCheck,
        ticket: {
          id: ticket.id,
          ticketNumber: ticket.ticket_number,
          status: ticket.status,
          scannedAt: ticket.scanned_at,
          eventId: ticket.event_id,
          eventName: ticket.event_name,
          venueId: ticket.venue_id,
          startDate: ticket.start_date,
          seatSection: ticket.seat_section,
          seatRow: ticket.seat_row,
          seatNumber: ticket.seat_number,
          holderName: ticket.holder_name,
        }
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
          v.address_line1, v.city, v.state_province, v.country_code, v.postal_code,
          v.latitude, v.longitude, v.timezone,
          v.max_capacity, v.status, v.is_verified,
          v.wallet_address,
          v.logo_url, v.cover_image_url,
          v.email, v.phone, v.website,
          v.created_by, v.created_at, v.updated_at
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
          addressLine1: venue.address_line1,
          city: venue.city,
          state: venue.state_province,
          country: venue.country_code,
          postalCode: venue.postal_code,
          latitude: venue.latitude,
          longitude: venue.longitude,
          timezone: venue.timezone,
          capacity: venue.max_capacity,
          status: venue.status,
          isVerified: venue.is_verified,
          // Blockchain fields - critical for blockchain-service
          walletAddress: venue.wallet_address,
          // Contact info
          contactEmail: venue.email,
          contactPhone: venue.phone,
          websiteUrl: venue.website,
          // Media
          logoUrl: venue.logo_url,
          bannerImageUrl: venue.cover_image_url,
          // Timestamps
          createdBy: venue.created_by,
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
