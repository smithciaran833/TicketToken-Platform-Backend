import crypto from 'crypto';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'dev-internal-service-secret-change-in-production';
const SERVICE_NAME = 'api-gateway';

/**
 * Generate internal service authentication headers
 * These headers allow downstream services to verify requests came from the gateway
 */
export function generateInternalAuthHeaders(
  method: string,
  url: string,
  body?: any
): Record<string, string> {
  const timestamp = Date.now().toString();
  
  // Create payload to sign (must match what downstream services expect)
  const payload = `${SERVICE_NAME}:${timestamp}:${method}:${url}:${JSON.stringify(body || {})}`;
  
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
