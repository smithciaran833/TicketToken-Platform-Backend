/**
 * Bull Board Dashboard Route
 * 
 * Provides a web UI for monitoring and managing Bull queues.
 * Protected by admin authentication in production.
 * 
 * Access at: /admin/queues
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { getMintQueue, getRetryQueue, getDLQ } from '../queues/mintQueue';
import logger from '../utils/logger';

// =============================================================================
// BULL BOARD CONFIGURATION
// =============================================================================

// Whether to enable Bull Board (disabled in production by default unless explicitly enabled)
const ENABLE_BULL_BOARD = process.env.ENABLE_BULL_BOARD === 'true' ||
  process.env.NODE_ENV !== 'production';

// Base path for Bull Board UI
const BULL_BOARD_BASE_PATH = '/admin/queues';

// =============================================================================
// SETUP FUNCTIONS
// =============================================================================

/**
 * Create and configure the Bull Board server adapter
 */
function createBullBoardAdapter(): FastifyAdapter | null {
  if (!ENABLE_BULL_BOARD) {
    logger.info('Bull Board is disabled', {
      reason: process.env.NODE_ENV === 'production' 
        ? 'Production mode - set ENABLE_BULL_BOARD=true to enable'
        : 'ENABLE_BULL_BOARD is not set'
    });
    return null;
  }

  try {
    const mintQueue = getMintQueue();
    const retryQueue = getRetryQueue();
    const dlq = getDLQ();

    // Create Fastify adapter for Bull Board
    const serverAdapter = new FastifyAdapter();
    serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

    // Create Bull Board with all queues
    createBullBoard({
      queues: [
        new BullAdapter(mintQueue, { readOnlyMode: false }),
        new BullAdapter(retryQueue, { readOnlyMode: false }),
        new BullAdapter(dlq, { readOnlyMode: false })
      ],
      serverAdapter
    });

    logger.info('Bull Board configured', {
      basePath: BULL_BOARD_BASE_PATH,
      queues: ['ticket-minting', 'ticket-minting-retry', 'minting-dlq'],
      readOnlyMode: false
    });

    return serverAdapter;

  } catch (error) {
    logger.error('Failed to configure Bull Board', {
      error: (error as Error).message
    });
    return null;
  }
}

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

/**
 * Register Bull Board routes
 * 
 * NOTE: This should be registered AFTER admin authentication middleware
 * to ensure the dashboard is protected in production.
 */
export default async function registerBullBoardRoutes(
  fastify: FastifyInstance
): Promise<void> {
  // Skip if Bull Board is disabled
  if (!ENABLE_BULL_BOARD) {
    // Add a placeholder route that returns 404
    fastify.get(`${BULL_BOARD_BASE_PATH}*`, async (request: FastifyRequest, reply: FastifyReply) => {
      return reply.status(404).send({
        error: 'Not Found',
        message: 'Bull Board is disabled in this environment',
        hint: 'Set ENABLE_BULL_BOARD=true to enable'
      });
    });
    return;
  }

  const serverAdapter = createBullBoardAdapter();
  
  if (!serverAdapter) {
    logger.warn('Bull Board adapter not available');
    return;
  }

  // Register the Bull Board plugin
  // Note: basePath is already set via serverAdapter.setBasePath()
  await fastify.register(serverAdapter.registerPlugin(), {
    prefix: BULL_BOARD_BASE_PATH
  });

  logger.info('Bull Board routes registered', {
    path: BULL_BOARD_BASE_PATH,
    environment: process.env.NODE_ENV || 'development'
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  ENABLE_BULL_BOARD,
  BULL_BOARD_BASE_PATH
};

/**
 * Get Bull Board status for health checks
 */
export function getBullBoardStatus(): {
  enabled: boolean;
  basePath: string;
} {
  return {
    enabled: ENABLE_BULL_BOARD,
    basePath: BULL_BOARD_BASE_PATH
  };
}
