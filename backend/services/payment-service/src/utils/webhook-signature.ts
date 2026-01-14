/**
 * Webhook Signature Verification
 * 
 * HIGH FIX: Implements proper webhook signature verification with:
 * - Stripe webhook signature validation
 * - Timing-safe comparison
 * - Timestamp validation (anti-replay)
 * - Multiple signature support
 */

import crypto from 'crypto';
import { logger } from './logger';
import { secureCompare } from './crypto.util';

const log = logger.child({ component: 'WebhookSignature' });

// =============================================================================
// CONSTANTS
// =============================================================================

// Maximum age of webhook timestamp (5 minutes)
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

// Stripe signature scheme version
const STRIPE_SIGNATURE_VERSION = 'v1';

// =============================================================================
// TYPES
// =============================================================================

export interface StripeSignatureHeader {
  timestamp: number;
  signatures: string[];
}

export interface WebhookVerificationResult {
  valid: boolean;
  error?: string;
  timestamp?: Date;
}

// =============================================================================
// STRIPE SIGNATURE VERIFICATION
// =============================================================================

/**
 * Parse Stripe signature header
 * Format: t=timestamp,v1=signature1,v1=signature2,...
 */
export function parseStripeSignature(header: string): StripeSignatureHeader | null {
  try {
    const parts = header.split(',');
    let timestamp: number | null = null;
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, value] = part.split('=');
      
      if (key === 't') {
        timestamp = parseInt(value, 10);
      } else if (key === STRIPE_SIGNATURE_VERSION) {
        signatures.push(value);
      }
    }

    if (timestamp === null || signatures.length === 0) {
      return null;
    }

    return { timestamp, signatures };
  } catch {
    return null;
  }
}

/**
 * Verify Stripe webhook signature
 */
export function verifyStripeWebhook(
  payload: string | Buffer,
  signatureHeader: string,
  secret: string,
  toleranceMs: number = MAX_TIMESTAMP_AGE_MS
): WebhookVerificationResult {
  // Parse the signature header
  const parsed = parseStripeSignature(signatureHeader);
  
  if (!parsed) {
    log.warn({ signatureHeader }, 'Invalid signature header format');
    return {
      valid: false,
      error: 'Invalid signature header format',
    };
  }

  // Check timestamp freshness
  const timestampMs = parsed.timestamp * 1000;
  const now = Date.now();
  const age = now - timestampMs;

  if (age > toleranceMs) {
    log.warn({
      timestamp: parsed.timestamp,
      ageMs: age,
      toleranceMs,
    }, 'Webhook timestamp too old');
    
    return {
      valid: false,
      error: 'Webhook timestamp too old',
      timestamp: new Date(timestampMs),
    };
  }

  // Future timestamps should also be rejected (clock skew protection)
  if (timestampMs > now + 60000) { // Allow 1 minute future
    log.warn({
      timestamp: parsed.timestamp,
      futureMs: timestampMs - now,
    }, 'Webhook timestamp in future');
    
    return {
      valid: false,
      error: 'Webhook timestamp in future',
      timestamp: new Date(timestampMs),
    };
  }

  // Compute expected signature
  const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
  const signedPayload = `${parsed.timestamp}.${payloadString}`;
  
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Check if any of the provided signatures match
  let signatureValid = false;
  
  for (const signature of parsed.signatures) {
    if (secureCompare(signature, expectedSignature)) {
      signatureValid = true;
      break;
    }
  }

  if (!signatureValid) {
    log.warn('Webhook signature mismatch');
    return {
      valid: false,
      error: 'Signature mismatch',
      timestamp: new Date(timestampMs),
    };
  }

  return {
    valid: true,
    timestamp: new Date(timestampMs),
  };
}

/**
 * Generate a Stripe-compatible signature for testing
 */
