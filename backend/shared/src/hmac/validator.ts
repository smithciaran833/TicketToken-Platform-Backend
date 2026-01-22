/**
 * HMAC Validator
 *
 * Server-side validation of HMAC-signed service-to-service requests.
 * Implements timing-safe comparison, replay attack prevention, and timestamp validation.
 */

import * as crypto from 'crypto';
import { HmacConfig, HmacValidationResult, HmacPayloadComponents, HMAC_HEADER_NAMES } from './types';
import { createHmacConfig } from './config';
import { getNonceStore, NonceStore } from './nonce-store';
import {
  HmacError,
  ReplayAttackError,
  TimestampError,
  SignatureError,
  MissingHeadersError,
} from './errors';

/**
 * Request headers interface for validation
 */
export interface RequestHeaders {
  [key: string]: string | string[] | undefined;
}

/**
 * HMAC Validator Class
 *
 * Usage:
 * ```typescript
 * const validator = new HmacValidator({ secret: 'my-secret' });
 * const result = await validator.validate(headers, 'POST', '/internal/payments', body);
 * if (!result.valid) {
 *   throw new Error(result.error);
 * }
 * ```
 */
export class HmacValidator {
  private readonly config: HmacConfig;
  private readonly nonceStore: NonceStore;

  constructor(config?: Partial<HmacConfig>, nonceStore?: NonceStore) {
    this.config = createHmacConfig(config);
    this.nonceStore = nonceStore ?? getNonceStore();
  }

