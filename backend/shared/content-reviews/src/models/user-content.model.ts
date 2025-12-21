import { Schema, model, Model, Document, Types } from 'mongoose';
import type {
  UserContentTargetType,
  UserContentType,
  UserContentStatus,
  UserContentData,
  EngagementMetrics,
  ModerationData,
} from '../types';

/**
 * User Content Document interface
 */
export interface IUserContent extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  targetType: UserContentTargetType;
  targetId: Types.ObjectId;
  contentType: UserContentType;
  status: UserContentStatus;
  content: UserContentData;
  engagement: EngagementMetrics;
  moderation: ModerationData;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  canModify(userId: string): boolean;
  markHelpful(): Promise<void>;
  markNotHelpful(): Promise<void>;
  addFlag(type: string, reportedBy: string): Promise<void>;
  approve(reviewerId?: string): Promise<void>;
  reject(reviewerId: string, reason: string): Promise<void>;
}

/**
 * User Content Model interface with static methods
 */
export interface IUserContentModel extends Model<IUserContent> {
  findByTarget(
    targetType: UserContentTargetType,
    targetId: string,
    options?: any
  ): Promise<IUserContent[]>;
  getRatingStats(
    targetType: string,
    targetId: string
  ): Promise<any>;
}

/**
 * User Content Schema
 */
const userContentSchema = new Schema<IUserContent>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      enum: ['event', 'venue', 'performer', 'ticket'],
      required: true,
    },

    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    contentType: {
      type: String,
      enum: ['REVIEW', 'RATING', 'PHOTO', 'VIDEO', 'COMMENT', 'CHECK_IN', 'TIP'],
      required: true,
    },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'flagged', 'removed'],
      default: 'pending',
      index: true,
    },

    content: {
      // Review content
      review: {
        title: { type: String, maxlength: 200 },
        body: { type: String, maxlength: 5000 },
        pros: [{ type: String, maxlength: 500 }],
        cons: [{ type: String, maxlength: 500 }],
        recommendsTo: [{ type: String, maxlength: 100 }],
        attendedDate: Date,
        verifiedAttendee: { type: Boolean, default: false },
      },

      // Rating content
      rating: {
        overall: {
          type: Number,
          min: 1,
          max: 5,
        },
        categories: {
          value: { type: Number, min: 1, max: 5 },
          atmosphere: { type: Number, min: 1, max: 5 },
          sound: { type: Number, min: 1, max: 5 },
          sightlines: { type: Number, min: 1, max: 5 },
          service: { type: Number, min: 1, max: 5 },
          cleanliness: { type: Number, min: 1, max: 5 },
          accessibility: { type: Number, min: 1, max: 5 },
          parking: { type: Number, min: 1, max: 5 },
          foodAndDrink: { type: Number, min: 1, max: 5 },
        },
      },

      // Media content
      media: {
        url: { type: String, required: false },
        thumbnailUrl: String,
        caption: { type: String, maxlength: 500 },
        takenAt: Date,
        location: {
          section: String,
          row: String,
          seat: String,
        },
        tags: [{ type: String, maxlength: 50 }],
      },

      // Tip content
      tip: {
        category: {
          type: String,
          enum: ['parking', 'food', 'seating', 'arrival', 'accessibility', 'other'],
        },
        title: { type: String, maxlength: 100 },
        body: { type: String, required: false, maxlength: 1000 },
      },
    },

    engagement: {
      helpfulCount: { type: Number, default: 0, min: 0 },
      notHelpfulCount: { type: Number, default: 0, min: 0 },
      reportCount: { type: Number, default: 0, min: 0 },
      shareCount: { type: Number, default: 0, min: 0 },
      commentCount: { type: Number, default: 0, min: 0 },
    },

    moderation: {
      autoScore: { type: Number, min: 0, max: 100 },
      manualReview: { type: Boolean, default: false },
      reviewedBy: String,
      reviewedAt: Date,
      rejectionReason: String,
      flags: [
        {
          type: {
            type: String,
            enum: ['spam', 'offensive', 'fake', 'irrelevant', 'copyright'],
          },
          reportedBy: String,
          reportedAt: { type: Date, default: Date.now },
        },
      ],
    },
  },
  {
    timestamps: true,
    collection: 'user_content',
  }
);

/**
 * Indexes for query optimization
 */

// Primary query patterns
userContentSchema.index({ targetType: 1, targetId: 1, status: 1, contentType: 1 });
userContentSchema.index({ targetType: 1, targetId: 1, 'content.rating.overall': -1 });
userContentSchema.index({ userId: 1, createdAt: -1 });
userContentSchema.index({ status: 1, createdAt: 1 });

// Moderation queries
userContentSchema.index({ 'moderation.autoScore': 1, status: 1 });
userContentSchema.index({ 'moderation.manualReview': 1, status: 1 });

// Engagement and sorting
userContentSchema.index({ targetType: 1, targetId: 1, 'engagement.helpfulCount': -1 });
userContentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// Content type specific
userContentSchema.index({ contentType: 1, status: 1, createdAt: -1 });

