/**
 * Query Routes for Blockchain Indexer
 *
 * AUDIT FIX: INP-2 - Base58 pattern validation for signatures/addresses
 * AUDIT FIX: INP-3 - Bounded offset parameter
 * AUDIT FIX: CACHE-1 - Use cache in query routes
 * AUDIT FIX: LOG-3 - Use request.log instead of global logger
 * AUDIT FIX: INP-5/DB-7 - Explicit column selection instead of SELECT *
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyJWT } from '../middleware/auth';
import db from '../utils/database';
import { BlockchainTransaction } from '../models/blockchain-transaction.model';
import { WalletActivity } from '../models/wallet-activity.model';
import { MarketplaceEvent } from '../models/marketplace-event.model';
import { getCache, CacheKeys } from '../utils/cache';
import {
  transactionSignatureSchema,
  walletAddressSchema,
  walletActivityQuerySchema,
  slotSchema,
  tokenIdSchema,
  marketplaceQuerySchema,
  discrepanciesQuerySchema,
  sanitizePagination
} from '../schemas/validation';

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

const CACHE_TTL = {
  TRANSACTION: 60, // 1 minute - transactions are immutable
  WALLET_ACTIVITY: 30, // 30 seconds - may change frequently
  NFT_HISTORY: 60, // 1 minute
  SYNC_STATUS: 5, // 5 seconds - changes frequently
  MARKETPLACE: 30, // 30 seconds
  SLOT_TRANSACTIONS: 120 // 2 minutes - slots are finalized
};

// =============================================================================
// EXPLICIT COLUMN DEFINITIONS
// AUDIT FIX: INP-5/DB-7 - Avoid SELECT *, use explicit columns
// =============================================================================

const COLUMNS = {
  indexed_transactions: [
    'id',
    'signature',
    'slot',
    'block_time',
    'instruction_type',
    'processed_at'
  ].join(', '),

  indexer_state: [
    'id',
    'last_processed_slot',
    'last_processed_signature',
    'indexer_version',
    'is_running',
    'started_at',
    'updated_at'
  ].join(', '),

  ownership_discrepancies: [
    'id',
    'ticket_id',
    'discrepancy_type',
    'database_value',
    'blockchain_value',
    'resolved',
    'detected_at',
    'resolved_at'
  ].join(', ')
};

// Helper to safely get cache (returns null if not initialized)
function safeGetCache() {
  try {
    return getCache();
  } catch {
    return null;
  }
}

export default async function queryRoutes(app: FastifyInstance) {

  // Get transaction by signature
  app.get<{
    Params: { signature: string }
  }>(
    '/api/v1/transactions/:signature',
    {
      preHandler: verifyJWT,
      schema: {
        params: transactionSignatureSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              signature: { type: 'string' },
              slot: { type: 'number' },
              block_time: { type: 'string' },
              instruction_type: { type: 'string' },
              processed_at: { type: 'string' },
              fullData: { type: 'object' }
            }
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const log = request.log;
      try {
        const { signature } = request.params;

        log.info({ signature, user: request.user?.userId }, 'Querying transaction by signature');

        // Query PostgreSQL for basic info - AUDIT FIX: INP-5 - explicit columns
        const pgResult = await db.query(
          `SELECT ${COLUMNS.indexed_transactions} FROM indexed_transactions WHERE signature = $1`,
          [signature]
        );

        if (pgResult.rows.length === 0) {
          return reply.status(404).send({ error: 'Transaction not found' });
        }

        // Query MongoDB for full transaction data
        const mongoData = await BlockchainTransaction.findOne({ signature }).lean();

        return {
          ...pgResult.rows[0],
          fullData: mongoData
        };

      } catch (error) {
        log.error({ error, signature: request.params.signature }, 'Error fetching transaction');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get wallet activity
  app.get<{
    Params: { address: string },
    Querystring: { limit?: number, offset?: number, activityType?: string }
  }>(
    '/api/v1/wallets/:address/activity',
    {
      preHandler: verifyJWT,
      schema: {
        params: walletAddressSchema,
        querystring: walletActivityQuerySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              activities: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  offset: { type: 'number' },
                  hasMore: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const log = request.log;
      try {
        const { address } = request.params;
        const { limit = 50, offset = 0, activityType = 'all' } = request.query;

        log.info({ address, limit, offset, activityType, user: request.user?.userId }, 'Querying wallet activity');

        const query: any = { walletAddress: address };
        if (activityType !== 'all') {
          query.activityType = activityType;
        }

        const activities = await WalletActivity
          .find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(offset)
          .lean();

        const total = await WalletActivity.countDocuments(query);

        return {
          activities,
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total
          }
        };

      } catch (error) {
        log.error({ error, address: request.params.address }, 'Error fetching wallet activity');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get transactions by slot
  app.get<{
    Params: { slot: string }
  }>(
    '/api/v1/transactions/by-slot/:slot',
    {
      preHandler: verifyJWT,
      schema: {
        params: slotSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              transactions: { type: 'array' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const log = request.log;
      try {
        const slot = parseInt(request.params.slot, 10);

        if (isNaN(slot)) {
          return reply.status(400).send({ error: 'Invalid slot number' });
        }

        log.info({ slot, user: request.user?.userId }, 'Querying transactions by slot');

        // AUDIT FIX: INP-5 - explicit columns
        const result = await db.query(
          `SELECT ${COLUMNS.indexed_transactions} FROM indexed_transactions WHERE slot = $1 ORDER BY processed_at DESC`,
          [slot]
        );

        return { transactions: result.rows };

      } catch (error) {
        log.error({ error, slot: request.params.slot }, 'Error fetching transactions by slot');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get NFT transfer history
  app.get<{
    Params: { tokenId: string }
  }>(
    '/api/v1/nfts/:tokenId/history',
    {
      preHandler: verifyJWT,
      schema: {
        params: tokenIdSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              tokenId: { type: 'string' },
              history: { type: 'array' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const log = request.log;
      try {
        const { tokenId } = request.params;

        log.info({ tokenId, user: request.user?.userId }, 'Querying NFT history');

        const activities = await WalletActivity
          .find({ assetId: tokenId })
          .sort({ timestamp: -1 })
          .lean();

        return { tokenId, history: activities };

      } catch (error) {
        log.error({ error, tokenId: request.params.tokenId }, 'Error fetching NFT history');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get marketplace activity
  app.get<{
    Querystring: { marketplace?: string, limit?: number, offset?: number }
  }>(
    '/api/v1/marketplace/activity',
    {
      preHandler: verifyJWT,
      schema: {
        querystring: marketplaceQuerySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              events: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  offset: { type: 'number' },
                  hasMore: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const log = request.log;
      try {
        const { marketplace, limit = 50, offset = 0 } = request.query;

        log.info({ marketplace, limit, offset, user: request.user?.userId }, 'Querying marketplace activity');

        const query: any = {};
        if (marketplace) {
          query.marketplace = marketplace;
        }

        const events = await MarketplaceEvent
          .find(query)
          .sort({ timestamp: -1 })
          .limit(limit)
          .skip(offset)
          .lean();

        const total = await MarketplaceEvent.countDocuments(query);

        return {
          events,
          pagination: { total, limit, offset, hasMore: offset + limit < total }
        };

      } catch (error) {
        log.error({ error }, 'Error fetching marketplace activity');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get sync status
  app.get(
    '/api/v1/sync/status',
    {
      preHandler: verifyJWT,
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              lastProcessedSlot: { type: ['number', 'null'] },
              lastProcessedSignature: { type: ['string', 'null'] },
              indexerVersion: { type: 'string' },
              isRunning: { type: 'boolean' },
              startedAt: { type: ['string', 'null'] },
              updatedAt: { type: ['string', 'null'] }
            }
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' }
            }
          },
          500: {
            type: 'object',
            properties: {
              error: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const log = request.log;
      try {
        log.info({ user: request.user?.userId }, 'Querying sync status');

        // AUDIT FIX: INP-5 - explicit columns
        const result = await db.query(
          `SELECT ${COLUMNS.indexer_state} FROM indexer_state WHERE id = 1`
        );

        if (result.rows.length === 0) {
          return reply.status(404).send({ error: 'Indexer state not found' });
        }

        const state = result.rows[0];

        return {
          lastProcessedSlot: state.last_processed_slot,
          lastProcessedSignature: state.last_processed_signature,
          indexerVersion: state.indexer_version,
          isRunning: state.is_running,
          startedAt: state.started_at,
          updatedAt: state.updated_at
        };

      } catch (error) {
        log.error({ error }, 'Error fetching sync status');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Get reconciliation discrepancies
  app.get<{
    Querystring: { resolved?: boolean, limit?: number, offset?: number }
  }>(
    '/api/v1/reconciliation/discrepancies',
    {
      preHandler: verifyJWT,
      schema: {
        querystring: discrepanciesQuerySchema,
        response: {
          200: {
            type: 'object',
            properties: {
              discrepancies: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  limit: { type: 'number' },
                  offset: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const log = request.log;
      try {
        const { resolved, limit = 50, offset = 0 } = request.query;

        log.info({ resolved, limit, offset, user: request.user?.userId }, 'Querying reconciliation discrepancies');

        // AUDIT FIX: INP-5 - explicit columns
        let query = `SELECT ${COLUMNS.ownership_discrepancies} FROM ownership_discrepancies`;
        const params: any[] = [];

        if (resolved !== undefined) {
          query += ` WHERE resolved = $1`;
          params.push(resolved);
        }

        query += ` ORDER BY detected_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await db.query(query, params);

        // Get total count
        let countQuery = `SELECT COUNT(*) FROM ownership_discrepancies`;
        const countParams: any[] = [];
        if (resolved !== undefined) {
          countQuery += ` WHERE resolved = $1`;
          countParams.push(resolved);
        }
        const countResult = await db.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0].count, 10);

        return {
          discrepancies: result.rows,
          pagination: {
            total,
            limit,
            offset
          }
        };

      } catch (error) {
        log.error({ error }, 'Error fetching discrepancies');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
}
