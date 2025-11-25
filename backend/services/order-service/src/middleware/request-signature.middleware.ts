/**
 * Request Signature Middleware
 * Validates HMAC signatures on incoming requests
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { RequestSigningService } from '../services/request-signing.service';
import { APIKeyManagementService } from '../services/api-key-management.service';
import { logger } from '../utils/logger';
import { Pool } from 'pg';

const requestSigningService = new RequestSigningService();
// Note: Pool should be injected or imported from a shared instance
let apiKeyService: APIKeyManagementService;

interface SignatureHeaders {
  'x-signature': string;
  'x-api-key': string;
}

/**
 * Middleware to verify request signatures
 */
export async function verifyRequestSignature(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const headers = request.headers as unknown as SignatureHeaders;
    const signatureHeader = headers['x-signature'];
    const apiKey = headers['x-api-key'];

    // Check if signature header is present
    if (!signatureHeader) {
      return reply.status(401).send({
        error: 'Missing signature header',
        code: 'MISSING_SIGNATURE',
      });
    }

    // Check if API key is present
    if (!apiKey) {
      return reply.status(401).send({
        error: 'Missing API key',
        code: 'MISSING_API_KEY',
      });
    }

    // Parse signature components
    const components = requestSigningService.parseSignatureHeader(signatureHeader);
    if (!components) {
      return reply.status(401).send({
        error: 'Invalid signature format',
        code: 'INVALID_SIGNATURE_FORMAT',
      });
    }

    // Validate API key and get secret
    const keyValidation = await apiKeyService.validateAPIKey(apiKey);
    if (!keyValidation.valid || !keyValidation.keyInfo) {
      logger.warn('Invalid API key in request', {
        reason: keyValidation.reason,
        path: request.url,
      });
      return reply.status(401).send({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
        reason: keyValidation.reason,
      });
    }

    // Get secret for signature verification (would normally be stored securely)
    const secret = process.env.API_SECRET || 'default-secret';

    // Verify signature
    const requestData = {
      method: request.method,
      path: request.url,
      body: request.body,
      query: request.query as Record<string, any>,
    };

    const signatureValidation = requestSigningService.verifySignature(
      secret,
      requestData,
      components.timestamp,
      components.nonce,
      components.signature
    );

    if (!signatureValidation.valid) {
      logger.warn('Request signature verification failed', {
        userId: keyValidation.keyInfo.userId,
        path: request.url,
        reason: signatureValidation.reason,
      });
      return reply.status(401).send({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
        reason: signatureValidation.reason,
      });
    }

    // Attach key info to request for downstream use
    (request as any).apiKeyInfo = keyValidation.keyInfo;

    logger.debug('Request signature verified', {
      userId: keyValidation.keyInfo.userId,
      keyId: keyValidation.keyInfo.keyId,
      path: request.url,
    });

  } catch (error) {
    logger.error('Error in signature verification middleware', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: request.url,
    });
    return reply.status(500).send({
      error: 'Internal server error',
      code: 'SIGNATURE_VERIFICATION_ERROR',
    });
  }
}

/**
 * Optional middleware - only verify signature if present
 */
export async function verifyRequestSignatureOptional(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const headers = request.headers as unknown as SignatureHeaders;
  const signatureHeader = headers['x-signature'];

  // If no signature header, skip verification
  if (!signatureHeader) {
    return;
  }

  // Otherwise, verify signature
  return verifyRequestSignature(request, reply);
}

export default {
  verifyRequestSignature,
  verifyRequestSignatureOptional,
};
