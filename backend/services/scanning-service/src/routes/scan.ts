import express, { Request, Response, Router } from 'express';
import QRValidator from '../services/QRValidator';
import logger from '../utils/logger';
import { scansAllowedTotal, scansDeniedTotal, scanLatency } from '../utils/metrics';
import { scanRateLimiter } from '../middleware/rate-limit.middleware';

const router: Router = express.Router();
const qrValidator = new QRValidator();

// ISSUE #26 FIX: Add rate limiting to prevent brute-force QR scanning
// POST /api/scan - Main scanning endpoint with rate limiting
router.post('/', scanRateLimiter, async (req: Request, res: Response): Promise<Response> => {
  const startTime = Date.now();
  
  try {
    const { qr_data, device_id, location, staff_user_id } = req.body;
    
    if (!qr_data || !device_id) {
      scansDeniedTotal.labels('missing_parameters').inc();
      return res.status(400).json({
        success: false,
        error: 'MISSING_PARAMETERS',
        message: 'qr_data and device_id are required'
      });
    }

    // ISSUE #26 FIX: Log potential brute-force attempts
    logger.info('Scan attempt', {
      deviceId: device_id,
      staffUser: staff_user_id,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    const result = await qrValidator.validateScan(
      qr_data,
      device_id,
      location,
      staff_user_id
    );

    const duration = (Date.now() - startTime) / 1000;
    scanLatency.observe(duration);

    if (result.valid) {
      scansAllowedTotal.inc();
      return res.json(result);
    } else {
      scansDeniedTotal.labels(result.reason || 'unknown').inc();
      
      // ISSUE #26 FIX: Track failed scan attempts for security monitoring
      if (result.reason === 'INVALID_QR' || result.reason === 'TICKET_NOT_FOUND') {
        logger.warn('Invalid QR scan attempt', {
          deviceId: device_id,
          reason: result.reason,
          ip: req.ip
        });
      }
      
      return res.status(400).json(result);
    }
  } catch (error) {
    logger.error('Scan error:', error);
    return res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Failed to process scan'
    });
  }
});

// ISSUE #26 FIX: Add bulk scan endpoint with stricter rate limiting
const bulkScanRateLimiter = require('../middleware/rate-limit.middleware').createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // only 5 bulk requests per 5 minutes
  message: 'Too many bulk scan requests'
});

router.post('/bulk', bulkScanRateLimiter, async (req: Request, res: Response): Promise<Response> => {
  // Bulk scanning logic here
  return res.status(501).json({ error: 'Bulk scanning not implemented' });
});

export default router;
