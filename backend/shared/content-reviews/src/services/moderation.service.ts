import { Types } from 'mongoose';
import { UserContentModel, IUserContent } from '../models/user-content.model';
import type {
  PaginatedResult,
  QueryOptions,
  BulkResult,
  ModerationStats,
  AutoModerationResult,
  FlagType,
} from '../types';

/**
 * Moderation Service
 * Handles content moderation queue and operations
 */
export class ModerationService {
  /**
   * Get pending moderation queue
   */
  async getPendingQueue(options: QueryOptions = {}): Promise<PaginatedResult<IUserContent>> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = {
        status: 'pending',
        'moderation.manualReview': true,
      };

      // Sort by auto-score (lowest first - most likely to need rejection)
      const [content, total] = await Promise.all([
        UserContentModel.find(query)
          .sort({ 'moderation.autoScore': 1, createdAt: 1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        UserContentModel.countDocuments(query),
      ]);

      return {
        data: content,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get pending queue: ${(error as Error).message}`);
    }
  }

  /**
   * Get flagged content queue
   */
  async getFlaggedQueue(options: QueryOptions = {}): Promise<PaginatedResult<IUserContent>> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = {
        status: 'flagged',
      };

      const [content, total] = await Promise.all([
        UserContentModel.find(query)
          .sort({ 'engagement.reportCount': -1, createdAt: 1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        UserContentModel.countDocuments(query),
      ]);

      return {
        data: content,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get flagged queue: ${(error as Error).message}`);
    }
  }

  /**
   * Approve content
   */
  async approveContent(contentId: string, moderatorId: string): Promise<void> {
    try {
      const content = await UserContentModel.findById(contentId);

      if (!content) {
        throw new Error('Content not found');
      }

      await content.approve(moderatorId);

      console.log(`[ModerationService] Moderator ${moderatorId} approved content ${contentId}`);
    } catch (error) {
      throw new Error(`Failed to approve content: ${(error as Error).message}`);
    }
  }

  /**
   * Reject content
   */
  async rejectContent(contentId: string, moderatorId: string, reason: string): Promise<void> {
    try {
      const content = await UserContentModel.findById(contentId);

      if (!content) {
        throw new Error('Content not found');
      }

      await content.reject(moderatorId, reason);

      console.log(`[ModerationService] Moderator ${moderatorId} rejected content ${contentId}: ${reason}`);
    } catch (error) {
      throw new Error(`Failed to reject content: ${(error as Error).message}`);
    }
  }

  /**
   * Flag content
   */
  async flagContent(contentId: string, flagType: FlagType, reporterId: string): Promise<void> {
    try {
      const content = await UserContentModel.findById(contentId);

      if (!content) {
        throw new Error('Content not found');
      }

      await content.addFlag(flagType, reporterId);

      console.log(`[ModerationService] User ${reporterId} flagged content ${contentId} as ${flagType}`);
    } catch (error) {
      throw new Error(`Failed to flag content: ${(error as Error).message}`);
    }
  }

  /**
   * Auto-moderate content (called on new content)
   */
  async autoModerate(content: IUserContent): Promise<AutoModerationResult> {
    try {
      const score = content.moderation.autoScore || 50;

      let action: 'approve' | 'review' | 'reject';
      let reason: string | undefined;

      if (score >= 80) {
        action = 'approve';
        reason = 'High quality content';
      } else if (score >= 50) {
        action = 'review';
        reason = 'Requires manual review';
      } else {
        action = 'reject';
        reason = 'Low quality or spam detected';
      }

      return {
        score,
        action,
        reason,
      };
    } catch (error) {
      throw new Error(`Failed to auto-moderate: ${(error as Error).message}`);
    }
  }

