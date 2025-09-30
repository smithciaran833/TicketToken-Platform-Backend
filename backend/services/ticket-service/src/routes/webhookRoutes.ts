import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { QueueListener } from '../services/queueListener';
import { logger } from '../utils/logger';
import { Pool } from 'pg';

const router = Router();
const log = logger.child({ component: 'WebhookRoutes' });

// Initialize database pool for nonce tracking
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Webhook secret for internal service-to-service communication
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';

// Middleware to verify internal webhook signature with replay protection
async function verifyInternalWebhook(req: Request, res: Response, next: any) {
  const signature = req.headers['x-internal-signature'] as string;
  const timestamp = req.headers['x-webhook-timestamp'] as string;
  const nonce = req.headers['x-webhook-nonce'] as string;
  
  // Check required headers
  if (!signature || !timestamp || !nonce) {
    log.warn('Webhook request missing required headers', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasNonce: !!nonce
    });
    return res.status(401).json({ error: 'Missing required security headers' });
  }

  // Verify timestamp is within 5 minutes
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);
  
  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    log.warn('Webhook request with invalid or expired timestamp', {
      timestamp,
      timeDiff: timeDiff / 1000,
      maxAllowed: 300
    });
    return res.status(401).json({ error: 'Request expired or invalid timestamp' });
  }

  // Check if nonce was already used (prevent replay)
  try {
    const nonceCheck = await pool.query(
      `SELECT created_at FROM webhook_nonces 
       WHERE nonce = $1 AND endpoint = $2`,
      [nonce, req.path]
    );

    if (nonceCheck.rows.length > 0) {
      log.warn('Webhook replay attempt detected', {
        nonce,
        endpoint: req.path,
        previousUse: nonceCheck.rows[0].created_at
      });
      return res.status(401).json({ error: 'Duplicate request (nonce already used)' });
    }

    // Store nonce to prevent replay
    await pool.query(
      `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
      [nonce, req.path]
    );

    // Clean up old nonces (async, don't wait)
    pool.query('DELETE FROM webhook_nonces WHERE expires_at < NOW()')
      .catch(err => log.error('Failed to clean old nonces', err));

  } catch (dbError) {
    // If nonce table doesn't exist, create it
    if ((dbError as any).code === '42P01') {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS webhook_nonces (
            nonce VARCHAR(255) PRIMARY KEY,
            endpoint VARCHAR(255) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL,
            INDEX idx_expires (expires_at)
          )
        `);
        // Try to store nonce again
        await pool.query(
          `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
           VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
          [nonce, req.path]
        );
      } catch (createError) {
        log.error('Failed to create nonce table', createError);
        return res.status(500).json({ error: 'Database error' });
      }
    } else {
      log.error('Database error checking nonce', dbError);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  // Compute expected signature (includes timestamp and nonce)
  const payload = `${timestamp}:${nonce}:${JSON.stringify(req.body)}`;
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    log.warn('Invalid webhook signature', {
      received: signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...'
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Set default tenant for webhooks
  (req as any).tenantId = '00000000-0000-0000-0000-000000000001';
  
  // Add webhook metadata to request
  (req as any).webhookMetadata = {
    nonce,
    timestamp: requestTime,
    verified: true
  };

  // Signature is valid and not a replay, proceed to next handler
  return next();
}

// Internal webhook from payment service - SECURED with anti-replay
router.post('/payment-success', verifyInternalWebhook, async (req, res) => {
  try {
    const { orderId, paymentId, tenantId } = req.body;
    
    if (!orderId || !paymentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    log.info('Processing payment success webhook', { 
      orderId, 
      paymentId, 
      tenantId,
      nonce: (req as any).webhookMetadata?.nonce
    });

    await QueueListener.processPaymentSuccess(orderId, paymentId);
    
    return res.json({ 
      processed: true,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Failed to process payment success', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
});

router.post('/payment-failed', verifyInternalWebhook, async (req, res) => {
  try {
    const { orderId, reason, tenantId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Missing orderId' });
    }

    log.info('Processing payment failure webhook', { 
      orderId, 
      reason, 
      tenantId,
      nonce: (req as any).webhookMetadata?.nonce
    });

    await QueueListener.processPaymentFailure(orderId, reason);
    
    return res.json({ 
      processed: true,
      timestamp: Date.now()
    });
  } catch (error) {
    log.error('Failed to process payment failure', error);
    return res.status(500).json({ error: 'Processing failed' });
  }
});

export default router;
