import { Types } from 'mongoose';
import { UserContentModel, IUserContent } from '../models/user-content.model';
import type {
  RatingData,
  UserContentTargetType,
  RatingSummary,
  RatingCategories,
} from '../types';

/**
 * Rating Service
 * Handles rating submission and analysis with Redis caching
 */
export class RatingService {
  private redisClient: any;
  private readonly CACHE_PREFIX = 'rating:summary:';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(redisClient?: any) {
    this.redisClient = redisClient;
  }

  /**
   * Submit a rating
   */
  async submitRating(
    userId: string,
    targetType: UserContentTargetType,
    targetId: string,
    data: RatingData
  ): Promise<IUserContent> {
    try {
      // Check if user already rated this target
      const existing = await UserContentModel.findOne({
        userId: new Types.ObjectId(userId),
        targetType,
        targetId: new Types.ObjectId(targetId),
        contentType: 'RATING',
        status: { $in: ['pending', 'approved'] },
      });

      if (existing) {
        throw new Error('User has already rated this target');
      }

      // Validate rating values
      if (data.overall < 1 || data.overall > 5) {
        throw new Error('Overall rating must be between 1 and 5');
      }

      if (data.categories) {
        for (const [key, value] of Object.entries(data.categories)) {
          if (value !== undefined && (value < 1 || value > 5)) {
            throw new Error(`Category rating ${key} must be between 1 and 5`);
          }
        }
      }

      // Create rating
      const rating = new UserContentModel({
        userId: new Types.ObjectId(userId),
        targetType,
        targetId: new Types.ObjectId(targetId),
        contentType: 'RATING',
        status: 'approved', // Ratings are auto-approved
        content: { rating: data },
        engagement: {
          helpfulCount: 0,
          notHelpfulCount: 0,
          reportCount: 0,
          shareCount: 0,
          commentCount: 0,
        },
        moderation: {
          autoScore: 100, // Ratings get high auto-score
        },
      });

      await rating.save();

      // Invalidate rating summary cache
      await this.invalidateSummaryCache(targetType, targetId);

      console.log(`[RatingService] User ${userId} rated ${targetType}:${targetId} with ${data.overall} stars`);
      return rating;
    } catch (error) {
      throw new Error(`Failed to submit rating: ${(error as Error).message}`);
    }
  }

  /**
   * Update an existing rating
   */
  async updateRating(
    ratingId: string,
    userId: string,
    data: Partial<RatingData>
  ): Promise<IUserContent> {
    try {
      const rating = await UserContentModel.findById(ratingId);

      if (!rating) {
        throw new Error('Rating not found');
      }

      if (rating.userId.toString() !== userId) {
        throw new Error('Unauthorized to update this rating');
      }

      // Update rating content
      if (data.overall !== undefined) {
        if (data.overall < 1 || data.overall > 5) {
          throw new Error('Overall rating must be between 1 and 5');
        }
        rating.content.rating!.overall = data.overall;
      }

      if (data.categories) {
        if (!rating.content.rating!.categories) {
          rating.content.rating!.categories = {};
        }
        Object.assign(rating.content.rating!.categories, data.categories);
      }

      await rating.save();

      // Invalidate cache
      await this.invalidateSummaryCache(rating.targetType, rating.targetId.toString());

      console.log(`[RatingService] Updated rating ${ratingId}`);
      return rating;
    } catch (error) {
      throw new Error(`Failed to update rating: ${(error as Error).message}`);
    }
  }

  /**
   * Get rating summary for a target with caching
   */
  async getRatingSummary(
    targetType: UserContentTargetType,
    targetId: string
  ): Promise<RatingSummary | null> {
    try {
      // Try cache first
      const cacheKey = `${this.CACHE_PREFIX}${targetType}:${targetId}`;
      const cached = await this.getCachedSummary(cacheKey);
      if (cached) {
        console.log(`[RatingService] Cache hit for summary ${targetType}:${targetId}`);
        return cached;
      }

      // Calculate from database
      const summary = await this.recalculateSummary(targetType, targetId);

      // Cache the result
      if (summary) {
        await this.cacheSummary(cacheKey, summary);
      }

      return summary;
    } catch (error) {
      throw new Error(`Failed to get rating summary: ${(error as Error).message}`);
    }
  }