  /**
   * Bulk moderate content
   */
  async bulkModerate(
    contentIds: string[],
    action: 'approve' | 'reject',
    moderatorId: string,
    rejectionReason?: string
  ): Promise<BulkResult> {
    const result: BulkResult = {
      success: 0,
      failed: 0,
      errors: [],
    };

    try {
      for (const contentId of contentIds) {
        try {
          const content = await UserContentModel.findById(contentId);

          if (!content) {
            result.failed++;
            result.errors?.push({
              id: contentId,
              error: 'Content not found',
            });
            continue;
          }

          if (action === 'approve') {
            await content.approve(moderatorId);
          } else {
            await content.reject(moderatorId, rejectionReason || 'Bulk rejection');
          }

          result.success++;
        } catch (error) {
          result.failed++;
          result.errors?.push({
            id: contentId,
            error: (error as Error).message,
          });
        }
      }

      console.log(`[ModerationService] Bulk moderation completed: ${result.success} success, ${result.failed} failed`);
      return result;
    } catch (error) {
      throw new Error(`Failed to bulk moderate: ${(error as Error).message}`);
    }
  }

  /**
   * Get moderation statistics
   */
  async getContentStats(): Promise<ModerationStats> {
    try {
      const [
        pending,
        approved,
        rejected,
        flagged,
        removed,
        autoScoreResult,
        manualReview,
      ] = await Promise.all([
        UserContentModel.countDocuments({ status: 'pending' }),
        UserContentModel.countDocuments({ status: 'approved' }),
        UserContentModel.countDocuments({ status: 'rejected' }),
        UserContentModel.countDocuments({ status: 'flagged' }),
        UserContentModel.countDocuments({ status: 'removed' }),
        UserContentModel.aggregate([
          { $match: { 'moderation.autoScore': { $exists: true } } },
          { $group: { _id: null, avgScore: { $avg: '$moderation.autoScore' } } },
        ]),
        UserContentModel.countDocuments({ 'moderation.manualReview': true, status: 'pending' }),
      ]);

      const averageAutoScore = autoScoreResult[0]?.avgScore || 0;

      return {
        pending,
        approved,
        rejected,
        flagged,
        removed,
        averageAutoScore: Math.round(averageAutoScore * 10) / 10,
        requiresManualReview: manualReview,
      };
    } catch (error) {
      throw new Error(`Failed to get content stats: ${(error as Error).message}`);
    }
  }

  /**
   * Get content by status
   */
  async getContentByStatus(
    status: string | string[],
    options: QueryOptions = {}
  ): Promise<PaginatedResult<IUserContent>> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = {
        status: Array.isArray(status) ? { $in: status } : status,
      };

      const [content, total] = await Promise.all([
        UserContentModel.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        UserContentModel.countDocuments(query),
      ]);

      return {
        data: content,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get content by status: ${(error as Error).message}`);
    }
  }

  /**
   * Get low quality content (for review)
   */
  async getLowQualityContent(options: QueryOptions = {}): Promise<PaginatedResult<IUserContent>> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const skip = (page - 1) * limit;

      const query: any = {
        'moderation.autoScore': { $lt: 60, $exists: true },
        status: { $in: ['pending', 'approved'] },
      };

      const [content, total] = await Promise.all([
        UserContentModel.find(query)
          .sort({ 'moderation.autoScore': 1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        UserContentModel.countDocuments(query),
      ]);

      return {
        data: content,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page < Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new Error(`Failed to get low quality content: ${(error as Error).message}`);
    }
  }

  /**
   * Remove content (soft delete)
   */
  async removeContent(contentId: string, moderatorId: string, reason: string): Promise<void> {
    try {
      const content = await UserContentModel.findById(contentId);

      if (!content) {
        throw new Error('Content not found');
      }

      content.status = 'removed';
      content.moderation.reviewedBy = moderatorId;
      content.moderation.reviewedAt = new Date();
      content.moderation.rejectionReason = reason;

      await content.save();

      console.log(`[ModerationService] Moderator ${moderatorId} removed content ${contentId}: ${reason}`);
    } catch (error) {
      throw new Error(`Failed to remove content: ${(error as Error).message}`);
    }
  }
}
