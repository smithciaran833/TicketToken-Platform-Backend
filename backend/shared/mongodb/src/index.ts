/**
 * Shared MongoDB Library
 * 
 * Centralized MongoDB utilities for the TicketToken platform
 * Provides connection management, CRUD operations, validation, and index management
 */

// Connection management
export {
  createMongoConnection,
  healthCheck,
  getHealthDetails,
  gracefulShutdown,
  getConnectionStats,
  waitForConnection,
  createMultipleConnections,
  closeMultipleConnections,
  parseDatabaseName,
  validateConnectionUri,
} from './connection';

// CRUD operations
export {
  insertOne,
  insertMany,
  findOne,
  findMany,
  findAll,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
  count,
  exists,
  aggregate,
  withTransaction,
  bulkWrite,
  findByIds,
  upsertOne,
  incrementField,
  pushToArray,
  pullFromArray,
} from './operations';

// Schema validation
export {
  ValidationPatterns,
  validateEmail,
  validateUrl,
  validateObjectId,
  validateUuid,
  validateDateRange,
  validateEnum,
  validateNumberRange,
  validateStringLength,
  validateArrayLength,
  validateRequired,
  validateConditionalRequired,
  validateObject,
  buildMongoJsonSchema,
  SchemaProperties,
  validateDocumentAgainstSchema,
} from './schema-validator';

export type { CustomValidator } from './schema-validator';

// Index management
export {
  ensureIndexes,
  createTTLIndex,
  createCompoundIndex,
  createTextIndex,
  create2dsphereIndex,
  createUniqueIndex,
  createSparseIndex,
  createPartialIndex,
  dropIndex,
  dropAllIndexes,
  listIndexes,
  indexExists,
  CommonIndexes,
} from './indexes';

export type { IndexConfig } from './indexes';

// Type definitions
export type {
  // Base types
  BaseContentDocument,
  MongoConnectionOptions,
  PaginationOptions,
  QueryOptions,
  PaginatedResult,
  BulkOperationResult,
  
  // Venue content types
  VenueContentType,
  VenueContent,
  VenueContentData,
  VenueSeatingSection,
  VenueSeatingRow,
  VenueSeatingItem,
  VenueMediaContent,
  VenueAmenity,
  VenueAccessibility,
  VenueParking,
  VenuePolicies,
  VenueDirections,
  
  // Event content types
  EventContentType,
  EventContent,
  EventContentData,
  EventDescription,
  EventMediaContent,
  EventVideoContent,
  EventPerformer,
  EventLineupItem,
  EventScheduleItem,
  EventSponsor,
  EventPromotional,
  
  // User content types (reviews, ratings)
  UserContentType,
  UserContentTargetType,
  UserContentStatus,
  UserContent,
  UserContentData,
  UserReviewContent,
  UserRatingContent,
  UserMediaContent,
  UserTipContent,
  EngagementMetrics,
  FlagType,
  ContentFlag,
  ModerationData,
  
  // Marketing content types
  MarketingContentType,
  MarketingContentStatus,
  MarketingContent,
  MarketingContentData,
  TargetingConfig,
  DayParting,
  SchedulingConfig,
  CreativeContent,
  EmailContent,
  PushContent,
  SocialContent,
  ABTestVariant,
  ABTestConfig,
  PerformanceMetrics,
  BudgetConfig,
  
  // Rating summary
  RatingSummary,
} from './types';

/**
 * Library version
 */
export const VERSION = '1.0.0';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  maxPoolSize: 10,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  serverSelectionTimeoutMS: 5000,
};

/**
 * Quick start helper - creates a connection with sensible defaults
 * @param uri - MongoDB connection URI
 * @returns Promise with connection
 */
export async function quickConnect(uri?: string) {
  const connectionUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/tickettoken';
  
  const { createMongoConnection } = await import('./connection');
  return createMongoConnection(connectionUri, DEFAULT_CONFIG);
}

/**
 * Export everything for convenience
 */
export default {
  VERSION,
  DEFAULT_CONFIG,
  quickConnect,
};
