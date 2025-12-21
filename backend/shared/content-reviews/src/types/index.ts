import { Types } from 'mongoose';

/**
 * User content target types
 */
export type UserContentTargetType = 'event' | 'venue' | 'performer' | 'ticket';

/**
 * User content types
 */
export type UserContentType = 'REVIEW' | 'RATING' | 'PHOTO' | 'VIDEO' | 'COMMENT' | 'CHECK_IN' | 'TIP';

/**
 * User content status
 */
export type UserContentStatus = 'pending' | 'approved' | 'rejected' | 'flagged' | 'removed';

/**
 * Flag types for content reporting
 */
export type FlagType = 'spam' | 'offensive' | 'fake' | 'irrelevant' | 'copyright';

/**
 * Tip categories
 */
export type TipCategory = 'parking' | 'food' | 'seating' | 'arrival' | 'accessibility' | 'other';

/**
 * Review data interface
 */
export interface ReviewData {
  title?: string;
  body: string;
  pros?: string[];
  cons?: string[];
  recommendsTo?: string[];
  attendedDate?: Date;
  verifiedAttendee?: boolean;
}

/**
 * Rating categories
 */
export interface RatingCategories {
  value?: number;
  atmosphere?: number;
  sound?: number;
  sightlines?: number;
  service?: number;
  cleanliness?: number;
  accessibility?: number;
  parking?: number;
  foodAndDrink?: number;
}

/**
 * Rating data interface
 */
export interface RatingData {
  overall: number;
  categories?: RatingCategories;
}

/**
 * Media location
 */
export interface MediaLocation {
  section?: string;
  row?: string;
  seat?: string;
}

/**
 * Media data interface
 */
export interface MediaData {
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  takenAt?: Date;
  location?: MediaLocation;
  tags?: string[];
}

/**
 * Tip data interface
 */
export interface TipData {
  category: TipCategory;
  title?: string;
  body: string;
}

/**
 * User content data union
 */
export interface UserContentData {
  review?: ReviewData;
  rating?: RatingData;
  media?: MediaData;
  tip?: TipData;
}

/**
 * Engagement metrics
 */
export interface EngagementMetrics {
  helpfulCount: number;
  notHelpfulCount: number;
  reportCount: number;
  shareCount: number;
  commentCount: number;
}

/**
 * Content flag
 */
export interface ContentFlag {
  type: FlagType;
  reportedBy: string;
  reportedAt: Date;
}

/**
 * Moderation data
 */
export interface ModerationData {
  autoScore?: number;
  manualReview?: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  flags?: ContentFlag[];
}

/**
 * User content document
 */
export interface UserContent {
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
}

/**
 * Rating summary for a target
 */
export interface RatingSummary {
  targetType: UserContentTargetType;
  targetId: Types.ObjectId;
  averageRating: number;
  totalRatings: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
  categoryAverages?: RatingCategories;
  lastUpdated: Date;
}

/**
 * Paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Query options
 */
export interface QueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  status?: UserContentStatus | UserContentStatus[];
}

/**
 * Bulk operation result
 */
export interface BulkResult {
  success: number;
  failed: number;
  errors?: Array<{
    id: string;
    error: string;
  }>;
}

/**
 * Moderation stats
 */
export interface ModerationStats {
  pending: number;
  approved: number;
  rejected: number;
  flagged: number;
  removed: number;
  averageAutoScore: number;
  requiresManualReview: number;
}

/**
 * Auto-moderation result
 */
export interface AutoModerationResult {
  score: number;
  action: 'approve' | 'review' | 'reject';
  reason?: string;
}
