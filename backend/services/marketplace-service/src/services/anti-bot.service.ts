import { logger } from '../utils/logger';
import { antiBotModel } from '../models/anti-bot.model';
import { cache } from './cache-integration';
import { 
  MAX_PURCHASES_PER_HOUR,
  MAX_LISTINGS_PER_DAY,
  VELOCITY_CHECK_WINDOW_SECONDS,
  BOT_SCORE_THRESHOLD
} from '../utils/constants';

class AntiBotServiceClass {
  async checkPurchaseVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'purchase',
        3600 // 1 hour in seconds
      );
      
      if (count >= MAX_PURCHASES_PER_HOUR) {
        logger.warn(`User ${userId} exceeded purchase velocity limit: ${count} purchases`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded purchase velocity: ${count} purchases in 1 hour`,
          'high'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking purchase velocity:', error);
      return true; // Allow on error
    }
  }
  
  async checkListingVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'listing_created',
        86400 // 24 hours in seconds
      );
      
      if (count >= MAX_LISTINGS_PER_DAY) {
        logger.warn(`User ${userId} exceeded listing velocity limit: ${count} listings`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded listing velocity: ${count} listings in 24 hours`,
          'medium'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking listing velocity:', error);
      return true;
    }
  }
  
  async analyzeUserPattern(userId: string): Promise<any> {
    try {
      const botScore = await antiBotModel.calculateBotScore(userId);
      
      if (botScore.is_bot) {
        logger.warn(`User ${userId} flagged as potential bot. Score: ${botScore.score}`);
        
        // Cache the bot detection
        await cache.set(
          `bot_detection:${userId}`,
          JSON.stringify(botScore),
          { ttl: 3600 }
        );
      }
      
      return botScore;
    } catch (error) {
      logger.error('Error analyzing user pattern:', error);
      return null;
    }
  }
  
  async enforceRateLimit(userId: string, action: string): Promise<boolean> {
    try {
      const cacheKey = `rate_limit:${userId}:${action}`;
      const current = await cache.get(cacheKey);
      
      if (current) {
        const count = parseInt(current as string, 10);
        const limit = this.getActionLimit(action);
        
        if (count >= limit) {
          logger.warn(`Rate limit exceeded for user ${userId}, action: ${action}`);
          return false;
        }
        
        await cache.set(cacheKey, (count + 1).toString(), { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
      } else {
        await cache.set(cacheKey, '1', { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
      }
      
      // Record activity
      await antiBotModel.recordActivity(userId, action);
      
      return true;
    } catch (error) {
      logger.error('Error enforcing rate limit:', error);
      return true;
    }
  }
  
  private getActionLimit(action: string): number {
    const limits: Record<string, number> = {
      'api_call': 100,
      'search': 50,
      'listing_view': 200,
      'purchase_attempt': 10,
      'listing_create': 5
    };
    
    return limits[action] || 100;
  }
  
  async isUserBlocked(userId: string): Promise<boolean> {
    try {
      // Check cache first
      const cached = await cache.get(`user_blocked:${userId}`);
      if (cached === 'true') {
        return true;
      }
      
      // Check bot score
      const botScore = await antiBotModel.calculateBotScore(userId);
      if (botScore.score > BOT_SCORE_THRESHOLD) {
        await cache.set(`user_blocked:${userId}`, 'true', { ttl: 3600 });
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking if user is blocked:', error);
      return false;
    }
  }
}

export const AntiBotService = AntiBotServiceClass;
export const antiBotService = new AntiBotServiceClass();
