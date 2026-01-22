/**
 * HMAC Errors
 *
 * Custom error classes for HMAC authentication failures.
 */

import { HmacErrorCode } from './types';

/**
 * Base error for HMAC authentication failures
 */
export class HmacError extends Error {
  constructor(
    message: string,
    public readonly code: HmacErrorCode,
    public readonly statusCode: number = 401
  ) {
    super(message);
    this.name = 'HmacError';
    Object.setPrototypeOf(this, HmacError.prototype);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };
  }
}

/**
 * Error thrown when a replay attack is detected
 */
export class ReplayAttackError extends HmacError {
  constructor(
    public readonly nonce: string,
    public readonly serviceName: string
  ) {
    super(
      `Replay attack detected: nonce ${nonce} has already been used by ${serviceName}`,
      'NONCE_REUSED',
      401
    );
    this.name = 'ReplayAttackError';
    Object.setPrototypeOf(this, ReplayAttackError.prototype);
  }
}

/**
 * Error thrown when timestamp is outside valid window
 */
export class TimestampError extends HmacError {
  constructor(
    public readonly timestamp: number,
    public readonly serverTime: number,
    public readonly windowMs: number,
    isFuture: boolean = false
  ) {
    const diff = Math.abs(serverTime - timestamp);
    super(
      isFuture
        ? `Timestamp is ${diff}ms in the future (max allowed: ${windowMs}ms)`
        : `Timestamp expired: ${diff}ms ago (max allowed: ${windowMs}ms)`,
      isFuture ? 'TIMESTAMP_FUTURE' : 'TIMESTAMP_EXPIRED',
      401
    );
    this.name = 'TimestampError';
    Object.setPrototypeOf(this, TimestampError.prototype);
  }
}

/**
 * Error thrown when signature is invalid
 */
export class SignatureError extends HmacError {
  constructor(
    public readonly serviceName: string,
    public readonly path: string
  ) {
    super(
      `Invalid HMAC signature for ${serviceName} request to ${path}`,
      'INVALID_SIGNATURE',
      401
    );
    this.name = 'SignatureError';
    Object.setPrototypeOf(this, SignatureError.prototype);
  }
}

/**
 * Error thrown when required headers are missing
 */
export class MissingHeadersError extends HmacError {
  constructor(public readonly missingHeaders: string[]) {
    super(
      `Missing required HMAC headers: ${missingHeaders.join(', ')}`,
      'MISSING_HEADERS',
      400
    );
    this.name = 'MissingHeadersError';
    Object.setPrototypeOf(this, MissingHeadersError.prototype);
  }
}
