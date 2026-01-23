/**
 * Internal Routes - scanning-service
 *
 * For service-to-service communication only.
 * These endpoints allow other services to record scan results
 * and query scan data.
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 *
 * Endpoints:
 * - POST /internal/scan-results - Record scan result from external device/service
 * - GET /internal/scan-results/:ticketId - Get scan history for a ticket
 * - GET /internal/events/:eventId/scan-summary - Get scan summary for an event
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { internalAuthMiddleware } from '../middleware/internal-auth.middleware';
import { getPool } from '../config/database';
import logger from '../utils/logger';

const log = logger.child({ component: 'InternalRoutes' });

interface ScanResultBody {
  ticketId: string;
  eventId: string;
  deviceId?: string;
  venueId?: string;
  scanType?: 'entry' | 'exit' | 'reentry' | 'validation';
  result: 'valid' | 'invalid' | 'already_used' | 'expired' | 'not_found';
  reason?: string;
  metadata?: Record<string, any>;
  scannedAt?: string;
}

export default async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes
  fastify.addHook('preHandler', internalAuthMiddleware);

  /**
   * POST /internal/scan-results
   * Record a scan result from an external device or service
   * Used by: ticket-service, mobile apps via API gateway
   */
  fastify.post<{ Body: ScanResultBody }>('/scan-results', async (request, reply) => {
    const {
      ticketId,
      eventId,
      deviceId,
      venueId,
      scanType = 'entry',
      result,
      reason,
      metadata,
      scannedAt
    } = request.body;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    // Validate required fields
    if (!ticketId || !eventId || !result) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'ticketId, eventId, and result are required',
      });
    }

    // Validate result enum
    const validResults = ['valid', 'invalid', 'already_used', 'expired', 'not_found'];
    if (!validResults.includes(result)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `result must be one of: ${validResults.join(', ')}`,
      });
    }

    // Validate scanType enum
    const validScanTypes = ['entry', 'exit', 'reentry', 'validation'];
    if (scanType && !validScanTypes.includes(scanType)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: `scanType must be one of: ${validScanTypes.join(', ')}`,
      });
    }

    try {
      const pool = getPool();
      const scanTime = scannedAt ? new Date(scannedAt) : new Date();

      // Insert scan result
      const insertQuery = `
        INSERT INTO scan_results (
          ticket_id, event_id, device_id, venue_id,
          scan_type, result, reason, metadata,
          scanned_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id, ticket_id, event_id, scan_type, result, scanned_at, created_at
      `;

      const insertResult = await pool.query(insertQuery, [
        ticketId,
        eventId,
        deviceId || null,
        venueId || null,
        scanType,
        result,
        reason || null,
        metadata ? JSON.stringify(metadata) : null,
        scanTime,
      ]);

      const scanRecord = insertResult.rows[0];

      // Update ticket scan count and last_scanned_at if valid scan
      if (result === 'valid') {
        await pool.query(`
          UPDATE tickets
          SET
            scan_count = COALESCE(scan_count, 0) + 1,
            last_scanned_at = $2,
            updated_at = NOW()
          WHERE id = $1
        `, [ticketId, scanTime]);
      }

      log.info({
        scanId: scanRecord.id,
        ticketId,
        eventId,
        scanType,
        result,
        callingService,
        traceId,
      }, 'Scan result recorded');

      return reply.status(201).send({
        success: true,
        scanResult: {
          id: scanRecord.id,
          ticketId: scanRecord.ticket_id,
          eventId: scanRecord.event_id,
          scanType: scanRecord.scan_type,
          result: scanRecord.result,
          scannedAt: scanRecord.scanned_at,
          createdAt: scanRecord.created_at,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, ticketId, eventId, traceId }, 'Failed to record scan result');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/scan-results/:ticketId
   * Get scan history for a specific ticket
   * Used by: ticket-service, compliance-service
   */
  fastify.get<{
    Params: { ticketId: string };
    Querystring: { limit?: number; offset?: number };
  }>('/scan-results/:ticketId', async (request, reply) => {
    const { ticketId } = request.params;
    const { limit = 100, offset = 0 } = request.query;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!ticketId) {
      return reply.status(400).send({ error: 'Ticket ID required' });
    }

    try {
      const pool = getPool();

      // Get scan history
      const query = `
        SELECT
          id, ticket_id, event_id, device_id, venue_id,
          scan_type, result, reason, metadata,
          scanned_at, created_at
        FROM scan_results
        WHERE ticket_id = $1
        ORDER BY scanned_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await pool.query(query, [ticketId, limit, offset]);

      // Get total count
      const countResult = await pool.query(
        'SELECT COUNT(*) as total FROM scan_results WHERE ticket_id = $1',
        [ticketId]
      );
      const total = parseInt(countResult.rows[0]?.total || '0');

      log.info({
        ticketId,
        scanCount: result.rows.length,
        total,
        callingService,
        traceId,
      }, 'Internal scan history lookup');

      return reply.send({
        ticketId,
        scans: result.rows.map(s => ({
          id: s.id,
          ticketId: s.ticket_id,
          eventId: s.event_id,
          deviceId: s.device_id,
          venueId: s.venue_id,
          scanType: s.scan_type,
          result: s.result,
          reason: s.reason,
          metadata: s.metadata,
          scannedAt: s.scanned_at,
          createdAt: s.created_at,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + result.rows.length < total,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, ticketId, traceId }, 'Failed to get scan history');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/events/:eventId/scan-summary
   * Get scan summary for an event
   * Used by: event-service, analytics-service
   */
  fastify.get<{ Params: { eventId: string } }>('/events/:eventId/scan-summary', async (request, reply) => {
    const { eventId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!eventId) {
      return reply.status(400).send({ error: 'Event ID required' });
    }

    try {
      const pool = getPool();

      // Get scan summary grouped by result
      const summaryQuery = `
        SELECT
          result,
          scan_type,
          COUNT(*) as count
        FROM scan_results
        WHERE event_id = $1
        GROUP BY result, scan_type
        ORDER BY result, scan_type
      `;

      const summaryResult = await pool.query(summaryQuery, [eventId]);

      // Get unique tickets scanned
      const uniqueQuery = `
        SELECT
          COUNT(DISTINCT ticket_id) as unique_tickets,
          COUNT(*) as total_scans
        FROM scan_results
        WHERE event_id = $1
      `;

      const uniqueResult = await pool.query(uniqueQuery, [eventId]);

      // Get recent scans
      const recentQuery = `
        SELECT
          id, ticket_id, scan_type, result, scanned_at
        FROM scan_results
        WHERE event_id = $1
        ORDER BY scanned_at DESC
        LIMIT 10
      `;

      const recentResult = await pool.query(recentQuery, [eventId]);

      // Build summary object
      const summary: Record<string, Record<string, number>> = {};
      for (const row of summaryResult.rows) {
        if (!summary[row.result]) {
          summary[row.result] = {};
        }
        summary[row.result][row.scan_type] = parseInt(row.count);
      }

      log.info({
        eventId,
        uniqueTickets: uniqueResult.rows[0]?.unique_tickets,
        totalScans: uniqueResult.rows[0]?.total_scans,
        callingService,
        traceId,
      }, 'Internal event scan summary lookup');

      return reply.send({
        eventId,
        summary: {
          uniqueTicketsScanned: parseInt(uniqueResult.rows[0]?.unique_tickets || '0'),
          totalScans: parseInt(uniqueResult.rows[0]?.total_scans || '0'),
          byResult: summary,
        },
        recentScans: recentResult.rows.map(s => ({
          id: s.id,
          ticketId: s.ticket_id,
          scanType: s.scan_type,
          result: s.result,
          scannedAt: s.scanned_at,
        })),
      });
    } catch (error: any) {
      log.error({ error: error.message, eventId, traceId }, 'Failed to get event scan summary');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
