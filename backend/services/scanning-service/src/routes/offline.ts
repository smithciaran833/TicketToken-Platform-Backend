import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import QRGenerator from '../services/QRGenerator';
import { getPool } from '../config/database';
import logger from '../utils/logger';

const qrGenerator = new QRGenerator();

interface ManifestParams {
  eventId: string;
}

interface ManifestQuery {
  device_id?: string;
}

interface ReconcileBody {
  device_id: string;
  scans: Array<{
    ticket_id: string;
    scanned_at: string;
    result: string;
    reason?: string;
    scan_count?: number;
  }>;
}

export default async function offlineRoutes(fastify: FastifyInstance) {
  // GET /api/offline/manifest/:eventId - Get offline manifest for device
  fastify.get('/manifest/:eventId', async (
    request: FastifyRequest<{ Params: ManifestParams; Querystring: ManifestQuery }>,
    reply: FastifyReply
  ) => {
    try {
      const { eventId } = request.params;
      const { device_id } = request.query;

      if (!device_id) {
        return reply.status(400).send({
          success: false,
          error: 'MISSING_DEVICE_ID'
        });
      }

      const manifest = await qrGenerator.generateOfflineManifest(eventId, device_id);

      return reply.send({
        success: true,
        manifest
      });
    } catch (error) {
      logger.error('Manifest generation error:', error);
      return reply.status(500).send({
        success: false,
        error: 'MANIFEST_ERROR'
      });
    }
  });

  // POST /api/offline/reconcile - Reconcile offline scans
  fastify.post('/reconcile', async (request: FastifyRequest<{ Body: ReconcileBody }>, reply: FastifyReply) => {
    const pool = getPool();
    const client = await pool.connect();

    try {
      const { device_id, scans } = request.body;

      if (!device_id || !scans || !Array.isArray(scans)) {
        client.release();
        return reply.status(400).send({
          success: false,
          error: 'INVALID_REQUEST'
        });
      }

      await client.query('BEGIN');

      const results: any[] = [];

      for (const scan of scans) {
        try {
          // Check if this scan was already processed
          const existing = await client.query(`
            SELECT id FROM scans
            WHERE ticket_id = $1
              AND scanned_at = $2
            LIMIT 1
          `, [scan.ticket_id, scan.scanned_at]);

          if (existing.rows.length > 0) {
            results.push({
              ticket_id: scan.ticket_id,
              status: 'DUPLICATE',
              message: 'Already processed'
            });
            continue;
          }

          // Get device
          const deviceResult = await client.query(
            'SELECT id FROM devices WHERE device_id = $1',
            [device_id]
          );

          if (deviceResult.rows.length === 0) {
            results.push({
              ticket_id: scan.ticket_id,
              status: 'ERROR',
              message: 'Device not found'
            });
            continue;
          }

          // Insert scan record
          await client.query(`
            INSERT INTO scans (ticket_id, device_id, result, reason, scanned_at)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            scan.ticket_id,
            deviceResult.rows[0].id,
            scan.result,
            scan.reason,
            scan.scanned_at
          ]);

          // Update ticket if it was allowed
          if (scan.result === 'ALLOW') {
            await client.query(`
              UPDATE tickets
              SET
                scan_count = GREATEST(COALESCE(scan_count, 0), $1),
                last_scanned_at = GREATEST(COALESCE(last_scanned_at, $2), $2),
                first_scanned_at = LEAST(COALESCE(first_scanned_at, $2), $2)
              WHERE id = $3
            `, [scan.scan_count || 1, scan.scanned_at, scan.ticket_id]);
          }

          results.push({
            ticket_id: scan.ticket_id,
            status: 'SUCCESS',
            message: 'Scan reconciled'
          });
        } catch (error: any) {
          logger.error('Error reconciling scan:', error);
          results.push({
            ticket_id: scan.ticket_id,
            status: 'ERROR',
            message: error.message
          });
        }
      }

      await client.query('COMMIT');
      client.release();

      return reply.send({
        success: true,
        reconciled: results.filter(r => r.status === 'SUCCESS').length,
        failed: results.filter(r => r.status !== 'SUCCESS').length,
        results
      });
    } catch (error) {
      await client.query('ROLLBACK');
      client.release();
      logger.error('Reconciliation error:', error);
      return reply.status(500).send({
        success: false,
        error: 'RECONCILIATION_ERROR'
      });
    }
  });
}
