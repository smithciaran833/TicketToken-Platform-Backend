import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'dev-internal-service-secret-change-in-production';
const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || INTERNAL_SECRET;
const SERVICE_NAME = 'api-gateway';
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';

/**
 * Generate internal service authentication headers
 * These headers allow downstream services to verify requests came from the gateway
 *
 * Phase A HMAC Standardization: Now supports both legacy and new HMAC formats
 * - Legacy: x-internal-service, x-internal-timestamp, x-internal-signature
 * - New: adds x-internal-nonce, x-internal-body-hash for replay attack prevention
 */
export function generateInternalAuthHeaders(
  method: string,
  url: string,
  body?: any
): Record<string, string> {
  const timestamp = Date.now().toString();
  const bodyStr = JSON.stringify(body || {});

  if (USE_NEW_HMAC) {
    // New standardized HMAC format with nonce and body hash
    const nonce = uuidv4();
    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');

    // Payload format: service:timestamp:nonce:method:path:bodyHash
    const payload = `${SERVICE_NAME}:${timestamp}:${nonce}:${method}:${url}:${bodyHash}`;
    const signature = crypto
      .createHmac('sha256', INTERNAL_HMAC_SECRET)
      .update(payload)
      .digest('hex');

    return {
      'x-internal-service': SERVICE_NAME,
      'x-internal-timestamp': timestamp,
      'x-internal-nonce': nonce,
      'x-internal-signature': signature,
      'x-internal-body-hash': bodyHash,
    };
  }

  // Legacy format (for backward compatibility)
  const payload = `${SERVICE_NAME}:${timestamp}:${method}:${url}:${bodyStr}`;
  const signature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(payload)
    .digest('hex');

  return {
    'x-internal-service': SERVICE_NAME,
    'x-internal-timestamp': timestamp,
    'x-internal-signature': signature
  };
}

/**
 * Verify an internal service signature (if gateway needs to receive internal calls)
 */
export function verifyInternalSignature(
  serviceName: string,
  timestamp: string,
  signature: string,
  method: string,
  url: string,
  body?: any
): boolean {
  // Check timestamp is within 5 minutes
  const requestTime = parseInt(timestamp, 10);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);
  
  if (isNaN(requestTime) || timeDiff > 5 * 60 * 1000) {
    return false;
  }

  // Recreate and verify signature
  const payload = `${serviceName}:${timestamp}:${method}:${url}:${JSON.stringify(body || {})}`;
  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_SECRET)
    .update(payload)
    .digest('hex');

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}
