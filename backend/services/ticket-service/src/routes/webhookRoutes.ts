import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import { QueueListener } from '../services/queueListener';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookRoutes' });

// Webhook secret for internal service-to-service communication
// SECURITY: This MUST be set in production
const isProduction = process.env.NODE_ENV === 'production';
const WEBHOOK_SECRET = isProduction 
  ? (() => {
      const secret = process.env.INTERNAL_WEBHOOK_SECRET;
      if (!secret) {
        throw new Error(
          'FATAL: INTERNAL_WEBHOOK_SECRET must be set in production. ' +
          'Please set it in your .env file. See .env.example for details.'
        );
      }
      return secret;
    })()
  : (process.env.INTERNAL_WEBHOOK_SECRET || 'dev-webhook-secret-change-in-prod');

// Helper function for deterministic JSON stringification
function deterministicStringify(obj: any): string {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => deterministicStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => `"${key}":${deterministicStringify(obj[key])}`);
  return '{' + pairs.join(',') + '}';
}

// Middleware to verify internal webhook signature with replay protection
async function verifyInternalWebhook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const pool = DatabaseService.getPool();
  const signature = request.headers['x-internal-signature'] as string;
  const timestamp = request.headers['x-webhook-timestamp'] as string;
  const nonce = request.headers['x-webhook-nonce'] as string;

  // Check required headers
  if (!signature || !timestamp || !nonce) {
    log.warn('Webhook request missing required headers', {
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasNonce: !!nonce
    });
    return reply.status(401).send({ error: 'Missing required security headers' });
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
    return reply.status(401).send({ error: 'Request expired or invalid timestamp' });
  }

  // Check if nonce was already used (prevent replay)
  try {
    const nonceCheck = await pool.query(
      `SELECT created_at FROM webhook_nonces
       WHERE nonce = $1 AND endpoint = $2`,
      [nonce, request.url]
    );

    if (nonceCheck.rows.length > 0) {
      log.warn('Webhook replay attempt detected', {
        nonce,
        endpoint: request.url,
        previousUse: nonceCheck.rows[0].created_at
      });
      return reply.status(401).send({ error: 'Duplicate request (nonce already used)' });
    }

    // Store nonce to prevent replay
    await pool.query(
      `INSERT INTO webhook_nonces (nonce, endpoint, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
      [nonce, request.url]
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
          [nonce, request.url]
        );
      } catch (createError) {
        log.error('Failed to create nonce table', createError);
        return reply.status(500).send({ error: 'Database error' });
      }
    } else {
      log.error('Database error checking nonce', dbError);
      return reply.status(500).send({ error: 'Database error' });
    }
  }

  // Compute expected signature using deterministic JSON
  const bodyString = deterministicStringify(request.body);
  const payload = `${timestamp}:${nonce}:${bodyString}`;
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');

  if (signature !== expectedSignature) {
    log.warn('Invalid webhook signature', {
      received: signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...'
    });
    return reply.status(401).send({ error: 'Invalid signature' });
  }

  // Set default tenant for webhooks
  (request as any).tenantId = '00000000-0000-0000-0000-000000000001';

  // Add webhook metadata to request
  (request as any).webhookMetadata = {
    nonce,
    timestamp: requestTime,
    verified: true
  };

  // Signature is valid and not a replay, proceed to next handler
}

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Internal webhook from payment service - SECURED with anti-replay
  fastify.post('/payment-success', {
    preHandler: [verifyInternalWebhook]
  }, async (request, reply) => {
    try {
      const { orderId, paymentId, tenantId } = request.body as any;

      if (!orderId || !paymentId) {
        return reply.status(400).send({ error: 'Missing required fields' });
      }

      log.info('Processing payment success webhook', {
        orderId,
        paymentId,
        tenantId,
        nonce: (request as any).webhookMetadata?.nonce
      });

      await QueueListener.processPaymentSuccess(orderId, paymentId);

      return reply.send({
        processed: true,
        timestamp: Date.now()
      });
    } catch (error) {
      log.error('Failed to process payment success', error);
      return reply.status(500).send({ error: 'Processing failed' });
    }
  });

  fastify.post('/payment-failed', {
    preHandler: [verifyInternalWebhook]
  }, async (request, reply) => {
    try {
      const { orderId, reason, tenantId } = request.body as any;

      if (!orderId) {
        return reply.status(400).send({ error: 'Missing orderId' });
      }

      log.info('Processing payment failure webhook', {
        orderId,
        reason,
        tenantId,
        nonce: (request as any).webhookMetadata?.nonce
      });

      await QueueListener.processPaymentFailure(orderId, reason);

      return reply.send({
        processed: true,
        timestamp: Date.now()
      });
    } catch (error) {
      log.error('Failed to process payment failure', error);
      return reply.status(500).send({ error: 'Processing failed' });
    }
  });
}
