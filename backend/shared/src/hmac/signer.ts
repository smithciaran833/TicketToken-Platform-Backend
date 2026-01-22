/**
 * HMAC Signer
 *
 * Generates HMAC-SHA256 signatures for service-to-service requests.
 */

import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { HmacConfig, HmacHeaders, HmacPayloadComponents, HMAC_HEADER_NAMES } from './types';
import { createHmacConfig } from './config';

/**
 * HMAC Signer Class
 *
 * Usage:
 * ```typescript
 * const signer = new HmacSigner({ secret: 'my-secret', serviceName: 'payment-service' });
 * const headers = signer.sign('POST', '/internal/payments', { amount: 100 });
 * ```
 */
export class HmacSigner {
  private readonly config: HmacConfig;

  constructor(config?: Partial<HmacConfig>) {
    this.config = createHmacConfig(config);
  }

  /**
   * Create a SHA-256 hash of the request body
   */
  public createBodyHash(body: unknown): string {
    if (body === undefined || body === null) {
      return '';
    }

    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
    return crypto.createHash('sha256').update(bodyString).digest('hex');
  }

  /**
   * Build the payload string for HMAC signature
   * Format: serviceName:timestamp:nonce:method:path:bodyHash
   */
  public buildPayload(components: HmacPayloadComponents): string {
    return [
      components.serviceName,
      components.timestamp.toString(),
      components.nonce,
      components.method.toUpperCase(),
      components.path,
      components.bodyHash,
    ].join(':');
  }

  /**
   * Generate HMAC-SHA256 signature
   */
  public generateSignature(payload: string): string {
    return crypto.createHmac(this.config.algorithm!, this.config.secret).update(payload).digest('hex');
  }

  /**
   * Sign a request and return headers
   *
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - Request path (e.g., /internal/tickets/123)
   * @param body - Request body (optional)
   * @returns Headers to include in the request
   */
  public sign(method: string, path: string, body?: unknown): HmacHeaders {
    const timestamp = Date.now();
    const nonce = uuidv4();
    const bodyHash = this.createBodyHash(body);

    const payload = this.buildPayload({
      serviceName: this.config.serviceName,
      timestamp,
      nonce,
      method,
      path,
      bodyHash,
    });

    const signature = this.generateSignature(payload);

    const headers: HmacHeaders = {
      [HMAC_HEADER_NAMES.SERVICE]: this.config.serviceName,
      [HMAC_HEADER_NAMES.TIMESTAMP]: timestamp.toString(),
      [HMAC_HEADER_NAMES.NONCE]: nonce,
      [HMAC_HEADER_NAMES.SIGNATURE]: signature,
    };

    // Include body hash if body is present
    if (bodyHash) {
      headers[HMAC_HEADER_NAMES.BODY_HASH] = bodyHash;
    }

    return headers;
  }

  /**
   * Build complete headers for internal service call
   * Combines HMAC headers with standard internal headers
   */
  public buildHeaders(
    method: string,
    path: string,
    body: unknown,
    context: {
      tenantId: string;
      userId?: string;
      traceId?: string;
    }
  ): Record<string, string> {
    const hmacHeaders = this.sign(method, path, body);

    return {
      ...hmacHeaders,
      'X-Tenant-ID': context.tenantId,
      'X-Internal-Service': 'true',
      ...(context.userId && { 'X-User-ID': context.userId }),
      ...(context.traceId && { 'X-Trace-ID': context.traceId }),
      'X-Calling-Service': this.config.serviceName,
    };
  }
}

// Default signer instance (lazy initialization)
let defaultSigner: HmacSigner | null = null;

/**
 * Get the default HMAC signer
 */
export function getHmacSigner(): HmacSigner {
  if (!defaultSigner) {
    defaultSigner = new HmacSigner();
  }
  return defaultSigner;
}

/**
 * Create a new HMAC signer with custom config
 */
export function createHmacSigner(config?: Partial<HmacConfig>): HmacSigner {
  return new HmacSigner(config);
}

/**
 * Convenience function to sign a request
 */
export function signRequest(
  method: string,
  path: string,
  body?: unknown,
  config?: Partial<HmacConfig>
): HmacHeaders {
  const signer = config ? createHmacSigner(config) : getHmacSigner();
  return signer.sign(method, path, body);
}
