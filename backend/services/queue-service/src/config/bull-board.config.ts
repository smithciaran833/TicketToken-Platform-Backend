import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { Queue } from 'bull';
import { logger } from '../utils/logger';

/**
 * Bull Board Configuration
 * Web UI for monitoring and managing Bull queues
 */

export interface BullBoardConfig {
  basePath: string;
  queues: Queue[];
}

export function setupBullBoard(queues: Queue[]): FastifyAdapter {
  try {
    const serverAdapter = new FastifyAdapter();
    serverAdapter.setBasePath('/admin/queues');

    createBullBoard({
      queues: queues.map(queue => new BullAdapter(queue)),
      serverAdapter,
    });

    logger.info('Bull Board initialized', {
      basePath: '/admin/queues',
      queueCount: queues.length,
    });

    return serverAdapter;
  } catch (error: any) {
    logger.error('Failed to initialize Bull Board', { error: error.message });
    throw error;
  }
}

export const bullBoardConfig: BullBoardConfig = {
  basePath: '/admin/queues',
  queues: [], // Will be populated when queues are created
};
