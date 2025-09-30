import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { VELOCITY_CHECK_WINDOW_SECONDS, BOT_SCORE_THRESHOLD } from '../utils/constants';

export interface AntiBotActivity {
  id: string;
  user_id: string;
  action_type: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BotScore {
  user_id: string;
  score: number;
  factors: {
    velocity_score: number;
    pattern_score: number;
    reputation_score: number;
  };
  is_bot: boolean;
  checked_at: Date;
}

export class AntiBotModel {
  private readonly tableName = 'anti_bot_activities';
  
  async recordActivity(
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await db(this.tableName).insert({
        id: uuidv4(),
        user_id: userId,
        action_type: action,
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
        timestamp: new Date(),
        metadata: JSON.stringify(metadata)
      });
    } catch (error) {
      logger.error('Error recording anti-bot activity:', error);
      throw error;
    }
  }
  
  async checkVelocity(
    userId: string,
    action: string,
    windowSeconds: number = VELOCITY_CHECK_WINDOW_SECONDS
  ): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - windowSeconds * 1000);
      
      const result = await db(this.tableName)
        .where('user_id', userId)
        .where('action_type', action)
        .where('timestamp', '>=', cutoff)
        .count('* as count');
      
      return parseInt(result[0].count as string, 10);
    } catch (error) {
      logger.error('Error checking velocity:', error);
      return 0;
    }
  }
  
  async calculateBotScore(userId: string): Promise<BotScore> {
    try {
      // Get recent activity patterns
      const recentActivity = await db(this.tableName)
        .where('user_id', userId)
        .where('timestamp', '>=', new Date(Date.now() - 3600000)) // Last hour
        .select('*');
      
      // Calculate velocity score (actions per minute)
      const velocityScore = Math.min(recentActivity.length / 60, 1);
      
      // Calculate pattern score (repetitive actions)
      const actionCounts = recentActivity.reduce((acc, act) => {
        acc[act.action_type] = (acc[act.action_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const maxActions = Math.max(...Object.values(actionCounts).map(v => Number(v)), 0);
      const patternScore = maxActions > 10 ? Math.min(maxActions / 20, 1) : 0;
      
      // Calculate reputation score (previous violations)
      const violations = await db('anti_bot_violations')
        .where('user_id', userId)
        .count('* as count');
      
      const reputationScore = Math.min(parseInt(violations[0]?.count as string || '0', 10) / 5, 1);
      
      // Calculate overall score
      const overallScore = (velocityScore * 0.4 + patternScore * 0.3 + reputationScore * 0.3);
      
      return {
        user_id: userId,
        score: overallScore,
        factors: {
          velocity_score: velocityScore,
          pattern_score: patternScore,
          reputation_score: reputationScore
        },
        is_bot: overallScore > BOT_SCORE_THRESHOLD,
        checked_at: new Date()
      };
    } catch (error) {
      logger.error('Error calculating bot score:', error);
      return {
        user_id: userId,
        score: 0,
        factors: {
          velocity_score: 0,
          pattern_score: 0,
          reputation_score: 0
        },
        is_bot: false,
        checked_at: new Date()
      };
    }
  }
  
  async flagSuspiciousActivity(
    userId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high'
  ): Promise<void> {
    try {
      await db('anti_bot_violations').insert({
        id: uuidv4(),
        user_id: userId,
        reason,
        severity,
        flagged_at: new Date()
      });
    } catch (error) {
      logger.error('Error flagging suspicious activity:', error);
      throw error;
    }
  }
}

export const antiBotModel = new AntiBotModel();
