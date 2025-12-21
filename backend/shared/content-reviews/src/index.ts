/**
 * @shared/content-reviews
 * 
 * Shared library for user-generated content (reviews, ratings, photos, tips)
 * Used by venue-service and event-service
 */

// Export services
export { ReviewService } from './services/review.service';
export { RatingService } from './services/rating.service';
export { ModerationService } from './services/moderation.service';

// Export model
export { UserContentModel, IUserContent, ensureIndexes } from './models/user-content.model';

// Export types
export type {
  UserContentTargetType,
  UserContentType,
  UserContentStatus,
  FlagType,
  TipCategory,
  ReviewData,
  RatingCategories,
  RatingData,
  MediaLocation,
  MediaData,
  TipData,
  UserContentData,
  EngagementMetrics,
  ContentFlag,
  ModerationData,
  UserContent,
  RatingSummary,
  PaginatedResult,
  QueryOptions,
  BulkResult,
  ModerationStats,
  AutoModerationResult,
} from './types';
