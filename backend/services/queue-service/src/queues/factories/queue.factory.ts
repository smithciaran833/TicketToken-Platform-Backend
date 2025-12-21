import PgBoss from 'pg-boss';
import { logger } from '../../utils/logger';
import { QUEUE_CONFIGS, PG_BOSS_CONFIG } from '../../config/queues.config';
import { QueueType } from '../../types/queue.types';
import { PersistenceService } from '../../services/persistence.service';
import { PERSISTENCE_TIERS } from '../../config/constants';

export class QueueFactory {
  private static boss: PgBoss | null = null;
  private static persistenceServices: Map<string, PersistenceService> = new Map();
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    logger.info('Initializing pg-boss queue system...');
    
    // Create pg-boss instance
    this.boss = new PgBoss(PG_BOSS_CONFIG);
    
    // Event handlers
    this.boss.on('error', (error) => {
      logger.error('pg-boss error:', error);
    });
    
    this.boss.on('maintenance', () => {
      logger.debug('pg-boss maintenance running');
    });
    
    // Start pg-boss
    await this.boss.start();
    logger.info('✅ pg-boss started successfully');
    
    // Create persistence services for each tier
    const moneyPersistence = new PersistenceService(PERSISTENCE_TIERS.TIER_1);
    const commPersistence = new PersistenceService(PERSISTENCE_TIERS.TIER_2);
    const bgPersistence = new PersistenceService(PERSISTENCE_TIERS.TIER_3);
    
    this.persistenceServices.set('money', moneyPersistence);
    this.persistenceServices.set('communication', commPersistence);
    this.persistenceServices.set('background', bgPersistence);
    
    this.initialized = true;
    logger.info('✅ All queues initialized with pg-boss');
  }

  static getBoss(): PgBoss {
    if (!this.boss) {
      throw new Error('pg-boss not initialized');
    }
    return this.boss;
  }

  static getPersistenceService(queueType: QueueType): PersistenceService {
    const service = this.persistenceServices.get(queueType);
    if (!service) {
      throw new Error(`No persistence service for queue type: ${queueType}`);
    }
    return service;
  }

  /**
   * Get queue adapter (for backwards compatibility)
   * Now returns pg-boss instance wrapped for compatibility
   */
  static getQueue(name: string): any {
    const { BullQueueAdapter } = require('../../adapters/bull-queue-adapter');
    return new BullQueueAdapter(name);
  }

  static async shutdown(): Promise<void> {
    logger.info('Shutting down pg-boss...');
    
    if (this.boss) {
      await this.boss.stop();
      this.boss = null;
      logger.info('pg-boss stopped');
    }
    
    this.persistenceServices.clear();
    this.initialized = false;
  }

  static async getQueueMetrics(queueName: string) {
    if (!this.boss) {
      throw new Error('pg-boss not initialized');
    }
    
    try {
      // pg-boss doesn't provide state-specific queue sizes via API
      // These metrics would need to be queried directly from pg boss tables
      // For now, return placeholder values - monitoring can be enhanced later
      return {
        name: queueName,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0
      };
    } catch (error) {
      logger.error(`Failed to get metrics for queue ${queueName}:`, error);
      return {
        name: queueName,
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0
      };
    }
  }
}
