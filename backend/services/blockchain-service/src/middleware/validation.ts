import { FastifyRequest, FastifyReply } from 'fastify';
import { PublicKey } from '@solana/web3.js';
import { logger } from '../utils/logger';

/**
 * Validate Solana address format
 */
export function isValidSolanaAddress(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate transaction signature format
 */
export function isValidSignature(signature: string): boolean {
  if (!signature || typeof signature !== 'string') {
    return false;
  }

  // Solana signatures are base58 encoded and typically 88 characters
  return /^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(signature);
}

/**
 * Sanitize string input to prevent injection attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove potential dangerous characters
  return input
    .replace(/[<>\"']/g, '')
    .trim()
    .slice(0, 500); // Max length
}

/**
 * Validate and sanitize address parameter
 */
export async function validateAddressParam(
  request: FastifyRequest<{ Params: { address: string } }>,
  reply: FastifyReply
) {
  const { address } = request.params;

  if (!isValidSolanaAddress(address)) {
    logger.warn('Invalid Solana address', {
      address,
      path: request.url,
      ip: request.ip
    });
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid Solana address format'
    });
  }
}

/**
 * Validate and sanitize signature parameter
 */
export async function validateSignatureParam(
  request: FastifyRequest<{ Params: { signature: string } }>,
  reply: FastifyReply
) {
  const { signature } = request.params;

  if (!isValidSignature(signature)) {
    logger.warn('Invalid transaction signature', {
      signature,
      path: request.url,
      ip: request.ip
    });
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid transaction signature format'
    });
  }
}

/**
 * Validate mint address parameter
 */
export async function validateMintParam(
  request: FastifyRequest<{ Params: { mint: string } }>,
  reply: FastifyReply
) {
  const { mint } = request.params;

  if (!isValidSolanaAddress(mint)) {
    logger.warn('Invalid mint address', {
      mint,
      path: request.url,
      ip: request.ip
    });
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Invalid mint address format'
    });
  }
}

/**
 * Validate query parameters
 */
export async function validateQueryParams(
  request: FastifyRequest<{ Querystring: { limit?: string } }>,
  reply: FastifyReply
) {
  const { limit } = request.query;

  if (limit !== undefined) {
    const limitNum = parseInt(limit, 10);
    
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      logger.warn('Invalid limit parameter', {
        limit,
        path: request.url,
        ip: request.ip
      });
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Limit must be between 1 and 100'
      });
    }
  }
}

/**
 * Validate mint request body
 */
export async function validateMintRequest(
  request: FastifyRequest<{
    Body: {
      ticketIds?: any;
      eventId?: any;
      userId?: any;
      queue?: any;
    };
  }>,
  reply: FastifyReply
) {
  const body = request.body;

  if (!body) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Request body is required'
    });
  }

  // Validate ticketIds
  if (!body.ticketIds || !Array.isArray(body.ticketIds) || body.ticketIds.length === 0) {
    logger.warn('Invalid ticketIds in mint request', {
      body,
      path: request.url,
      ip: request.ip
    });
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'ticketIds must be a non-empty array'
    });
  }

  // Validate ticketIds are strings
  if (!body.ticketIds.every((id: any) => typeof id === 'string')) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'All ticketIds must be strings'
    });
  }

  // Validate eventId
  if (!body.eventId || typeof body.eventId !== 'string') {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'eventId is required and must be a string'
    });
  }

  // Validate userId
  if (!body.userId || typeof body.userId !== 'string') {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'userId is required and must be a string'
    });
  }

  // Validate queue (optional)
  if (body.queue && typeof body.queue !== 'string') {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'queue must be a string'
    });
  }
}

/**
 * Validate transaction confirmation request body
 */
export async function validateConfirmationRequest(
  request: FastifyRequest<{
    Body: {
      signature?: any;
      commitment?: any;
      timeout?: any;
    };
  }>,
  reply: FastifyReply
) {
  const body = request.body;

  if (!body) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Request body is required'
    });
  }

  // Validate signature
  if (!body.signature || !isValidSignature(body.signature)) {
    logger.warn('Invalid signature in confirmation request', {
      signature: body.signature,
      path: request.url,
      ip: request.ip
    });
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Valid signature is required'
    });
  }

  // Validate commitment (optional)
  if (body.commitment) {
    const validCommitments = ['processed', 'confirmed', 'finalized'];
    if (!validCommitments.includes(body.commitment)) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'commitment must be one of: processed, confirmed, finalized'
      });
    }
  }

  // Validate timeout (optional)
  if (body.timeout !== undefined) {
    const timeout = parseInt(body.timeout, 10);
    if (isNaN(timeout) || timeout < 1000 || timeout > 120000) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'timeout must be between 1000 and 120000 milliseconds'
      });
    }
  }
}

export default {
  validateAddressParam,
  validateSignatureParam,
  validateMintParam,
  validateQueryParams,
  validateMintRequest,
  validateConfirmationRequest,
  isValidSolanaAddress,
  isValidSignature,
  sanitizeString
};
