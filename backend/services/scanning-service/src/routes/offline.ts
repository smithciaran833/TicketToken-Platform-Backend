import express, { Request, Response, Router } from 'express';
import QRGenerator from '../services/QRGenerator';
import { getPool } from '../config/database';
import logger from '../utils/logger';

const router: Router = express.Router();
const qrGenerator = new QRGenerator();

// GET /api/offline/manifest/:eventId - Get offline manifest for device
router.get('/manifest/:eventId', async (req: Request, res: Response): Promise<Response> => {
  try {
    const { eventId } = req.params;
    const { device_id } = req.query;

    if (!device_id) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DEVICE_ID'
      });
    }

    const manifest = await qrGenerator.generateOfflineManifest(eventId, device_id as string);

    return res.json({
      success: true,
      manifest
    });

  } catch (error) {
    logger.error('Manifest generation error:', error);
    return res.status(500).json({
      success: false,
      error: 'MANIFEST_ERROR'
    });
  }
});

// POST /api/offline/reconcile - Reconcile offline scans
router.post('/reconcile', async (req: Request, res: Response): Promise<Response> => {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { device_id, scans } = req.body;

    if (!device_id || !scans || !Array.isArray(scans)) {
      client.release();
      return res.status(400).json({
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

    return res.json({
      success: true,
      reconciled: results.filter(r => r.status === 'SUCCESS').length,
      failed: results.filter(r => r.status !== 'SUCCESS').length,
      results
    });

  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    logger.error('Reconciliation error:', error);
    return res.status(500).json({
      success: false,
      error: 'RECONCILIATION_ERROR'
    });
  }
});

export default router;
