/**
 * Webhook Signature Verification Middleware
 * 
 * AUDIT FIXES:
 * - SEC-3: Webhook signature NOT verified → Proper HMAC verification
 * - S2S-7: Webhook signatures not verified → Timing-safe comparison
 * 
 * Implements proper signature verification for:
 * - Stripe (HMAC-SHA256 with timestamp)
 * - Square (HMAC-SHA256)
 * - Mailchimp/Mandrill (HMAC-SHA1)
 * - QuickBooks (Verifier token + HMAC-SHA256)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { 
  getStripeConfig, 
  getSquareConfig, 
  getMailchimpConfig, 
  getQuickBooksConfig,
  isProduction 
} from '../config/index';
import { logger } from '../utils/logger';
import { InvalidWebhookSignatureError } from '../errors/index';

// =============================================================================
// TYPES
// =============================================================================

export type WebhookProvider = 'stripe' | 'square' | 'mailchimp' | 'quickbooks';

interface WebhookVerificationResult {
  valid: boolean;
  provider: WebhookProvider;
  eventId?: string;
  eventType?: string;
  timestamp?: number;
}

// Extend FastifyRequest
declare module 'fastify' {
  interface FastifyRequest {
    webhookVerified?: WebhookVerificationResult;
    rawBody?: Buffer;
  }
}

// =============================================================================
// TIMING-SAFE COMPARISON
// =============================================================================

/**
 * Perform timing-safe comparison of two signatures
 * Prevents timing attacks by always comparing full buffers
 */
function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    
    // Must compare same-length buffers
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(bufferA, bufferB);
  } catch {
    return false;
  }
}

// =============================================================================
// STRIPE VERIFICATION
// =============================================================================

/**
 * Verify Stripe webhook signature
 * 
 * Stripe uses: HMAC-SHA256 with timestamp validation
 * Header format: t=timestamp,v1=signature
 * Payload: timestamp.rawBody
 */
export async function verifyStripeWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const config = getStripeConfig();
  const signature = request.headers['stripe-signature'] as string | undefined;
  
  if (!signature) {
    logger.warn('Missing Stripe webhook signature header', {
      requestId: request.id,
      path: request.url
    });
    throw new InvalidWebhookSignatureError('stripe', request.id as string);
  }
  
  if (!config.webhookSecret) {
    logger.error('Stripe webhook secret not configured');
    if (isProduction()) {
      throw new InvalidWebhookSignatureError('stripe', request.id as string);
    }
    // Allow in development with warning
    logger.warn('Allowing Stripe webhook without signature verification in non-production');
    request.webhookVerified = { valid: true, provider: 'stripe' };
    return;
  }
  
  try {
    // Parse the signature header
    const parts = signature.split(',');
    const signatureParts: Record<string, string> = {};
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      signatureParts[key] = value;
    }
    
    const timestamp = parseInt(signatureParts['t'], 10);
    const expectedSignature = signatureParts['v1'];
    
    if (!timestamp || !expectedSignature) {
      logger.warn('Invalid Stripe signature format', { requestId: request.id });
      throw new InvalidWebhookSignatureError('stripe', request.id as string);
    }
    
    // Check timestamp (prevent replay attacks - max 5 minutes old)
    const now = Math.floor(Date.now() / 1000);
    if (now - timestamp > 300) {
      logger.warn('Stripe webhook timestamp too old', {
        requestId: request.id,
        timestamp,
        now
      });
      throw new InvalidWebhookSignatureError('stripe', request.id as string);
    }
    
    // Get raw body - Stripe requires the raw body for signature verification
    const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
    
    // Compute expected signature
    const signedPayload = `${timestamp}.${rawBody.toString()}`;
    const computedSignature = crypto
      .createHmac('sha256', config.webhookSecret)
      .update(signedPayload)
      .digest('hex');
    
    // Timing-safe comparison
    if (!timingSafeCompare(expectedSignature, computedSignature)) {
      logger.warn('Invalid Stripe webhook signature', { requestId: request.id });
      throw new InvalidWebhookSignatureError('stripe', request.id as string);
    }
    
    // Extract event info
    const body = request.body as any;
    
    request.webhookVerified = {
      valid: true,
      provider: 'stripe',
      eventId: body?.id,
      eventType: body?.type,
      timestamp
    };
    
    logger.info('Stripe webhook verified', {
      requestId: request.id,
      eventId: body?.id,
      eventType: body?.type
    });
    
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      throw error;
    }
    logger.error('Stripe webhook verification error', {
      requestId: request.id,
      error: (error as Error).message
    });
    throw new InvalidWebhookSignatureError('stripe', request.id as string);
  }
}