export function generateStripeSignature(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp || Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${payload}`;
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return `t=${ts},${STRIPE_SIGNATURE_VERSION}=${signature}`;
}

// =============================================================================
// GENERIC HMAC WEBHOOK VERIFICATION
// =============================================================================

/**
 * Verify HMAC signature (generic)
 */
export function verifyHmacSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): boolean {
  const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
  
  const expectedSignature = crypto
    .createHmac(algorithm, secret)
    .update(payloadString)
    .digest('hex');

  return secureCompare(signature, expectedSignature);
}

/**
 * Verify HMAC signature with prefix (e.g., sha256=signature)
 */
export function verifyPrefixedHmacSignature(
  payload: string | Buffer,
  signatureHeader: string,
  secret: string
): boolean {
  // Handle formats like "sha256=signature" or "sha512=signature"
  const [algorithm, signature] = signatureHeader.split('=');
  
  if (!algorithm || !signature) {
    return false;
  }

  const algo = algorithm.toLowerCase() as 'sha256' | 'sha512';
  if (algo !== 'sha256' && algo !== 'sha512') {
    return false;
  }

  return verifyHmacSignature(payload, signature, secret, algo);
}

// =============================================================================
// WEBHOOK VERIFICATION MIDDLEWARE
// =============================================================================

/**
 * Create Fastify preHandler for Stripe webhook verification
 */
export function createStripeWebhookVerifier(getSecret: () => Promise<string>) {
  return async (request: any, reply: any): Promise<void> => {
    const signature = request.headers['stripe-signature'];
    
    if (!signature) {
      log.warn('Missing Stripe-Signature header');
      reply.status(400).send({
        type: 'https://api.tickettoken.io/problems/missing-signature',
        title: 'Missing Signature',
        status: 400,
        detail: 'Stripe-Signature header is required',
      });
      return;
    }

    // Get raw body
    const rawBody = request.rawBody;
    
    if (!rawBody) {
      log.warn('Raw body not available');
      reply.status(500).send({
        type: 'https://api.tickettoken.io/problems/internal-error',
        title: 'Internal Error',
        status: 500,
        detail: 'Raw body not available for signature verification',
      });
      return;
    }

    try {
      const secret = await getSecret();
      const result = verifyStripeWebhook(rawBody, signature, secret);

      if (!result.valid) {
        log.warn({ error: result.error }, 'Webhook signature verification failed');
        reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/invalid-signature',
          title: 'Invalid Signature',
          status: 400,
          detail: result.error,
        });
        return;
      }

      // Attach verified timestamp to request
      (request as any).webhookTimestamp = result.timestamp;
    } catch (error: any) {
      log.error({ error: error.message }, 'Webhook verification error');
      reply.status(500).send({
        type: 'https://api.tickettoken.io/problems/internal-error',
        title: 'Internal Error',
        status: 500,
        detail: 'Failed to verify webhook signature',
      });
    }
  };
}

// =============================================================================
// REPLAY PROTECTION
// =============================================================================

/**
 * Simple in-memory replay protection
 * For production, use Redis or similar
 */
class ReplayProtection {
  private seenIds: Map<string, number> = new Map();
  private cleanupIntervalMs = 60000; // 1 minute
  private maxAgeMs = MAX_TIMESTAMP_AGE_MS;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startCleanup();
  }

  /**
   * Check if an event ID has been seen before
   */
  checkAndRecord(eventId: string): boolean {
    const now = Date.now();
    
    // Check if already seen
    if (this.seenIds.has(eventId)) {
      log.warn({ eventId }, 'Duplicate webhook event detected');
      return false;
    }

    // Record this event
    this.seenIds.set(eventId, now);
    return true;
  }

  /**
   * Start periodic cleanup of old entries
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - this.maxAgeMs;
      let removed = 0;
      
      for (const [id, timestamp] of this.seenIds) {
        if (timestamp < cutoff) {
          this.seenIds.delete(id);
          removed++;
        }
      }

      if (removed > 0) {
        log.debug({ removed }, 'Cleaned up old webhook event IDs');
      }
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop cleanup (for shutdown)
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const replayProtection = new ReplayProtection();
