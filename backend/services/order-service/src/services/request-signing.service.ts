/**
 * Request Signing Service
 * Implements HMAC-based request signing for API security
 */

import * as crypto from 'crypto';
import { logger } from '../utils/logger';
import { securityConfig } from '../config/security.config';

interface SignatureComponents {
  timestamp: string;
  nonce: string;
  signature: string;
}

interface RequestData {
  method: string;
  path: string;
  body?: any;
  query?: Record<string, any>;
}

export class RequestSigningService {
  private algorithm: string;
  private timestampTolerance: number;

  constructor() {
    this.algorithm = securityConfig.api.requestSigning.algorithm;
    this.timestampTolerance = securityConfig.api.requestSigning.timestampToleranceSeconds;
  }

  /**
   * Sign a request
   */
  signRequest(
    secret: string,
    requestData: RequestData
  ): SignatureComponents {
    const timestamp = Date.now().toString();
    const nonce = this.generateNonce();

    const stringToSign = this.buildStringToSign(
      requestData.method,
      requestData.path,
      requestData.body,
      requestData.query,
      timestamp,
      nonce
    );

    const signature = this.createSignature(secret, stringToSign);

    return {
      timestamp,
      nonce,
      signature,
    };
  }

  /**
   * Verify request signature
   */
  verifySignature(
    secret: string,
    requestData: RequestData,
    timestamp: string,
    nonce: string,
    signature: string
  ): {
    valid: boolean;
    reason?: string;
  } {
    // Check timestamp validity
    const now = Date.now();
    const requestTime = parseInt(timestamp);

    if (isNaN(requestTime)) {
      return { valid: false, reason: 'Invalid timestamp format' };
    }

    const timeDiff = Math.abs(now - requestTime) / 1000;
    if (timeDiff > this.timestampTolerance) {
      logger.warn('Request signature timestamp out of tolerance', {
        timeDiff,
        tolerance: this.timestampTolerance,
      });
      return { valid: false, reason: 'Timestamp out of tolerance' };
    }

    // Reconstruct string to sign
    const stringToSign = this.buildStringToSign(
      requestData.method,
      requestData.path,
      requestData.body,
      requestData.query,
      timestamp,
      nonce
    );

    // Verify signature
    const expectedSignature = this.createSignature(secret, stringToSign);

    if (!this.constantTimeCompare(signature, expectedSignature)) {
      logger.warn('Request signature verification failed', {
        method: requestData.method,
        path: requestData.path,
      });
      return { valid: false, reason: 'Invalid signature' };
    }

    return { valid: true };
  }

  /**
   * Sign webhook payload
   */
  signWebhook(secret: string, payload: any): string {
    const timestamp = Date.now().toString();
    const stringToSign = `${timestamp}.${JSON.stringify(payload)}`;
    return this.createSignature(secret, stringToSign);
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    secret: string,
    payload: any,
    timestamp: string,
    signature: string
  ): {
    valid: boolean;
    reason?: string;
  } {
    // Check timestamp
    const now = Date.now();
    const webhookTime = parseInt(timestamp);

    if (isNaN(webhookTime)) {
      return { valid: false, reason: 'Invalid timestamp' };
    }

    const timeDiff = Math.abs(now - webhookTime) / 1000;
    if (timeDiff > this.timestampTolerance) {
      return { valid: false, reason: 'Timestamp expired' };
    }

    // Verify signature
    const stringToSign = `${timestamp}.${JSON.stringify(payload)}`;
    const expectedSignature = this.createSignature(secret, stringToSign);

    if (!this.constantTimeCompare(signature, expectedSignature)) {
      return { valid: false, reason: 'Invalid signature' };
    }

    return { valid: true };
  }

  /**
   * Build canonical string to sign
   */
  private buildStringToSign(
    method: string,
    path: string,
    body: any,
    query: Record<string, any> | undefined,
    timestamp: string,
    nonce: string
  ): string {
    const parts: string[] = [
      method.toUpperCase(),
      path,
      timestamp,
      nonce,
    ];

    // Add query parameters in sorted order
    if (query && Object.keys(query).length > 0) {
      const sortedQuery = Object.keys(query)
        .sort()
        .map(key => `${key}=${query[key]}`)
        .join('&');
      parts.push(sortedQuery);
    }

    // Add body hash if present
    if (body) {
      const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
      const bodyHash = crypto
        .createHash('sha256')
        .update(bodyString)
        .digest('hex');
      parts.push(bodyHash);
    }

    return parts.join('\n');
  }

  /**
   * Create HMAC signature
   */
  private createSignature(secret: string, data: string): string {
    return crypto
      .createHmac(this.algorithm, secret)
      .update(data)
      .digest('hex');
  }

  /**
   * Generate cryptographically secure nonce
   */
  private generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Extract signature components from header
   */
  parseSignatureHeader(header: string): SignatureComponents | null {
    try {
      const parts = header.split(',').reduce((acc, part) => {
        const [key, value] = part.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      if (!parts.timestamp || !parts.nonce || !parts.signature) {
        return null;
      }

      return {
        timestamp: parts.timestamp,
        nonce: parts.nonce,
        signature: parts.signature,
      };
    } catch (error) {
      logger.error('Failed to parse signature header', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Format signature components into header
   */
  formatSignatureHeader(components: SignatureComponents): string {
    return `timestamp=${components.timestamp},nonce=${components.nonce},signature=${components.signature}`;
  }
}

