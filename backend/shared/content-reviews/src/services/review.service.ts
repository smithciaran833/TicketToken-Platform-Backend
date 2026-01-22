import { Types } from 'mongoose';
import { UserContentModel, IUserContent } from '../models/user-content.model';
import type {
  ReviewData,
  UserContentTargetType,
  PaginatedResult,
  QueryOptions,
} from '../types';

/**
 * Review Service
 * Handles review creation, retrieval, and management with Redis caching
 */
export class ReviewService {
  private redisClient: any;
  private readonly CACHE_PREFIX = 'reviews:';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(redisClient?: any) {
    this.redisClient = redisClient;
  }

  /**
   * Create a new review
   */
  async createReview(
    userId: string,
    targetType: UserContentTargetType,
    targetId: string,
    data: ReviewData,
    tenantId: string
  ): Promise<IUserContent> {
    try {
      // Check if user already reviewed this target
      const existing = await UserContentModel.findOne({
        userId: new Types.ObjectId(userId),
        targetType,
        targetId: new Types.ObjectId(targetId),
        contentType: 'REVIEW',
        status: { $in: ['pending', 'approved'] },
      });

      if (existing) {
        throw new Error('User has already reviewed this target');
      }

      // Create review
      const review = new UserContentModel({
        userId: new Types.ObjectId(userId),
        targetType,
        targetId: new Types.ObjectId(targetId),
        contentType: 'REVIEW',
        status: 'pending', // Will be auto-moderated in pre-save hook
        content: { review: data },
        engagement: {
          helpfulCount: 0,
          notHelpfulCount: 0,
          reportCount: 0,
          shareCount: 0,
          commentCount: 0,
        },
        moderation: {},
      });

      await review.save();

      // Invalidate cache for this target
      await this.invalidateCache(targetType, targetId);

      console.log(`[ReviewService] Created review ${review._id} for ${targetType}:${targetId} (tenant: ${tenantId})`);
      return review;
    } catch (error) {
      throw new Error(`Failed to create review: ${(error as Error).message}`);
    }
  }

  /**
   * Update an existing review
   */
  async updateReview(
    reviewId: string,
    userId: string,
    data: Partial<ReviewData>,
    tenantId: string
  ): Promise<IUserContent> {
    try {
      const review = await UserContentModel.findById(reviewId);

      if (!review) {
        throw new Error('Review not found');
      }

      if (review.userId.toString() !== userId) {
        throw new Error('Unauthorized to update this review');
      }

      if (review.status === 'rejected' || review.status === 'removed') {
        throw new Error('Cannot update rejected or removed review');
      }

      // Update review content
      if (data.title !== undefined) review.content.review!.title = data.title;
      if (data.body !== undefined) review.content.review!.body = data.body;
      if (data.pros !== undefined) review.content.review!.pros = data.pros;
      if (data.cons !== undefined) review.content.review!.cons = data.cons;
      if (data.recommendsTo !== undefined) review.content.review!.recommendsTo = data.recommendsTo;
      if (data.attendedDate !== undefined) review.content.review!.attendedDate = data.attendedDate;

      // Re-run moderation
      review.status = 'pending';
      review.moderation.autoScore = undefined;

      await review.save();

      // Invalidate cache
      await this.invalidateCache(review.targetType, review.targetId.toString());

      console.log(`[ReviewService] Updated review ${reviewId} (tenant: ${tenantId})`);
      return review;
    } catch (error) {
      throw new Error(`Failed to update review: ${(error as Error).message}`);
    }
  }

  /**
   * Get a single review by ID
   */
  async getReview(reviewId: string, tenantId: string): Promise<IUserContent | null> {
    try {
      return await UserContentModel.findById(reviewId);
    } catch (error) {
      throw new Error(`Failed to get review: ${(error as Error).message}`);
    }
  }

  /**
   * Delete a review
   */
  async deleteReview(reviewId: string, userId: string, tenantId: string): Promise<boolean> {
    try {
      const review = await UserContentModel.findById(reviewId);

      if (!review) {
        throw new Error('Review not found');
      }

      if (review.userId.toString() !== userId) {
        throw new Error('Unauthorized to delete this review');
      }

      // Soft delete by marking as removed
      review.status = 'removed';
      await review.save();

      // Invalidate cache
      await this.invalidateCache(review.targetType, review.targetId.toString());

      console.log(`[ReviewService] Deleted review ${reviewId} (tenant: ${tenantId})`);
      return true;
    } catch (error) {
      throw new Error(`Failed to delete review: ${(error as Error).message}`);
    }
  }

