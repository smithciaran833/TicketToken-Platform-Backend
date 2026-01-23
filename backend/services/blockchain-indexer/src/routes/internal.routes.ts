/**
 * Internal Routes - blockchain-indexer
 *
 * For service-to-service communication only.
 * These endpoints provide blockchain data to other services
 * (payment-service, marketplace-service, ticket-service, etc.)
 *
 * Phase B HMAC Standardization - Routes now use shared middleware
 *
 * Endpoints:
 * - POST /internal/marketplace/sales - Record marketplace sale event
 * - GET /internal/nfts/:tokenId - Get NFT metadata and ownership
 * - GET /internal/transactions/:txHash - Get transaction details
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';
import { NFTMetadata } from '../models/nft-metadata.model';
import { MarketplaceEvent } from '../models/marketplace-event.model';
import { BlockchainTransaction } from '../models/blockchain-transaction.model';
import { internalAuthMiddleware } from '../middleware/internal-auth.middleware';

const log = logger.child({ component: 'InternalRoutes' });

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
  // Apply internal authentication to all routes using standardized middleware
  fastify.addHook('preHandler', internalAuthMiddleware);

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