  /**
   * Get header value (handles case-insensitive headers)
   */
  private getHeader(headers: RequestHeaders, name: string): string | undefined {
    // Try exact match first
    const value = headers[name] || headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  /**
   * Extract all required HMAC headers from request
   */
  public extractHeaders(
    headers: RequestHeaders
  ): { serviceName: string; timestamp: string; nonce: string; signature: string; bodyHash?: string } | null {
    const serviceName = this.getHeader(headers, HMAC_HEADER_NAMES.SERVICE);
    const timestamp = this.getHeader(headers, HMAC_HEADER_NAMES.TIMESTAMP);
    const nonce = this.getHeader(headers, HMAC_HEADER_NAMES.NONCE);
    const signature = this.getHeader(headers, HMAC_HEADER_NAMES.SIGNATURE);
    const bodyHash = this.getHeader(headers, HMAC_HEADER_NAMES.BODY_HASH);

    const missingHeaders: string[] = [];
    if (!serviceName) missingHeaders.push(HMAC_HEADER_NAMES.SERVICE);
    if (!timestamp) missingHeaders.push(HMAC_HEADER_NAMES.TIMESTAMP);
    if (!nonce) missingHeaders.push(HMAC_HEADER_NAMES.NONCE);
    if (!signature) missingHeaders.push(HMAC_HEADER_NAMES.SIGNATURE);

    if (missingHeaders.length > 0) {
      return null;
    }

    return { serviceName: serviceName!, timestamp: timestamp!, nonce: nonce!, signature: signature!, bodyHash };
  }

  /**
   * Validate timestamp is within replay window
   */
  public validateTimestamp(timestamp: number): void {
    const now = Date.now();
    const diff = now - timestamp;
    const windowMs = this.config.replayWindowMs!;

    // Check if timestamp is too old
    if (diff > windowMs) {
      throw new TimestampError(timestamp, now, windowMs, false);
    }

    // Check if timestamp is in the future (with small tolerance for clock skew)
    if (diff < -windowMs) {
      throw new TimestampError(timestamp, now, windowMs, true);
    }
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
   * Build the payload string for HMAC signature verification
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
   * Generate expected HMAC-SHA256 signature
   */
  public generateSignature(payload: string): string {
    return crypto.createHmac(this.config.algorithm!, this.config.secret).update(payload).digest('hex');
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  public timingSafeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Validate HMAC signature
   */
  public validateSignature(
    expectedSignature: string,
    actualSignature: string,
    serviceName: string,
    path: string
  ): void {
    if (!this.timingSafeCompare(expectedSignature, actualSignature)) {
      throw new SignatureError(serviceName, path);
    }
  }

  /**
   * Validate body hash matches
   */
  public validateBodyHash(expectedHash: string, actualHash: string | undefined, hasBody: boolean): void {
    // If body is present and requireBodyHash is enabled, body hash must be provided
    if (hasBody && this.config.requireBodyHash && !actualHash) {
      throw new HmacError('Body hash required but not provided', 'BODY_HASH_MISMATCH', 400);
    }

    // If body hash is provided, validate it matches
    if (actualHash && expectedHash !== actualHash) {
      throw new HmacError('Body hash mismatch', 'BODY_HASH_MISMATCH', 400);
    }
  }

  /**
   * Check nonce for replay attack
   */
  public async checkNonce(nonce: string, serviceName: string): Promise<void> {
    const isUsed = await this.nonceStore.isNonceUsed(nonce, serviceName);
    if (isUsed) {
      throw new ReplayAttackError(nonce, serviceName);
    }
  }

  /**
   * Validate a complete HMAC-signed request
   *
   * @param headers - Request headers
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - Request path (e.g., /internal/tickets/123)
   * @param body - Request body (optional)
   * @returns Validation result
   */
  public async validate(
    headers: RequestHeaders,
    method: string,
    path: string,
    body?: unknown
  ): Promise<HmacValidationResult> {
    try {
      // Step 1: Extract headers
      const extracted = this.extractHeaders(headers);
      if (!extracted) {
        const missingHeaders: string[] = [];
        if (!this.getHeader(headers, HMAC_HEADER_NAMES.SERVICE)) missingHeaders.push(HMAC_HEADER_NAMES.SERVICE);
        if (!this.getHeader(headers, HMAC_HEADER_NAMES.TIMESTAMP)) missingHeaders.push(HMAC_HEADER_NAMES.TIMESTAMP);
        if (!this.getHeader(headers, HMAC_HEADER_NAMES.NONCE)) missingHeaders.push(HMAC_HEADER_NAMES.NONCE);
        if (!this.getHeader(headers, HMAC_HEADER_NAMES.SIGNATURE)) missingHeaders.push(HMAC_HEADER_NAMES.SIGNATURE);
        throw new MissingHeadersError(missingHeaders);
      }

      const { serviceName, timestamp, nonce, signature, bodyHash } = extracted;

      // Step 2: Parse and validate timestamp
      const timestampNum = parseInt(timestamp, 10);
      if (isNaN(timestampNum)) {
        throw new HmacError('Invalid timestamp format', 'INVALID_TIMESTAMP', 400);
      }
      this.validateTimestamp(timestampNum);

      // Step 3: Validate nonce format
      if (!nonce || nonce.length < 16) {
        throw new HmacError('Invalid nonce format', 'INVALID_NONCE', 400);
      }

      // Step 4: Check for replay attack (atomic check-and-mark)
      await this.checkNonce(nonce, serviceName);

      // Step 5: Compute and validate body hash
      const expectedBodyHash = this.createBodyHash(body);
      const hasBody = body !== undefined && body !== null;
      this.validateBodyHash(expectedBodyHash, bodyHash, hasBody);

      // Step 6: Build payload and verify signature
      const payload = this.buildPayload({
        serviceName,
        timestamp: timestampNum,
        nonce,
        method,
        path,
        bodyHash: expectedBodyHash,
      });

      const expectedSignature = this.generateSignature(payload);
      this.validateSignature(expectedSignature, signature, serviceName, path);

      // All checks passed
      return {
        valid: true,
        serviceName,
        timestamp: timestampNum,
        nonce,
      };
    } catch (error) {
      if (error instanceof HmacError) {
        return {
          valid: false,
          error: error.message,
          errorCode: error.code,
        };
      }

      // Unexpected error
      console.error('[HmacValidator] Unexpected error during validation:', error);
      return {
        valid: false,
        error: 'Internal validation error',
        errorCode: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Validate and throw on failure (for middleware use)
   */
  public async validateOrThrow(
    headers: RequestHeaders,
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ serviceName: string; timestamp: number; nonce: string }> {
    // Step 1: Extract headers
    const extracted = this.extractHeaders(headers);
    if (!extracted) {
      const missingHeaders: string[] = [];
      if (!this.getHeader(headers, HMAC_HEADER_NAMES.SERVICE)) missingHeaders.push(HMAC_HEADER_NAMES.SERVICE);
      if (!this.getHeader(headers, HMAC_HEADER_NAMES.TIMESTAMP)) missingHeaders.push(HMAC_HEADER_NAMES.TIMESTAMP);
      if (!this.getHeader(headers, HMAC_HEADER_NAMES.NONCE)) missingHeaders.push(HMAC_HEADER_NAMES.NONCE);
      if (!this.getHeader(headers, HMAC_HEADER_NAMES.SIGNATURE)) missingHeaders.push(HMAC_HEADER_NAMES.SIGNATURE);
      throw new MissingHeadersError(missingHeaders);
    }

    const { serviceName, timestamp, nonce, signature, bodyHash } = extracted;

    // Step 2: Parse and validate timestamp
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      throw new HmacError('Invalid timestamp format', 'INVALID_TIMESTAMP', 400);
    }
    this.validateTimestamp(timestampNum);

    // Step 3: Validate nonce format
    if (!nonce || nonce.length < 16) {
      throw new HmacError('Invalid nonce format', 'INVALID_NONCE', 400);
    }

    // Step 4: Check for replay attack
    await this.checkNonce(nonce, serviceName);

    // Step 5: Compute and validate body hash
    const expectedBodyHash = this.createBodyHash(body);
    const hasBody = body !== undefined && body !== null;
    this.validateBodyHash(expectedBodyHash, bodyHash, hasBody);

    // Step 6: Build payload and verify signature
    const payload = this.buildPayload({
      serviceName,
      timestamp: timestampNum,
      nonce,
      method,
      path,
      bodyHash: expectedBodyHash,
    });

    const expectedSignature = this.generateSignature(payload);
    this.validateSignature(expectedSignature, signature, serviceName, path);

    return { serviceName, timestamp: timestampNum, nonce };
  }
}

// Default validator instance (lazy initialization)
let defaultValidator: HmacValidator | null = null;

/**
 * Get the default HMAC validator
 */
export function getHmacValidator(): HmacValidator {
  if (!defaultValidator) {
    defaultValidator = new HmacValidator();
  }
  return defaultValidator;
}

/**
 * Create a new HMAC validator with custom config
 */
export function createHmacValidator(config?: Partial<HmacConfig>, nonceStore?: NonceStore): HmacValidator {
  return new HmacValidator(config, nonceStore);
}

/**
 * Convenience function to validate a request
 */
export async function validateRequest(
  headers: RequestHeaders,
  method: string,
  path: string,
  body?: unknown,
  config?: Partial<HmacConfig>
): Promise<HmacValidationResult> {
  const validator = config ? createHmacValidator(config) : getHmacValidator();
  return validator.validate(headers, method, path, body);
}