// =============================================================================
// SQUARE VERIFICATION
// =============================================================================

/**
 * Verify Square webhook signature
 * 
 * Square uses: HMAC-SHA256
 * Header: x-square-hmacsha256-signature
 * Payload: notification URL + raw body
 */
export async function verifySquareWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const config = getSquareConfig();
  const signature = request.headers['x-square-hmacsha256-signature'] as string | undefined;
  
  if (!signature) {
    logger.warn('Missing Square webhook signature header', {
      requestId: request.id,
      path: request.url
    });
    throw new InvalidWebhookSignatureError('square', request.id as string);
  }
  
  if (!config.webhookSignatureKey) {
    logger.error('Square webhook signature key not configured');
    if (isProduction()) {
      throw new InvalidWebhookSignatureError('square', request.id as string);
    }
    logger.warn('Allowing Square webhook without signature verification in non-production');
    request.webhookVerified = { valid: true, provider: 'square' };
    return;
  }
  
  try {
    // Square signature is base64 encoded
    const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
    
    // Square computes signature over: webhookUrl + body
    // We need to construct the webhook URL that Square used
    const protocol = request.protocol || 'https';
    const host = request.hostname;
    const path = request.url.split('?')[0]; // Remove query params
    const webhookUrl = `${protocol}://${host}${path}`;
    
    const signedPayload = webhookUrl + rawBody.toString();
    
    const computedSignature = crypto
      .createHmac('sha256', config.webhookSignatureKey)
      .update(signedPayload)
      .digest('base64');
    
    // Timing-safe comparison
    if (!timingSafeCompare(signature, computedSignature)) {
      logger.warn('Invalid Square webhook signature', { requestId: request.id });
      throw new InvalidWebhookSignatureError('square', request.id as string);
    }
    
    const body = request.body as any;
    
    request.webhookVerified = {
      valid: true,
      provider: 'square',
      eventId: body?.event_id,
      eventType: body?.type
    };
    
    logger.info('Square webhook verified', {
      requestId: request.id,
      eventId: body?.event_id,
      eventType: body?.type
    });
    
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      throw error;
    }
    logger.error('Square webhook verification error', {
      requestId: request.id,
      error: (error as Error).message
    });
    throw new InvalidWebhookSignatureError('square', request.id as string);
  }
}

// =============================================================================
// MAILCHIMP/MANDRILL VERIFICATION
// =============================================================================

/**
 * Verify Mailchimp/Mandrill webhook signature
 * 
 * Mailchimp uses: HMAC-SHA1
 * Header: x-mandrill-signature
 * Payload: URL + sorted params
 */
export async function verifyMailchimpWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const config = getMailchimpConfig();
  const signature = request.headers['x-mandrill-signature'] as string | undefined;
  
  if (!signature) {
    logger.warn('Missing Mailchimp webhook signature header', {
      requestId: request.id,
      path: request.url
    });
    throw new InvalidWebhookSignatureError('mailchimp', request.id as string);
  }
  
  if (!config.webhookSecret) {
    logger.error('Mailchimp webhook secret not configured');
    if (isProduction()) {
      throw new InvalidWebhookSignatureError('mailchimp', request.id as string);
    }
    logger.warn('Allowing Mailchimp webhook without signature verification in non-production');
    request.webhookVerified = { valid: true, provider: 'mailchimp' };
    return;
  }
  
  try {
    // Build the signed string: URL + sorted params
    const protocol = request.protocol || 'https';
    const host = request.hostname;
    const path = request.url.split('?')[0];
    const url = `${protocol}://${host}${path}`;
    
    const params = request.body as Record<string, any> || {};
    
    // Sort parameters alphabetically and concatenate
    const sortedKeys = Object.keys(params).sort();
    const signedData = sortedKeys.reduce((acc, key) => {
      return acc + key + params[key];
    }, url);
    
    const computedSignature = crypto
      .createHmac('sha1', config.webhookSecret)
      .update(signedData)
      .digest('base64');
    
    // Timing-safe comparison
    if (!timingSafeCompare(signature, computedSignature)) {
      logger.warn('Invalid Mailchimp webhook signature', { requestId: request.id });
      throw new InvalidWebhookSignatureError('mailchimp', request.id as string);
    }
    
    request.webhookVerified = {
      valid: true,
      provider: 'mailchimp',
      eventType: params?.type
    };
    
    logger.info('Mailchimp webhook verified', {
      requestId: request.id,
      eventType: params?.type
    });
    
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      throw error;
    }
    logger.error('Mailchimp webhook verification error', {
      requestId: request.id,
      error: (error as Error).message
    });
    throw new InvalidWebhookSignatureError('mailchimp', request.id as string);
  }
}