  /**
   * Get category-specific ratings
   */
  async getCategoryRatings(
    targetType: UserContentTargetType,
    targetId: string
  ): Promise<RatingCategories | null> {
    try {
      const result = await UserContentModel.aggregate([
        {
          $match: {
            targetType,
            targetId: new Types.ObjectId(targetId),
            contentType: 'RATING',
            status: 'approved',
            'content.rating.categories': { $exists: true },
          },
        },
        {
          $group: {
            _id: null,
            value: { $avg: '$content.rating.categories.value' },
            atmosphere: { $avg: '$content.rating.categories.atmosphere' },
            sound: { $avg: '$content.rating.categories.sound' },
            sightlines: { $avg: '$content.rating.categories.sightlines' },
            service: { $avg: '$content.rating.categories.service' },
            cleanliness: { $avg: '$content.rating.categories.cleanliness' },
            accessibility: { $avg: '$content.rating.categories.accessibility' },
            parking: { $avg: '$content.rating.categories.parking' },
            foodAndDrink: { $avg: '$content.rating.categories.foodAndDrink' },
          },
        },
      ]);

      if (!result || result.length === 0) {
        return null;
      }

      // Remove null _id and filter out null values
      const { _id, ...categories } = result[0];
      const filtered: RatingCategories = {};
      
      for (const [key, value] of Object.entries(categories)) {
        if (value !== null && value !== undefined) {
          filtered[key as keyof RatingCategories] = value as number;
        }
      }

      return Object.keys(filtered).length > 0 ? filtered : null;
    } catch (error) {
      throw new Error(`Failed to get category ratings: ${(error as Error).message}`);
    }
  }

  /**
   * Get user's rating for a target
   */
  async getUserRating(
    userId: string,
    targetType: UserContentTargetType,
    targetId: string
  ): Promise<IUserContent | null> {
    try {
      const rating = await UserContentModel.findOne({
        userId: new Types.ObjectId(userId),
        targetType,
        targetId: new Types.ObjectId(targetId),
        contentType: 'RATING',
        status: { $in: ['pending', 'approved'] },
      });

      return rating;
    } catch (error) {
      throw new Error(`Failed to get user rating: ${(error as Error).message}`);
    }
  }

  /**
   * Recalculate rating summary (updates cache)
   */
  async recalculateSummary(
    targetType: UserContentTargetType,
    targetId: string
  ): Promise<RatingSummary | null> {
    try {
      const stats: any = await UserContentModel.getRatingStats(targetType, targetId);

      if (!stats || stats.totalRatings === 0) {
        return null;
      }

      // Calculate category averages if available
      let categoryAverages: RatingCategories | undefined;
      if (stats.categoryAverages && stats.categoryAverages.length > 0) {
        const validCategories = stats.categoryAverages.filter((c: any) => c);
        if (validCategories.length > 0) {
          const categoryTotals: any = {};
          const categoryCounts: any = {};

          validCategories.forEach((cat: RatingCategories) => {
            for (const [key, value] of Object.entries(cat)) {
              if (value !== null && value !== undefined) {
                categoryTotals[key] = (categoryTotals[key] || 0) + value;
                categoryCounts[key] = (categoryCounts[key] || 0) + 1;
              }
            }
          });

          categoryAverages = {};
          for (const key in categoryTotals) {
            categoryAverages[key as keyof RatingCategories] = 
              categoryTotals[key] / categoryCounts[key];
          }
        }
      }

      const summary: RatingSummary = {
        targetType,
        targetId: new Types.ObjectId(targetId),
        averageRating: Math.round(stats.averageRating * 10) / 10, // Round to 1 decimal
        totalRatings: stats.totalRatings,
        ratingDistribution: {
          5: stats.rating5 || 0,
          4: stats.rating4 || 0,
          3: stats.rating3 || 0,
          2: stats.rating2 || 0,
          1: stats.rating1 || 0,
        },
        categoryAverages,
        lastUpdated: new Date(),
      };

      // Cache the updated summary
      const cacheKey = `${this.CACHE_PREFIX}${targetType}:${targetId}`;
      await this.cacheSummary(cacheKey, summary);

      console.log(`[RatingService] Recalculated summary for ${targetType}:${targetId}: ${summary.averageRating} (${summary.totalRatings} ratings)`);
      return summary;
    } catch (error) {
      throw new Error(`Failed to recalculate summary: ${(error as Error).message}`);
    }
  }

  /**
   * Cache rating summary
   */
  private async cacheSummary(key: string, summary: RatingSummary): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.setex(key, this.CACHE_TTL, JSON.stringify(summary));
    } catch (error) {
      console.error('[RatingService] Cache write error:', error);
    }
  }

  /**
   * Get cached rating summary
   */
  private async getCachedSummary(key: string): Promise<RatingSummary | null> {
    if (!this.redisClient) return null;

    try {
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[RatingService] Cache read error:', error);
      return null;
    }
  }

  /**
   * Invalidate rating summary cache
   */
  private async invalidateSummaryCache(
    targetType: UserContentTargetType,
    targetId: string
  ): Promise<void> {
    if (!this.redisClient) return;

    try {
      const cacheKey = `${this.CACHE_PREFIX}${targetType}:${targetId}`;
      await this.redisClient.del(cacheKey);
      console.log(`[RatingService] Invalidated cache for ${targetType}:${targetId}`);
    } catch (error) {
      console.error('[RatingService] Cache invalidation error:', error);
    }
  }
}