  /**
   * Get reviews for a target with caching
   */
  async getReviewsForTarget(
    targetType: UserContentTargetType,
    targetId: string,
    options: QueryOptions = {},
    tenantId: string
  ): Promise<PaginatedResult<IUserContent>> {
   try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      // Try to get from cache first
      const cacheKey = this.getCacheKey(targetType, targetId, options);
      const cached = await this.getCachedReviews(cacheKey);
      if (cached) {
        console.log(`[ReviewService] Cache hit for ${targetType}:${targetId}`);
        return cached;
      }

      // Build query
      const query: any = {
        targetType,
        targetId: new Types.ObjectId(targetId),
        contentType: 'REVIEW',
      };

      // Apply status filter (default to approved)
      if (options.status) {
        query.status = Array.isArray(options.status)
          ? { $in: options.status }
          : options.status;
      } else {
        query.status = 'approved';
      }

      // Build sort
      const sortBy = options.sortBy || 'createdAt';
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;
      const sort: any = { [sortBy]: sortOrder };

      // If sorting by helpful, use engagement.helpfulCount
      if (sortBy === 'helpful') {
        sort['engagement.helpfulCount'] = sortOrder;
        delete sort.helpful;
      }

      // Execute query
      const [reviews, total] = await Promise.all([
        UserContentModel.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .exec(),
        UserContentModel.countDocuments(query),
      ]);

      const result: PaginatedResult<IUserContent> = {
        data: reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      };

      // Cache the result
      await this.cacheReviews(cacheKey, result);

      console.log(`[ReviewService] Found ${reviews.length} reviews for ${targetType}:${targetId} (tenant: ${tenantId})`);
      return result;
    } catch (error) {
      throw new Error(`Failed to get reviews: ${(error as Error).message}`);
    }
  }

  /**
   * Get reviews by user
   */
  async getUserReviews(
    userId: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<IUserContent>> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = {
        userId: new Types.ObjectId(userId),
        contentType: 'REVIEW',
      };

      if (options.status) {
        query.status = Array.isArray(options.status)
          ? { $in: options.status }
          : options.status;
      }

      const [reviews, total] = await Promise.all([
        UserContentModel.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        UserContentModel.countDocuments(query),
      ]);

      return {
        data: reviews,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get user reviews: ${(error as Error).message}`);
    }
  }

  /**
   * Mark review as helpful
   */
  async markHelpful(reviewId: string, userId: string, tenantId: string): Promise<void> {
    try {
      const review = await UserContentModel.findById(reviewId);

      if (!review) {
        throw new Error('Review not found');
      }

      // Check if user already marked as helpful (you'd typically track this in Redis)
      const helpfulKey = `review:${reviewId}:helpful:${userId}`;
      if (this.redisClient) {
        const alreadyMarked = await this.redisClient.get(helpfulKey);
        if (alreadyMarked) {
          throw new Error('Already marked as helpful');
        }
        await this.redisClient.setex(helpfulKey, 86400 * 365, '1'); // 1 year TTL
      }

      await review.markHelpful();

      // Invalidate cache
      await this.invalidateCache(review.targetType, review.targetId.toString());

      console.log(`[ReviewService] User ${userId} marked review ${reviewId} as helpful (tenant: ${tenantId})`);
    } catch (error) {
      throw new Error(`Failed to mark helpful: ${(error as Error).message}`);
    }
  }

  /**
   * Mark review as not helpful
   */
  async markNotHelpful(reviewId: string, userId: string): Promise<void> {
    try {
      const review = await UserContentModel.findById(reviewId);

      if (!review) {
        throw new Error('Review not found');
      }

      // Check if user already marked as not helpful
      const notHelpfulKey = `review:${reviewId}:nothelpful:${userId}`;
      if (this.redisClient) {
        const alreadyMarked = await this.redisClient.get(notHelpfulKey);
        if (alreadyMarked) {
          throw new Error('Already marked as not helpful');
        }
        await this.redisClient.setex(notHelpfulKey, 86400 * 365, '1'); // 1 year TTL
      }

      await review.markNotHelpful();

      // Invalidate cache
      await this.invalidateCache(review.targetType, review.targetId.toString());

      console.log(`[ReviewService] User ${userId} marked review ${reviewId} as not helpful`);
    } catch (error) {
      throw new Error(`Failed to mark not helpful: ${(error as Error).message}`);
    }
  }

  /**
   * Report a review
   */
  async reportReview(reviewId: string, userId: string, reason: string, tenantId: string): Promise<void> {
    try {
      const review = await UserContentModel.findById(reviewId);

      if (!review) {
        throw new Error('Review not found');
      }

      // Map reason to flag type
      const flagTypeMap: Record<string, string> = {
        spam: 'spam',
        offensive: 'offensive',
        fake: 'fake',
        irrelevant: 'irrelevant',
        copyright: 'copyright',
      };

      const flagType = flagTypeMap[reason.toLowerCase()] || 'spam';

      await review.addFlag(flagType, userId);

      console.log(`[ReviewService] User ${userId} reported review ${reviewId} for ${reason} (tenant: ${tenantId})`);
    } catch (error) {
      throw new Error(`Failed to report review: ${(error as Error).message}`);
    }
  }

  /**
   * Cache reviews (Redis integration)
   */
  private async cacheReviews(key: string, data: PaginatedResult<IUserContent>): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.setex(key, this.CACHE_TTL, JSON.stringify(data));
    } catch (error) {
      console.error('[ReviewService] Cache write error:', error);
    }
  }

  /**
   * Get cached reviews
   */
  private async getCachedReviews(key: string): Promise<PaginatedResult<IUserContent> | null> {
    if (!this.redisClient) return null;

    try {
      const cached = await this.redisClient.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('[ReviewService] Cache read error:', error);
      return null;
    }
  }

  /**
   * Invalidate cache for a target
   */
  private async invalidateCache(targetType: UserContentTargetType, targetId: string): Promise<void> {
    if (!this.redisClient) return;

    try {
      const pattern = `${this.CACHE_PREFIX}${targetType}:${targetId}:*`;

      // Use scan to find and delete matching keys
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await this.redisClient.del(...keys);
        console.log(`[ReviewService] Invalidated ${keys.length} cache keys for ${targetType}:${targetId}`);
      }
    } catch (error) {
      console.error('[ReviewService] Cache invalidation error:', error);
    }
  }

  /**
   * Get cache key
   */
  private getCacheKey(
    targetType: UserContentTargetType,
    targetId: string,
    options: QueryOptions
  ): string {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';
    const status = options.status || 'approved';

    return `${this.CACHE_PREFIX}${targetType}:${targetId}:${page}:${limit}:${sortBy}:${sortOrder}:${status}`;
  }

  /**
   * Scan Redis keys by pattern
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    if (!this.redisClient) return [];

    const keys: string[] = [];
    let cursor = '0';

    do {
      const result = await this.redisClient.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== '0');

    return keys;
  }
}