/**
 * Static methods
 */
userContentSchema.statics = {
  /**
   * Find content by target
   */
  async findByTarget(
    this: Model<IUserContent>,
    targetType: UserContentTargetType,
    targetId: string,
    options: any = {}
  ): Promise<IUserContent[]> {
    const query: any = { targetType, targetId };
    
    if (options.status) {
      query.status = Array.isArray(options.status) ? { $in: options.status } : options.status;
    }
    
    if (options.contentType) {
      query.contentType = Array.isArray(options.contentType)
        ? { $in: options.contentType }
        : options.contentType;
    }

    return this.find(query)
      .sort(options.sort || { createdAt: -1 })
      .limit(options.limit || 20)
      .skip(options.skip || 0)
      .exec();
  },

  /**
   * Get rating statistics for a target
   */
  async getRatingStats(
    this: Model<IUserContent>,
    targetType: UserContentTargetType,
    targetId: string
  ) {
    const result = await this.aggregate([
      {
        $match: {
          targetType,
          targetId: new Types.ObjectId(targetId),
          contentType: 'RATING',
          status: 'approved',
          'content.rating.overall': { $exists: true },
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$content.rating.overall' },
          totalRatings: { $sum: 1 },
          rating5: {
            $sum: { $cond: [{ $eq: ['$content.rating.overall', 5] }, 1, 0] },
          },
          rating4: {
            $sum: { $cond: [{ $eq: ['$content.rating.overall', 4] }, 1, 0] },
          },
          rating3: {
            $sum: { $cond: [{ $eq: ['$content.rating.overall', 3] }, 1, 0] },
          },
          rating2: {
            $sum: { $cond: [{ $eq: ['$content.rating.overall', 2] }, 1, 0] },
          },
          rating1: {
            $sum: { $cond: [{ $eq: ['$content.rating.overall', 1] }, 1, 0] },
          },
          categoryAverages: {
            $push: '$content.rating.categories',
          },
        },
      },
    ]);

    return result[0] || null;
  },
};

/**
 * Instance methods
 */
userContentSchema.methods = {
  /**
   * Check if user can modify this content
   */
  canModify(userId: string): boolean {
    return this.userId.toString() === userId;
  },

  /**
   * Increment helpful count
   */
  async markHelpful(this: IUserContent): Promise<void> {
    this.engagement.helpfulCount += 1;
    await this.save();
  },

  /**
   * Increment not helpful count
   */
  async markNotHelpful(this: IUserContent): Promise<void> {
    this.engagement.notHelpfulCount += 1;
    await this.save();
  },

  /**
   * Add a flag
   */
  async addFlag(this: IUserContent, type: string, reportedBy: string): Promise<void> {
    if (!this.moderation.flags) {
      this.moderation.flags = [];
    }
    
    this.moderation.flags.push({
      type: type as any,
      reportedBy,
      reportedAt: new Date(),
    });
    
    this.engagement.reportCount += 1;

    // Auto-flag if multiple reports
    if (this.moderation.flags.length >= 3 && this.status === 'approved') {
      this.status = 'flagged';
      this.moderation.manualReview = true;
    }

    await this.save();
  },

  /**
   * Approve content
   */
  async approve(this: IUserContent, reviewerId?: string): Promise<void> {
    this.status = 'approved';
    this.moderation.reviewedBy = reviewerId;
    this.moderation.reviewedAt = new Date();
    this.moderation.manualReview = false;
    await this.save();
  },

  /**
   * Reject content
   */
  async reject(this: IUserContent, reviewerId: string, reason: string): Promise<void> {
    this.status = 'rejected';
    this.moderation.reviewedBy = reviewerId;
    this.moderation.reviewedAt = new Date();
    this.moderation.rejectionReason = reason;
    this.moderation.manualReview = false;
    await this.save();
  },
};

/**
 * Pre-save hook for auto-moderation
 */
userContentSchema.pre('save', async function (next) {
  if (this.isNew && !this.moderation.autoScore) {
    // Simple auto-moderation logic
    let score = 100;

    // Check for spam indicators
    const text = [
      this.content.review?.body,
      this.content.review?.title,
      this.content.tip?.body,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const spamWords = ['click here', 'buy now', 'limited time', 'http://', 'https://'];
    const spamCount = spamWords.filter((word) => text.includes(word)).length;
    score -= spamCount * 20;

    // Check for excessive caps
    const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
    if (capsRatio > 0.5) score -= 30;

    // Check for very short content
    if (text.length < 10) score -= 20;

    this.moderation.autoScore = Math.max(0, Math.min(100, score));

    // Auto-approve high scores, require review for low scores
    if (score >= 80) {
      this.status = 'approved';
    } else if (score <= 50) {
      this.moderation.manualReview = true;
    }
  }

  next();
});

/**
 * Export the model
 */
export const UserContentModel = model<IUserContent, IUserContentModel>('UserContent', userContentSchema);

/**
 * Create indexes
 */
export async function ensureIndexes(): Promise<void> {
  await UserContentModel.createIndexes();
  console.log('[UserContent] Indexes created successfully');
}
