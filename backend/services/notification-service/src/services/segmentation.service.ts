import { db } from '../config/database';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

export interface Segment {
  id: string;
  name: string;
  description?: string;
  rules: SegmentRule[];
  userCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SegmentRule {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'in' | 'contains';
  value: any;
}

class SegmentationService {
  async createSegment(data: {
    name: string;
    description?: string;
    rules: SegmentRule[];
  }): Promise<Segment> {
    const segmentId = uuidv4();
    
    const [segment] = await db('audience_segments')
      .insert({
        id: segmentId,
        name: data.name,
        description: data.description,
        rules: JSON.stringify(data.rules),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    logger.info('Segment created', { segmentId, name: data.name });
    return this.mapToSegment(segment);
  }

  async matchesSegment(userId: string, segmentId: string): Promise<boolean> {
    const segment = await db('audience_segments').where({ id: segmentId }).first();
    if (!segment) return false;

    const rules: SegmentRule[] = JSON.parse(segment.rules);
    const user = await this.getUserAttributes(userId);

    return this.evaluateRules(user, rules);
  }

  private async getUserAttributes(userId: string): Promise<Record<string, any>> {
    // In production, fetch from user service or database
    return { userId, attributes: {} };
  }

  private evaluateRules(user: Record<string, any>, rules: SegmentRule[]): boolean {
    for (const rule of rules) {
      const userValue = this.getNestedValue(user, rule.field);
      
      switch (rule.operator) {
        case 'eq':
          if (userValue !== rule.value) return false;
          break;
        case 'ne':
          if (userValue === rule.value) return false;
          break;
        case 'gt':
          if (!(userValue > rule.value)) return false;
          break;
        case 'lt':
          if (!(userValue < rule.value)) return false;
          break;
        case 'in':
          if (!Array.isArray(rule.value) || !rule.value.includes(userValue)) return false;
          break;
        case 'contains':
          if (typeof userValue !== 'string' || !userValue.includes(rule.value)) return false;
          break;
      }
    }
    return true;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  async getSegmentUsers(segmentId: string, limit: number = 100): Promise<string[]> {
    // In production, query user database with segment rules
    return [];
  }

  async listSegments(): Promise<Segment[]> {
    const segments = await db('audience_segments').orderBy('created_at', 'desc');
    return segments.map(s => this.mapToSegment(s));
  }

  private mapToSegment(row: any): Segment {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      rules: JSON.parse(row.rules),
      userCount: row.user_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const segmentationService = new SegmentationService();