// =============================================================================
// QUICKBOOKS VERIFICATION
// =============================================================================

/**
 * Verify QuickBooks webhook signature
 * 
 * QuickBooks uses: HMAC-SHA256 with verifier token
 * Header: intuit-signature
 * Also supports challenge verification
 */
export async function verifyQuickBooksWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const config = getQuickBooksConfig();
  const signature = request.headers['intuit-signature'] as string | undefined;
  
  // Handle challenge verification request
  const body = request.body as any;
  if (body?.eventNotifications === undefined && body?.challenge) {
    // This is a challenge verification request
    logger.info('QuickBooks webhook challenge request', { requestId: request.id });
    reply.send(body.challenge);
    return;
  }
  
  if (!signature) {
    logger.warn('Missing QuickBooks webhook signature header', {
      requestId: request.id,
      path: request.url
    });
    throw new InvalidWebhookSignatureError('quickbooks', request.id as string);
  }
  
  if (!config.webhookVerifierToken) {
    logger.error('QuickBooks webhook verifier token not configured');
    if (isProduction()) {
      throw new InvalidWebhookSignatureError('quickbooks', request.id as string);
    }
    logger.warn('Allowing QuickBooks webhook without signature verification in non-production');
    request.webhookVerified = { valid: true, provider: 'quickbooks' };
    return;
  }
  
  try {
    const rawBody = request.rawBody || Buffer.from(JSON.stringify(request.body));
    
    const computedSignature = crypto
      .createHmac('sha256', config.webhookVerifierToken)
      .update(rawBody)
      .digest('base64');
    
    // Timing-safe comparison
    if (!timingSafeCompare(signature, computedSignature)) {
      logger.warn('Invalid QuickBooks webhook signature', { requestId: request.id });
      throw new InvalidWebhookSignatureError('quickbooks', request.id as string);
    }
    
    request.webhookVerified = {
      valid: true,
      provider: 'quickbooks',
      eventId: body?.eventNotifications?.[0]?.dataChangeEvent?.entities?.[0]?.id
    };
    
    logger.info('QuickBooks webhook verified', {
      requestId: request.id,
      eventCount: body?.eventNotifications?.length
    });
    
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      throw error;
    }
    logger.error('QuickBooks webhook verification error', {
      requestId: request.id,
      error: (error as Error).message
    });
    throw new InvalidWebhookSignatureError('quickbooks', request.id as string);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create webhook verification middleware for a specific provider
 */
export function createWebhookVerifier(provider: WebhookProvider) {
  const verifiers: Record<WebhookProvider, (req: FastifyRequest, rep: FastifyReply) => Promise<void>> = {
    stripe: verifyStripeWebhook,
    square: verifySquareWebhook,
    mailchimp: verifyMailchimpWebhook,
    quickbooks: verifyQuickBooksWebhook
  };
  
  const verifier = verifiers[provider];
  
  if (!verifier) {
    throw new Error(`Unknown webhook provider: ${provider}`);
  }
  
  return verifier;
}

// =============================================================================
// RAW BODY CAPTURE
// =============================================================================

/**
 * Fastify hook to capture raw body for webhook signature verification
 * Must be registered before body parsing
 */
export function captureRawBody(
  request: FastifyRequest,
  _reply: FastifyReply,
  payload: Buffer,
  done: (err?: Error | null, body?: Buffer) => void
): void {
  // Store raw body for signature verification
  request.rawBody = payload;
  done(null, payload);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  verifyStripeWebhook,
  verifySquareWebhook,
  verifyMailchimpWebhook,
  verifyQuickBooksWebhook,
  createWebhookVerifier,
  captureRawBody,
  timingSafeCompare
};
