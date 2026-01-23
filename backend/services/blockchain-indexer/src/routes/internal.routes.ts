/**
 * Internal Routes - blockchain-indexer
 *
 * For service-to-service communication only.
 * These endpoints provide blockchain data to other services
 * (payment-service, marketplace-service, ticket-service, etc.)
 *
 * Phase A HMAC Standardization - Decision #2 Implementation
 *
 * Endpoints:
 * - POST /internal/marketplace/sales - Record marketplace sale event
 * - GET /internal/nfts/:tokenId - Get NFT metadata and ownership
 * - GET /internal/transactions/:txHash - Get transaction details
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as crypto from 'crypto';
import logger from '../utils/logger';
import { NFTMetadata } from '../models/nft-metadata.model';
import { MarketplaceEvent } from '../models/marketplace-event.model';
import { BlockchainTransaction } from '../models/blockchain-transaction.model';

const log = logger.child({ component: 'InternalRoutes' });

// Internal authentication configuration
const INTERNAL_HMAC_SECRET = process.env.INTERNAL_HMAC_SECRET || process.env.INTERNAL_SERVICE_SECRET;
const USE_NEW_HMAC = process.env.USE_NEW_HMAC === 'true';

// CRITICAL: Fail hard in production if secret is not set
if (!INTERNAL_HMAC_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('INTERNAL_HMAC_SECRET must be set in production');
}

if (!INTERNAL_HMAC_SECRET) {
  log.warn('INTERNAL_HMAC_SECRET not set - internal routes will be disabled');
}

// Allowed services that can call internal endpoints
const ALLOWED_SERVICES = new Set(
  (process.env.ALLOWED_INTERNAL_SERVICES || 'api-gateway,payment-service,order-service,event-service,ticket-service,venue-service,notification-service,transfer-service,minting-service,blockchain-service,marketplace-service,scanning-service,compliance-service,analytics-service')
    .split(',')
    .map(s => s.trim().toLowerCase())
);

/**
 * Verify internal service authentication using HMAC-SHA256 signature
 *
 * Expected headers:
 * - x-internal-service: Service name
 * - x-internal-timestamp: Unix timestamp (ms)
 * - x-internal-nonce: Unique nonce for replay protection
 * - x-internal-signature: HMAC-SHA256 signature
 * - x-internal-body-hash: SHA256 hash of request body (for POST/PUT)
 */
async function verifyInternalService(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Skip validation if feature flag is disabled
  if (!USE_NEW_HMAC) {
    log.debug('HMAC validation disabled (USE_NEW_HMAC=false)');
    return;
  }

  const serviceName = request.headers['x-internal-service'] as string;
  const timestamp = request.headers['x-internal-timestamp'] as string;
  const nonce = request.headers['x-internal-nonce'] as string;
  const signature = request.headers['x-internal-signature'] as string;
  const bodyHash = request.headers['x-internal-body-hash'] as string;

  // Check required headers
  if (!serviceName || !timestamp || !signature) {
    log.warn({
      path: request.url,
      hasService: !!serviceName,
      hasTimestamp: !!timestamp,
      hasSignature: !!signature,
    }, 'Internal request missing required headers');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing required authentication headers',
    });
  }

  // Validate timestamp (60-second window per Audit #16)
  const requestTime = parseInt(timestamp);
  const now = Date.now();
  const timeDiff = Math.abs(now - requestTime);

  if (isNaN(requestTime) || timeDiff > 60000) {
    log.warn({
      timeDiff: timeDiff / 1000,
      service: serviceName,
      path: request.url,
    }, 'Internal request with expired timestamp');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Request timestamp expired or invalid',
    });
  }

  // Validate service name
  const normalizedService = serviceName.toLowerCase();
  if (!ALLOWED_SERVICES.has(normalizedService)) {
    log.warn({
      serviceName,
      path: request.url,
    }, 'Unknown service attempted internal access');
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Service not authorized',
    });
  }

  // Verify HMAC signature
  if (!INTERNAL_HMAC_SECRET) {
    log.error('INTERNAL_HMAC_SECRET not configured');
    return reply.status(500).send({
      error: 'Internal server error',
      message: 'Service authentication not configured',
    });
  }

  // Build signature payload
  // Format: serviceName:timestamp:nonce:method:path[:bodyHash]
  let signaturePayload = `${serviceName}:${timestamp}:${nonce || ''}:${request.method}:${request.url}`;
  if (bodyHash) {
    signaturePayload += `:${bodyHash}`;
  }

  const expectedSignature = crypto
    .createHmac('sha256', INTERNAL_HMAC_SECRET)
    .update(signaturePayload)
    .digest('hex');

  // Timing-safe comparison to prevent timing attacks
  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      log.warn({
        service: serviceName,
        path: request.url,
      }, 'Invalid internal service signature');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid signature',
      });
    }
  } catch (error) {
    log.warn({
      service: serviceName,
      path: request.url,
      error: (error as Error).message,
    }, 'Signature verification error');
    return reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid signature format',
    });
  }

  // Verify body hash if present (for POST/PUT requests)
  if (request.body && bodyHash) {
    const actualBodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request.body))
      .digest('hex');

    if (actualBodyHash !== bodyHash) {
      log.warn({
        service: serviceName,
        path: request.url,
      }, 'Body hash mismatch');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Body hash mismatch',
      });
    }
  }

  log.debug({
    serviceName,
    path: request.url,
    method: request.method,
  }, 'Internal service authenticated');
}

/**
 * Sale event payload from payment-service
 */
interface MarketplaceSalePayload {
  signature: string;
  tokenId: string;
  price: number;
  seller: string;
  buyer: string;
  marketplace?: string;
  royaltiesPaid?: Array<{
    recipient: string;
    amount: number;
  }>;
  marketplaceFee?: number;
  timestamp?: string;
}

