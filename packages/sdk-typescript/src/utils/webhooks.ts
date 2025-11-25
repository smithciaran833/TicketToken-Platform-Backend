import crypto from 'crypto';

export interface WebhookEvent<T = any> {
  id: string;
  type: string;
  data: T;
  timestamp: string;
}

export interface WebhookVerificationOptions {
  secret: string;
  tolerance?: number; // Tolerance in seconds for timestamp validation
}

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class WebhookVerifier {
  constructor(private secret: string, private tolerance: number = 300) {}

  /**
   * Verify webhook signature using HMAC SHA256
   */
  verify(
    payload: string | Buffer,
    signature: string,
    timestamp?: string
  ): boolean {
    // Verify timestamp if provided
    if (timestamp && this.tolerance > 0) {
      const now = Math.floor(Date.now() / 1000);
      const eventTime = parseInt(timestamp, 10);
      
      if (isNaN(eventTime)) {
        throw new WebhookSignatureError('Invalid timestamp format');
      }
      
      if (Math.abs(now - eventTime) > this.tolerance) {
        throw new WebhookSignatureError('Timestamp outside tolerance');
      }
    }

    // Compute expected signature
    const signedPayload = timestamp ? `${timestamp}.${payload}` : payload;
    const expectedSignature = this.computeSignature(signedPayload);

    // Compare signatures (constant-time comparison)
    return this.secureCompare(expectedSignature, signature);
  }

  /**
   * Compute HMAC SHA256 signature
   */
  private computeSignature(payload: string | Buffer): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

/**
 * Parse and verify a webhook event
 */
export function verifyWebhook<T = any>(
  payload: string | Buffer,
  signature: string,
  options: WebhookVerificationOptions,
  timestamp?: string
): WebhookEvent<T> {
  const verifier = new WebhookVerifier(options.secret, options.tolerance);
  
  if (!verifier.verify(payload, signature, timestamp)) {
    throw new WebhookSignatureError('Invalid webhook signature');
  }

  try {
    const payloadString = typeof payload === 'string' ? payload : payload.toString('utf8');
    return JSON.parse(payloadString) as WebhookEvent<T>;
  } catch (error) {
    throw new WebhookSignatureError('Invalid webhook payload');
  }
}

/**
 * Construct a webhook event (for testing or sending)
 */
export function constructWebhookEvent<T = any>(
  type: string,
  data: T,
  secret: string
): { event: WebhookEvent<T>; signature: string; timestamp: string } {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const event: WebhookEvent<T> = {
    id: crypto.randomBytes(16).toString('hex'),
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  const payload = JSON.stringify(event);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  return { event, signature, timestamp };
}
