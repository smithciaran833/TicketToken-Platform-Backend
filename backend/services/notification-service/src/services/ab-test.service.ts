import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ABTest {
  id: string;
  name: string;
  variants: ABVariant[];
  trafficSplit: Record<string, number>;
  metrics: Record<string, any>;
  winnerVariant?: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  startedAt?: Date;
  endedAt?: Date;
  createdAt: Date;
}

export interface ABVariant {
  id: string;
  name: string;
  templateId?: string;
  content: any;
  weight: number;
}

class ABTestService {
  async createTest(data: {
    name: string;
    variants: ABVariant[];
    trafficSplit: Record<string, number>;
  }): Promise<ABTest> {
    const testId = uuidv4();
    
    const [test] = await db('ab_tests')
      .insert({
        id: testId,
        name: data.name,
        variants: JSON.stringify(data.variants),
        traffic_split: JSON.stringify(data.trafficSplit),
        metrics: JSON.stringify({}),
        status: 'draft',
        created_at: new Date(),
      })
      .returning('*');

    logger.info('A/B test created', { testId, name: data.name });
    return this.mapToTest(test);
  }

  async selectVariant(testId: string, userId: string): Promise<ABVariant> {
    const test = await db('ab_tests').where({ id: testId }).first();
    if (!test) throw new Error('Test not found');

    const variants = JSON.parse(test.variants);
    const split = JSON.parse(test.traffic_split);

    // Deterministic selection based on user ID
    const hash = this.hashUserId(userId);
    let cumulative = 0;
    
    for (const variant of variants) {
      cumulative += split[variant.id] || (1 / variants.length);
      if (hash < cumulative) {
        return variant;
      }
    }

    return variants[0];
  }

  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash % 100) / 100;
  }

  async trackConversion(testId: string, variantId: string, metric: string, value: number): Promise<void> {
    await db('ab_test_metrics').insert({
      test_id: testId,
      variant_id: variantId,
      metric_name: metric,
      value,
      recorded_at: new Date(),
    });
  }

  async getResults(testId: string): Promise<any> {
    const metrics = await db('ab_test_metrics')
      .where({ test_id: testId })
      .select('variant_id', 'metric_name')
      .count('* as count')
      .sum('value as total')
      .groupBy('variant_id', 'metric_name');

    return metrics;
  }

  async declareWinner(testId: string, winnerVariantId: string): Promise<void> {
    await db('ab_tests')
      .where({ id: testId })
      .update({
        winner_variant: winnerVariantId,
        status: 'completed',
        ended_at: new Date(),
      });

    logger.info('A/B test winner declared', { testId, winnerVariantId });
  }

  private mapToTest(row: any): ABTest {
    return {
      id: row.id,
      name: row.name,
      variants: JSON.parse(row.variants),
      trafficSplit: JSON.parse(row.traffic_split),
      metrics: JSON.parse(row.metrics || '{}'),
      winnerVariant: row.winner_variant,
      status: row.status,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      createdAt: row.created_at,
    };
  }
}

export const abTestService = new ABTestService();