export default async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply internal authentication to all routes
  fastify.addHook('preHandler', verifyInternalService);

  /**
   * POST /internal/marketplace/sales
   * Record a marketplace sale event
   * Used by: payment-service (after successful payment)
   */
  fastify.post<{ Body: MarketplaceSalePayload }>('/marketplace/sales', {
    schema: {
      body: {
        type: 'object',
        required: ['signature', 'tokenId', 'price', 'seller', 'buyer'],
        properties: {
          signature: { type: 'string' },
          tokenId: { type: 'string' },
          price: { type: 'number' },
          seller: { type: 'string' },
          buyer: { type: 'string' },
          marketplace: { type: 'string' },
          royaltiesPaid: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                recipient: { type: 'string' },
                amount: { type: 'number' },
              },
            },
          },
          marketplaceFee: { type: 'number' },
          timestamp: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { signature, tokenId, price, seller, buyer, marketplace, royaltiesPaid, marketplaceFee, timestamp } = request.body;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    log.info({
      signature,
      tokenId,
      price,
      seller,
      buyer,
      callingService,
      traceId,
    }, 'Recording marketplace sale');

    try {
      // Check if sale already exists (idempotency)
      const existingSale = await MarketplaceEvent.findOne({ signature });
      if (existingSale) {
        log.info({ signature, traceId }, 'Sale already recorded');
        return reply.send({
          success: true,
          message: 'Sale already recorded',
          sale: {
            id: existingSale._id,
            signature: existingSale.signature,
            tokenId: existingSale.tokenId,
            price: existingSale.price,
          },
        });
      }

      // Create marketplace sale event
      const saleEvent = new MarketplaceEvent({
        eventType: 'sale',
        marketplace: marketplace || 'tickettoken',
        signature,
        tokenId,
        price,
        seller,
        buyer,
        royaltiesPaid: royaltiesPaid || [],
        marketplaceFee: marketplaceFee || 0,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });

      await saleEvent.save();

      // Update NFT ownership
      await NFTMetadata.findOneAndUpdate(
        { assetId: tokenId },
        { owner: buyer },
        { new: true }
      );

      log.info({
        saleId: saleEvent._id,
        signature,
        tokenId,
        traceId,
      }, 'Marketplace sale recorded');

      return reply.send({
        success: true,
        message: 'Sale recorded successfully',
        sale: {
          id: saleEvent._id,
          signature: saleEvent.signature,
          tokenId: saleEvent.tokenId,
          price: saleEvent.price,
          seller: saleEvent.seller,
          buyer: saleEvent.buyer,
          timestamp: saleEvent.timestamp,
        },
      });
    } catch (error: any) {
      log.error({
        error: error.message,
        signature,
        tokenId,
        traceId,
      }, 'Failed to record marketplace sale');

      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to record sale',
      });
    }
  });

  /**
   * GET /internal/nfts/:tokenId
   * Get NFT metadata and ownership details
   * Used by: ticket-service, marketplace-service
   */
  fastify.get<{ Params: { tokenId: string } }>('/nfts/:tokenId', async (request, reply) => {
    const { tokenId } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!tokenId) {
      return reply.status(400).send({ error: 'Token ID required' });
    }

    try {
      const nft = await NFTMetadata.findOne({ assetId: tokenId });

      if (!nft) {
        return reply.status(404).send({ error: 'NFT not found' });
      }

      log.info({
        tokenId,
        owner: nft.owner,
        callingService,
        traceId,
      }, 'Internal NFT lookup');

      return reply.send({
        nft: {
          assetId: nft.assetId,
          tree: nft.tree,
          leafIndex: nft.leafIndex,
          owner: nft.owner,
          delegate: nft.delegate,
          compressed: nft.compressed,
          eventId: nft.eventId,
          ticketNumber: nft.ticketNumber,
          mintedAt: nft.mintedAt,
          metadata: {
            name: nft.metadata.name,
            symbol: nft.metadata.symbol,
            uri: nft.metadata.uri,
            sellerFeeBasisPoints: nft.metadata.sellerFeeBasisPoints,
            creators: nft.metadata.creators,
          },
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, tokenId, traceId }, 'Failed to get NFT');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });

  /**
   * GET /internal/transactions/:txHash
   * Get blockchain transaction details
   * Used by: minting-service, payment-service
   */
  fastify.get<{ Params: { txHash: string } }>('/transactions/:txHash', async (request, reply) => {
    const { txHash } = request.params;
    const traceId = request.headers['x-trace-id'] as string;
    const callingService = request.headers['x-internal-service'] as string;

    if (!txHash) {
      return reply.status(400).send({ error: 'Transaction hash required' });
    }

    try {
      const transaction = await BlockchainTransaction.findOne({ signature: txHash });

      if (!transaction) {
        return reply.status(404).send({ error: 'Transaction not found' });
      }

      log.info({
        txHash,
        status: transaction.status,
        slot: transaction.slot,
        callingService,
        traceId,
      }, 'Internal transaction lookup');

      return reply.send({
        transaction: {
          signature: transaction.signature,
          slot: transaction.slot,
          blockTime: transaction.blockTime,
          status: transaction.status,
          fee: transaction.fee,
          errorMessage: transaction.errorMessage,
          accounts: transaction.accounts,
          instructions: transaction.instructions.map(ix => ({
            programId: ix.programId,
            parsed: ix.parsed,
          })),
          indexedAt: transaction.indexedAt,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, txHash, traceId }, 'Failed to get transaction');
      return reply.status(500).send({ error: 'Internal error' });
    }
  });
}
